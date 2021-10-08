#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkPipelineCustomSourceStack } from '../lib/cdk-pipeline-custom-source-stack';

const app = new cdk.App();
new CdkPipelineCustomSourceStack(app, 'CdkPipelineCustomSourceStack');
