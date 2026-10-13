import * as esbuild from "esbuild";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { projectName, environment } from "../config";
import { mediaBucket, s3User } from "./s3";

const functionName = `${projectName}-${environment}-album-export`;

esbuild.buildSync({
  entryPoints: ["lambdas/album-export/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "lambdas/album-export/dist/index.mjs",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

const albumExportRole = new aws.iam.Role(`${projectName}-album-export-role`, {
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

const albumExportBasicExecution = new aws.iam.RolePolicyAttachment(
  `${projectName}-album-export-basic-execution`,
  {
    role: albumExportRole.name,
    policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
  },
);

new aws.iam.RolePolicy(`${projectName}-album-export-s3-policy`, {
  role: albumExportRole.id,
  policy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: pulumi.interpolate`${mediaBucket.arn}/*`,
      },
    ],
  }),
});

const albumExportLogGroup = new aws.cloudwatch.LogGroup(`${projectName}-album-export-logs`, {
  name: `/aws/lambda/${functionName}`,
  retentionInDays: 14,
});

export const albumExportFunction = new aws.lambda.Function(
  `${projectName}-album-export`,
  {
    name: functionName,
    role: albumExportRole.arn,
    runtime: aws.lambda.Runtime.NodeJS22dX,
    handler: "index.handler",
    memorySize: 2048,
    timeout: 900,
    code: new pulumi.asset.FileArchive("./lambdas/album-export/dist"),
    environment: { variables: { BUCKET: mediaBucket.bucket } },
  },
  { dependsOn: [albumExportLogGroup, albumExportBasicExecution] },
);

new aws.lambda.FunctionEventInvokeConfig(`${projectName}-album-export-invoke-config`, {
  functionName: albumExportFunction.name,
  maximumRetryAttempts: 0,
});

new aws.iam.UserPolicy(`${projectName}-s3-user-album-export-invoke`, {
  user: s3User.name,
  policy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "lambda:InvokeFunction",
        Resource: albumExportFunction.arn,
      },
    ],
  }),
});
