import * as cdk from '@aws-cdk/core';
import { DummyAppStack } from './dummy-app-stack';

export interface IProps extends cdk.StageProps {
  branch: string;
}

export class DummyAppStage extends cdk.Stage {
  constructor(scope: cdk.Construct, id: string, props: IProps) {
    super(scope, id, props);

    new DummyAppStack(this, `DummyApp-${props.branch}`, {
      tags: {
        Application: 'DummyApp',
        Environment: id,
        Branch: props.branch,
      },
    });
  }
}
