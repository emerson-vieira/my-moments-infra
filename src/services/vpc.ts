import * as aws from "@pulumi/aws";
import { projectName, environment } from "../config";

export const vpc = new aws.ec2.Vpc(`${projectName}-vpc`, {
  cidrBlock: "10.0.0.0/16",
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: { Name: `${projectName}-${environment}-vpc` },
});

const availabilityZones = aws.getAvailabilityZones({
  state: "available",
});

export const publicSubnetA = new aws.ec2.Subnet(`${projectName}-public-a`, {
  vpcId: vpc.id,
  cidrBlock: "10.0.1.0/24",
  availabilityZone: availabilityZones.then((azs) => azs.names[0]),
  mapPublicIpOnLaunch: true,
  tags: { Name: `${projectName}-${environment}-public-a` },
});

export const publicSubnetB = new aws.ec2.Subnet(`${projectName}-public-b`, {
  vpcId: vpc.id,
  cidrBlock: "10.0.2.0/24",
  availabilityZone: availabilityZones.then((azs) => azs.names[1]),
  mapPublicIpOnLaunch: true,
  tags: { Name: `${projectName}-${environment}-public-b` },
});

const igw = new aws.ec2.InternetGateway(`${projectName}-igw`, {
  vpcId: vpc.id,
  tags: { Name: `${projectName}-${environment}-igw` },
});

const publicRouteTable = new aws.ec2.RouteTable(`${projectName}-public-rt`, {
  vpcId: vpc.id,
  routes: [{ cidrBlock: "0.0.0.0/0", gatewayId: igw.id }],
  tags: { Name: `${projectName}-${environment}-public-rt` },
});

new aws.ec2.RouteTableAssociation(`${projectName}-public-rta-a`, {
  subnetId: publicSubnetA.id,
  routeTableId: publicRouteTable.id,
});

new aws.ec2.RouteTableAssociation(`${projectName}-public-rta-b`, {
  subnetId: publicSubnetB.id,
  routeTableId: publicRouteTable.id,
});
