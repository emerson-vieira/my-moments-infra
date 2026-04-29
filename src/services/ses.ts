import * as aws from "@pulumi/aws";
import { environment, projectName, sesDomain, sesEmails } from "../config";

export const sesDomainIdentity = new aws.ses.DomainIdentity(`${projectName}-ses-domain`, {
  domain: sesDomain,
});

export const sesDkim = new aws.ses.DomainDkim(`${projectName}-ses-dkim`, {
  domain: sesDomainIdentity.domain,
});


sesEmails.forEach((email) => {
  new aws.ses.EmailIdentity(`${projectName}-ses-email-${email}`, {
    email,
  });
});

const sesSmtpUser = new aws.iam.User(`${projectName}-ses-smtp-user`, {
  name: `${projectName}-${environment}-ses-smtp-user`,
  tags: { Name: `${projectName}-${environment}-ses-smtp-user` },
});

new aws.iam.UserPolicy(`${projectName}-ses-smtp-policy`, {
  user: sesSmtpUser.name,
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["ses:SendEmail", "ses:SendRawEmail"],
        Resource: "*",
      },
    ],
  }),
});

export const sesSmtpAccessKey = new aws.iam.AccessKey(`${projectName}-ses-smtp-key-v2`, {
  user: sesSmtpUser.name,
});