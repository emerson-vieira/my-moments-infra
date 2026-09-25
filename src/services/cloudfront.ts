import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as tls from "@pulumi/tls";
import { projectName, environment } from "../config";
import { mediaBucket } from "./s3";

const cdnName = `${projectName}-${environment}-media`;

export const cdnSigningKey = new tls.PrivateKey(`${projectName}-cdn-signing-key`, {
  algorithm: "RSA",
  rsaBits: 2048,
});

export const cdnPublicKey = new aws.cloudfront.PublicKey(`${projectName}-cdn-public-key`, {
  name: cdnName,
  encodedKey: cdnSigningKey.publicKeyPem,
});

const cdnKeyGroup = new aws.cloudfront.KeyGroup(`${projectName}-cdn-key-group`, {
  name: cdnName,
  items: [cdnPublicKey.id],
});

const mediaOriginAccessControl = new aws.cloudfront.OriginAccessControl(
  `${projectName}-media-oac`,
  {
    name: cdnName,
    originAccessControlOriginType: "s3",
    signingBehavior: "always",
    signingProtocol: "sigv4",
  },
);

const mediaCachePolicy = new aws.cloudfront.CachePolicy(`${projectName}-media-cache-policy`, {
  name: cdnName,
  minTtl: 0,
  defaultTtl: 86400,
  maxTtl: 31536000,
  parametersInCacheKeyAndForwardedToOrigin: {
    cookiesConfig: { cookieBehavior: "none" },
    headersConfig: { headerBehavior: "none" },
    queryStringsConfig: {
      queryStringBehavior: "whitelist",
      queryStrings: { items: ["response-content-disposition"] },
    },
    enableAcceptEncodingGzip: true,
    enableAcceptEncodingBrotli: true,
  },
});

const simpleCorsPolicy = aws.cloudfront.getResponseHeadersPolicyOutput({
  name: "Managed-SimpleCORS",
});

export const cdnDistribution = new aws.cloudfront.Distribution(`${projectName}-media-cdn`, {
  enabled: true,
  comment: cdnName,
  priceClass: "PriceClass_100",
  origins: [
    {
      originId: "media",
      domainName: mediaBucket.bucketRegionalDomainName,
      originAccessControlId: mediaOriginAccessControl.id,
    },
  ],
  defaultCacheBehavior: {
    targetOriginId: "media",
    allowedMethods: ["GET", "HEAD"],
    cachedMethods: ["GET", "HEAD"],
    viewerProtocolPolicy: "redirect-to-https",
    compress: true,
    cachePolicyId: mediaCachePolicy.id,
    responseHeadersPolicyId: simpleCorsPolicy.apply((policy) => policy.id!),
    trustedKeyGroups: [cdnKeyGroup.id],
  },
  restrictions: { geoRestriction: { restrictionType: "none" } },
  viewerCertificate: { cloudfrontDefaultCertificate: true },
  tags: { Name: cdnName },
});

new aws.s3.BucketPolicy(`${projectName}-media-cdn-policy`, {
  bucket: mediaBucket.id,
  policy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "cloudfront.amazonaws.com" },
        Action: "s3:GetObject",
        Resource: pulumi.interpolate`${mediaBucket.arn}/*`,
        Condition: { StringEquals: { "AWS:SourceArn": cdnDistribution.arn } },
      },
    ],
  }),
});
