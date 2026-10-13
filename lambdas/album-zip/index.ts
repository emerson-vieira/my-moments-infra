import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

interface ZipEntry {
  path: string;
  fileKey?: string;
}

interface AlbumZipEvent {
  jobId: string;
  manifestKey: string;
  zipKey: string;
  callbackUrl: string;
  callbackToken: string;
}

const Bucket = process.env.BUCKET!;
const client = new S3Client({});

async function getObject(Key: string) {
  const { Body } = await client.send(new GetObjectCommand({ Bucket, Key }));

  if (!Body) {
    throw new Error(`Objeto vazio no S3: ${Key}`);
  }

  return Body;
}

async function* streamObject(fileKey: string) {
  yield* (await getObject(fileKey)) as Readable;
}

async function buildZip(manifestKey: string, zipKey: string) {
  const entries: ZipEntry[] = JSON.parse(await (await getObject(manifestKey)).transformToString());

  const archive = new ZipArchive({ zlib: { level: 0 } });
  archive.on("error", (err: Error) => archive.destroy(err));

  let index = 0;
  const appendNext = () => {
    if (index >= entries.length) {
      archive.finalize();
      return;
    }

    const entry = entries[index];
    index += 1;

    if (!entry.fileKey) {
      archive.append(Buffer.alloc(0), { name: entry.path, type: "directory" });
      return;
    }

    const source = Readable.from(streamObject(entry.fileKey));
    source.on("error", (err) => archive.destroy(err));
    archive.append(source, { name: entry.path });
  };
  archive.on("entry", appendNext);
  appendNext();

  await new Upload({
    client,
    params: { Bucket, Key: zipKey, Body: Readable.from(archive), ContentType: "application/zip" },
    partSize: 16 * 1024 * 1024,
    queueSize: 4,
  }).done();
}

export async function handler(event: AlbumZipEvent) {
  let status = "READY";

  try {
    await buildZip(event.manifestKey, event.zipKey);
  } catch (error) {
    console.error(error);
    status = "FAILED";
  }

  const response = await fetch(event.callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${event.callbackToken}`,
    },
    body: JSON.stringify({ jobId: event.jobId, status }),
  });

  if (!response.ok) {
    throw new Error(`Callback respondeu ${response.status} para o job ${event.jobId}`);
  }
}
