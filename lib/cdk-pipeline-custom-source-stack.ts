import * as cdk from '@aws-cdk/core';
import * as cb from '@aws-cdk/aws-codebuild'
import * as cpl from '@aws-cdk/aws-codepipeline'
import * as cpla from '@aws-cdk/aws-codepipeline-actions'

export class CdkPipelineCustomSourceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const branch = 'dev'
    const pipelineName = `Example-Pipeline-${branch}`
    // const dev_pipeline = new cpl.Pipeline(this, `Pipeline-${branch}`, {
    //   pipelineName
    // })

    // The code that defines your stack goes here
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

    this.exportValue(webhook.attrUrl, {name: 'WebhookUrl'})
  }
}
