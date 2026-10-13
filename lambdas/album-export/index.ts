import { Readable } from "node:stream";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

interface ExportEntry {
  path: string;
  fileKey?: string;
}

interface AlbumExportEvent {
  jobId: string;
  accessToken: string;
  manifestKey: string;
  folderName: string;
  startIndex: number;
  destination: string | null;
  callbackUrl: string;
  callbackToken: string;
}

interface LambdaContext {
  getRemainingTimeInMillis(): number;
}

type FailureReason = "AUTH" | "NO_SPACE";

interface ExportResult {
  status: "DONE" | "PARTIAL" | "FAILED";
  reason?: FailureReason;
  nextIndex: number;
  failedFiles: number;
  destination: string | null;
}

class FatalError extends Error {
  constructor(readonly reason: FailureReason) {
    super(reason);
  }
}

class TransientError extends Error {}

class OutOfTimeError extends Error {}

const Bucket = process.env.BUCKET!;
const client = new S3Client({});

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const ROOT_FOLDER_NAME = "MyMoments";
const SAFETY_MARGIN_MS = 60_000;
const MIN_BYTES_PER_MS = (5 * 1024 * 1024) / 1000;
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const isTransient = error instanceof TransientError || error instanceof TypeError;

      if (!isTransient || attempt === MAX_ATTEMPTS) {
        throw error;
      }

      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
}

async function driveFetch(accessToken: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
  });

  if (response.ok) {
    return response;
  }

  const body = await response.text();

  if (response.status === 401) {
    throw new FatalError("AUTH");
  }

  if (body.includes("storageQuotaExceeded")) {
    throw new FatalError("NO_SPACE");
  }

  if (response.status === 429 || response.status >= 500 || body.includes("ateLimitExceeded")) {
    throw new TransientError(`Drive respondeu ${response.status}: ${body}`);
  }

  throw new Error(`Drive respondeu ${response.status}: ${body}`);
}

async function listFolders(accessToken: string, parentId: string) {
  const folders = new Map<string, string>();
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: "1000",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await driveFetch(accessToken, `${DRIVE_FILES_URL}?${params}`);
    const data: { nextPageToken?: string; files: { id: string; name: string }[] } =
      await response.json();

    for (const folder of data.files) {
      folders.set(folder.name, folder.id);
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return folders;
}

async function createFolder(accessToken: string, name: string, parentId: string) {
  const response = await driveFetch(accessToken, `${DRIVE_FILES_URL}?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] }),
  });
  const folder: { id: string } = await response.json();

  return folder.id;
}

async function createAlbumFolder(accessToken: string, folderName: string) {
  const rootFolders = await listFolders(accessToken, "root");
  const rootId =
    rootFolders.get(ROOT_FOLDER_NAME) ?? (await createFolder(accessToken, ROOT_FOLDER_NAME, "root"));

  return createFolder(accessToken, folderName, rootId);
}

async function uploadFile(
  accessToken: string,
  context: LambdaContext,
  fileKey: string,
  name: string,
  parentId: string,
) {
  const object = await client.send(new GetObjectCommand({ Bucket, Key: fileKey }));
  const body = object.Body as Readable;
  const size = object.ContentLength ?? 0;
  const contentType = object.ContentType ?? "application/octet-stream";

  try {
    if (context.getRemainingTimeInMillis() < SAFETY_MARGIN_MS + size / MIN_BYTES_PER_MS) {
      throw new OutOfTimeError();
    }

    const session = await driveFetch(accessToken, `${DRIVE_UPLOAD_URL}?uploadType=resumable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify({ name, parents: [parentId] }),
    });
    const uploadUrl = session.headers.get("location");

    if (!uploadUrl) {
      throw new TransientError("Drive não devolveu a URL da sessão de upload");
    }

    await driveFetch(accessToken, uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType, "Content-Length": String(size) },
      body: Readable.toWeb(body) as ReadableStream,
      duplex: "half",
    } as RequestInit);
  } finally {
    body.destroy();
  }
}

async function exportEntries(event: AlbumExportEvent, context: LambdaContext): Promise<ExportResult> {
  const { accessToken } = event;
  const manifest = await client.send(new GetObjectCommand({ Bucket, Key: event.manifestKey }));
  const entries: ExportEntry[] = JSON.parse(await manifest.Body!.transformToString());

  const destination =
    event.destination ?? (await withRetry(() => createAlbumFolder(accessToken, event.folderName)));
  const folders = event.destination
    ? await withRetry(() => listFolders(accessToken, destination))
    : new Map<string, string>();

  const ensureFolder = async (name: string) => {
    const existing = folders.get(name);

    if (existing) {
      return existing;
    }

    const id = await withRetry(() => createFolder(accessToken, name, destination));
    folders.set(name, id);

    return id;
  };

  let failedFiles = 0;

  for (let index = event.startIndex; index < entries.length; index += 1) {
    const { path, fileKey } = entries[index];

    try {
      if (!fileKey) {
        await ensureFolder(path);
        continue;
      }

      const slash = path.lastIndexOf("/");
      const parentId = slash < 0 ? destination : await ensureFolder(path.slice(0, slash));

      await withRetry(() =>
        uploadFile(accessToken, context, fileKey, path.slice(slash + 1), parentId),
      );
    } catch (error) {
      if (error instanceof OutOfTimeError && index > event.startIndex) {
        return { status: "PARTIAL", nextIndex: index, failedFiles, destination };
      }

      if (error instanceof FatalError) {
        return { status: "FAILED", reason: error.reason, nextIndex: index, failedFiles, destination };
      }

      console.error(`Falha ao enviar ${path} no job ${event.jobId}:`, error);
      failedFiles += 1;
    }
  }

  return { status: "DONE", nextIndex: entries.length, failedFiles, destination };
}

export async function handler(event: AlbumExportEvent, context: LambdaContext) {
  let result: ExportResult = {
    status: "FAILED",
    nextIndex: event.startIndex,
    failedFiles: 0,
    destination: event.destination,
  };

  try {
    result = await exportEntries(event, context);
  } catch (error) {
    console.error(`Erro no job ${event.jobId}:`, error);

    if (error instanceof FatalError) {
      result.reason = error.reason;
    }
  }

  const response = await fetch(event.callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${event.callbackToken}`,
    },
    body: JSON.stringify({ jobId: event.jobId, startIndex: event.startIndex, ...result }),
  });

  if (!response.ok) {
    throw new Error(`Callback respondeu ${response.status} para o job ${event.jobId}`);
  }
}
