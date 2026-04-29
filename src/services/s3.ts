import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { projectName, environment } from "../config";

export const mediaBucket = new aws.s3.Bucket(`${projectName}-media`, {
  bucket: `${projectName}-${environment}-bucket`,
  tags: { Name: `${projectName}-${environment}-media` },
});

new aws.s3.BucketPublicAccessBlock(`${projectName}-media-public-access`, {
  bucket: mediaBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

new aws.s3.BucketCorsConfiguration(`${projectName}-media-cors`, {
  bucket: mediaBucket.id,
  corsRules: [
    {
      allowedHeaders: ["*"],
      allowedMethods: ["GET", "PUT", "POST", "DELETE"],
      allowedOrigins: ["*"],
      exposeHeaders: ["ETag"],
      maxAgeSeconds: 3600,
    },
  ],
});

new aws.s3.BucketLifecycleConfiguration(`${projectName}-media-lifecycle`, {
  bucket: mediaBucket.id,
  rules: [
    {
      id: "transition-to-ia",
      status: "Enabled",
      transitions: [
        {
          days: 90,
          storageClass: "STANDARD_IA",
        },
      ],
    },
  ],
});

new aws.s3.BucketServerSideEncryptionConfiguration(`${projectName}-media-encryption`, {
  bucket: mediaBucket.id,
  rules: [
    {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "AES256",
      },
    },
  ],
});

// ============================================================
// IAM User for S3 Access
// ============================================================

const s3User = new aws.iam.User(`${projectName}-s3-user`, {
  name: `${projectName}-${environment}-s3-user`,
  tags: { Name: `${projectName}-${environment}-s3-user` },
});

new aws.iam.UserPolicy(`${projectName}-s3-user-policy`, {
  user: s3User.name,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ],
        "Resource": [
          "${mediaBucket.arn}",
          "${mediaBucket.arn}/*"
        ]
      }
    ]
  }`,
});

export const s3AccessKey = new aws.iam.AccessKey(`${projectName}-s3-access-key-v2`, {
  user: s3User.name,
});