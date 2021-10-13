import * as cdk from '@aws-cdk/core';

export class DummyAppStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // this is where you'd put your lambda, api gateway, whatever
    this.exportValue('hello', { name: 'greeting' });
  }
}
