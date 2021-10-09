import * as cdk from '@aws-cdk/core';
import * as cb from '@aws-cdk/aws-codebuild';
import * as cpl from '@aws-cdk/aws-codepipeline';
import * as cpla from '@aws-cdk/aws-codepipeline-actions';
import { ThirdPartyGitAction } from './custom-action';

export class CdkPipelineCustomSourceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const branch = 'dev';
    const giturl = 'git@ssh.dev.azure.com:v3/AWS-Flowserve/FlowIQ/FlowIQ';
    const pipelineName = `Example-Pipeline-${branch}`;

    const webhook = new cpl.CfnWebhook(this, 'Webhook', {
      targetAction: 'Source',
      targetPipeline: pipelineName,
      targetPipelineVersion: 1,
      filters: [
        {
          jsonPath: '$.ref',
          matchEquals: `refs/heads/${branch}`,
        },
      ],
      authentication: 'UNAUTHENTICATED',
      authenticationConfiguration: {},
      registerWithThirdParty: false,
    });

    this.exportValue(webhook.attrUrl, { name: 'WebhookUrl' });

    // const source_artifact = new Artifact();
    // const { bucketName } = source_artifact;
    // this.exportValue(bucketName, { name: 'ArtifactBucketName' });

    const custom_source_action = new ThirdPartyGitAction(this, 'TPGA', { branch, giturl });
  }
}
