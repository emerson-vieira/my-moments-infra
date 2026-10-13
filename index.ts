import * as pulumi from "@pulumi/pulumi";
import { dbUsername } from "./src/config";
import { vpc, publicSubnetA, publicSubnetB } from "./src/services/vpc";
import { database, dbPassword } from "./src/services/rds";
import { mediaBucket, s3AccessKey } from "./src/services/s3";
import { sesSmtpAccessKey } from "./src/services/ses";
import { sesDomainIdentity, sesDkim } from "./src/services/ses";
import { sesDomain } from "./src/config";
import { albumZipFunction } from "./src/services/album-zip";
import { cdnDistribution, cdnPublicKey, cdnSigningKey } from "./src/services/cloudfront";

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

// Album ZIP
export const albumZipFunctionName = albumZipFunction.name;

// CloudFront
export const cloudfrontDomain = cdnDistribution.domainName;
export const cloudfrontKeyPairId = cdnPublicKey.id;
export const cloudfrontPrivateKey = pulumi.secret(cdnSigningKey.privateKeyPem);

// SES
export const awsSesFrom = pulumi.interpolate`noreply@${sesDomain}`;
export const awsSesAccessKey = sesSmtpAccessKey.id;
export const awsSesSecretKey = sesSmtpAccessKey.secret;
export const sesVerificationToken = sesDomainIdentity.verificationToken;
export const sesDkimTokens = sesDkim.dkimTokens;

// VPC (useful for future resources like ECS, Lambda, etc.)
export const vpcId = vpc.id;
export const publicSubnetIds = [publicSubnetA.id, publicSubnetB.id];
