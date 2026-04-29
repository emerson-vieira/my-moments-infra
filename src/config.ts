import * as pulumi from "@pulumi/pulumi";

export const config = new pulumi.Config();
export const projectName = "my-moments";
export const environment = pulumi.getStack(); // dev, staging, prod
export const dbUsername = config.require("dbUsername");
export const sesDomain = config.require("sesDomain");
export const sesEmails = config.getObject<string[]>("sesEmails") ?? [];
