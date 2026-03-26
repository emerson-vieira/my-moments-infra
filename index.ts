import * as pulumi from "@pulumi/pulumi";
import { dbUsername } from "./src/config";
import { vpc, publicSubnetA, publicSubnetB } from "./src/services/vpc";
import { database, dbPassword } from "./src/services/rds";
import { mediaBucket, s3AccessKey } from "./src/services/s3";

// ============================================================
// Outputs
// ============================================================

// Database
export const databaseEndpoint = database.endpoint;
export const databaseUrl = pulumi.interpolate`postgresql://${dbUsername}:${dbPassword.result}@${database.endpoint}/mymoments`;
export const databasePassword = pulumi.secret(dbPassword.result);

// S3
export const s3BucketName = mediaBucket.bucket;
export const s3AccessKeyId = s3AccessKey.id;
export const s3SecretAccessKey = s3AccessKey.secret;

// VPC (useful for future resources like ECS, Lambda, etc.)
export const vpcId = vpc.id;
export const publicSubnetIds = [publicSubnetA.id, publicSubnetB.id];

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



// // SES / SMTP
// export const smtpHost = pulumi.interpolate`email-smtp.${aws.config.region}.amazonaws.com`;
// export const smtpPort = "587";
// export const smtpUser = sesSmtpAccessKey.id;
// export const smtpPassword = sesSmtpAccessKey.sesSmtpPasswordV4;
// export const sesDkimTokens = sesDkim.dkimTokens;
// export const sesDomainVerificationToken = sesDomainIdentity.verificationToken;