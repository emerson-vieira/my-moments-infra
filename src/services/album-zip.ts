import * as esbuild from "esbuild";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { projectName, environment } from "../config";
import { mediaBucket, s3User } from "./s3";

const functionName = `${projectName}-${environment}-album-zip`;

esbuild.buildSync({
  entryPoints: ["lambdas/album-zip/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "lambdas/album-zip/dist/index.mjs",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

const albumZipRole = new aws.iam.Role(`${projectName}-album-zip-role`, {
  name: `${functionName}-role`,
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

const albumZipBasicExecution = new aws.iam.RolePolicyAttachment(
  `${projectName}-album-zip-basic-execution`,
  {
    role: albumZipRole.name,
    policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
  },
);

new aws.iam.RolePolicy(`${projectName}-album-zip-s3-policy`, {
  role: albumZipRole.id,
  policy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: pulumi.interpolate`${mediaBucket.arn}/*`,
      },
      {
        Effect: "Allow",
        Action: ["s3:PutObject", "s3:AbortMultipartUpload"],
        Resource: pulumi.interpolate`${mediaBucket.arn}/tmp-downloads/*`,
      },
    ],
  }),
});

const albumZipLogGroup = new aws.cloudwatch.LogGroup(`${projectName}-album-zip-logs`, {
  name: `/aws/lambda/${functionName}`,
  retentionInDays: 14,
});

export const albumZipFunction = new aws.lambda.Function(
  `${projectName}-album-zip`,
  {
    name: functionName,
    role: albumZipRole.arn,
    runtime: aws.lambda.Runtime.NodeJS22dX,
    handler: "index.handler",
    memorySize: 2048,
    timeout: 900,
    code: new pulumi.asset.FileArchive("./lambdas/album-zip/dist"),
    environment: { variables: { BUCKET: mediaBucket.bucket } },
  },
  { dependsOn: [albumZipLogGroup, albumZipBasicExecution] },
);

new aws.lambda.FunctionEventInvokeConfig(`${projectName}-album-zip-invoke-config`, {
  functionName: albumZipFunction.name,
  maximumRetryAttempts: 0,
});

new aws.iam.UserPolicy(`${projectName}-s3-user-album-zip-invoke`, {
  user: s3User.name,
  policy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "lambda:InvokeFunction",
        Resource: albumZipFunction.arn,
      },
    ],
  }),
});
