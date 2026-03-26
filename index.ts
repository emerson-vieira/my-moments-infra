import * as pulumi from "@pulumi/pulumi";
import { dbUsername } from "./src/config";
import { vpc, publicSubnetA, publicSubnetB } from "./src/services/vpc";
import { database, dbPassword } from "./src/services/rds";

// ============================================================
// Outputs
// ============================================================

// Database
export const databaseEndpoint = database.endpoint;
export const databaseUrl = pulumi.interpolate`postgresql://${dbUsername}:${dbPassword.result}@${database.endpoint}/mymoments`;
export const databasePassword = pulumi.secret(dbPassword.result);

// VPC (useful for future resources like ECS, Lambda, etc.)
export const vpcId = vpc.id;
export const publicSubnetIds = [publicSubnetA.id, publicSubnetB.id];


// // ============================================================
// // S3 Bucket
// // ============================================================

// const mediaBucket = new aws.s3.Bucket(`${projectName}-media`, {
//   bucket: `${projectName}-${environment}-bucket`,
//   tags: { Name: `${projectName}-${environment}-media` },
// });

// new aws.s3.BucketPublicAccessBlock(`${projectName}-media-public-access`, {
//   bucket: mediaBucket.id,
//   blockPublicAcls: true,
//   blockPublicPolicy: true,
//   ignorePublicAcls: true,
//   restrictPublicBuckets: true,
// });

// new aws.s3.BucketCorsConfiguration(`${projectName}-media-cors`, {
//   bucket: mediaBucket.id,
//   corsRules: [
//     {
//       allowedHeaders: ["*"],
//       allowedMethods: ["GET", "PUT", "POST"],
//       allowedOrigins: ["*"],
//       exposeHeaders: ["ETag"],
//       maxAgeSeconds: 3600,
//     },
//   ],
// });

// new aws.s3.BucketLifecycleConfiguration(`${projectName}-media-lifecycle`, {
//   bucket: mediaBucket.id,
//   rules: [
//     {
//       id: "transition-to-ia",
//       status: "Enabled",
//       transitions: [
//         {
//           days: 90,
//           storageClass: "STANDARD_IA",
//         },
//       ],
//     },
//   ],
// });

// new aws.s3.BucketServerSideEncryptionConfiguration(`${projectName}-media-encryption`, {
//   bucket: mediaBucket.id,
//   rules: [
//     {
//       applyServerSideEncryptionByDefault: {
//         sseAlgorithm: "AES256",
//       },
//     },
//   ],
// });

// // ============================================================
// // IAM User for S3 Access
// // ============================================================

// const s3User = new aws.iam.User(`${projectName}-s3-user`, {
//   name: `${projectName}-${environment}-s3-user`,
//   tags: { Name: `${projectName}-${environment}-s3-user` },
// });

// const s3UserPolicy = new aws.iam.UserPolicy(`${projectName}-s3-user-policy`, {
//   user: s3User.name,
//   policy: pulumi.interpolate`{
//     "Version": "2012-10-17",
//     "Statement": [
//       {
//         "Effect": "Allow",
//         "Action": [
//           "s3:GetObject",
//           "s3:PutObject",
//           "s3:DeleteObject",
//           "s3:ListBucket"
//         ],
//         "Resource": [
//           "${mediaBucket.arn}",
//           "${mediaBucket.arn}/*"
//         ]
//       }
//     ]
//   }`,
// });

// const s3AccessKey = new aws.iam.AccessKey(`${projectName}-s3-access-key`, {
//   user: s3User.name,
// });

// // ============================================================
// // SES (Simple Email Service)
// // ============================================================

// const sesDomainIdentity = new aws.ses.DomainIdentity(`${projectName}-ses-domain`, {
//   domain: sesDomain,
// });

// const sesDkim = new aws.ses.DomainDkim(`${projectName}-ses-dkim`, {
//   domain: sesDomainIdentity.domain,
// });

// const sesSmtpUser = new aws.iam.User(`${projectName}-ses-smtp-user`, {
//   name: `${projectName}-${environment}-ses-smtp-user`,
//   tags: { Name: `${projectName}-${environment}-ses-smtp-user` },
// });

// const sesSmtpPolicy = new aws.iam.UserPolicy(`${projectName}-ses-smtp-policy`, {
//   user: sesSmtpUser.name,
//   policy: JSON.stringify({
//     Version: "2012-10-17",
//     Statement: [
//       {
//         Effect: "Allow",
//         Action: ["ses:SendEmail", "ses:SendRawEmail"],
//         Resource: "*",
//       },
//     ],
//   }),
// });

// const sesSmtpAccessKey = new aws.iam.AccessKey(`${projectName}-ses-smtp-key`, {
//   user: sesSmtpUser.name,
// });

// ============================================================
// Outputs
// ============================================================

// // S3
// export const s3BucketName = mediaBucket.bucket;
// export const s3Region = "us-east-1";
// export const s3AccessKeyId = s3AccessKey.id;
// export const s3SecretAccessKey = s3AccessKey.secret;

// // SES / SMTP
// export const smtpHost = pulumi.interpolate`email-smtp.${aws.config.region}.amazonaws.com`;
// export const smtpPort = "587";
// export const smtpUser = sesSmtpAccessKey.id;
// export const smtpPassword = sesSmtpAccessKey.sesSmtpPasswordV4;
// export const sesDkimTokens = sesDkim.dkimTokens;
// export const sesDomainVerificationToken = sesDomainIdentity.verificationToken;