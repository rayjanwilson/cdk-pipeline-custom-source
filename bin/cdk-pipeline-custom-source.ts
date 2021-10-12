#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CustomSourceStack } from '../lib/custom-source-stack';

const app = new cdk.App();
new CustomSourceStack(app, 'CustomSourceStack');
