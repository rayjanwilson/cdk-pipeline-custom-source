import 'source-map-support/register';
import 'dotenv/config';
import * as cdk from '@aws-cdk/core';
import { CustomSourceStack } from '../lib/custom-source-stack';

const app = new cdk.App();
new CustomSourceStack(app, 'CustomSourceStack');
