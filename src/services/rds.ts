import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";
import { projectName, environment, dbUsername } from "../config";
import { vpc, publicSubnetA, publicSubnetB } from "./vpc";

export const dbPassword = new random.RandomPassword(`${projectName}-db-password-v2`, {
  length: 32,
  special: false,
});

const rdsSecurityGroup = new aws.ec2.SecurityGroup(`${projectName}-rds-sg`, {
  vpcId: vpc.id,
  description: "Allow PostgreSQL inbound traffic",
  ingress: [
    {
      protocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      cidrBlocks: ["0.0.0.0/0"],
      description: "PostgreSQL external access",
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: { Name: `${projectName}-${environment}-rds-sg` },
});

const dbSubnetGroup = new aws.rds.SubnetGroup(`${projectName}-db-subnet`, {
  subnetIds: [publicSubnetA.id, publicSubnetB.id],
  tags: { Name: `${projectName}-${environment}-db-subnet` },
});

export const database = new aws.rds.Instance(`${projectName}-db`, {
  engine: "postgres",
  engineVersion: "16.4",
  instanceClass: "db.t3.micro",
  allocatedStorage: 20,
  maxAllocatedStorage: 50,
  dbName: "mymoments",
  username: dbUsername,
  password: dbPassword.result,
  dbSubnetGroupName: dbSubnetGroup.name,
  vpcSecurityGroupIds: [rdsSecurityGroup.id],
  publiclyAccessible: true,
  skipFinalSnapshot: environment === "dev",
  finalSnapshotIdentifier: environment !== "dev" ? `${projectName}-${environment}-final-snapshot` : undefined,
  backupRetentionPeriod: environment === "dev" ? 1 : 7,
  storageEncrypted: true,
  tags: { Name: `${projectName}-${environment}-db` },
});
