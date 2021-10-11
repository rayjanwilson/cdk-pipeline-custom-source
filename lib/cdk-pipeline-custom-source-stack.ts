import * as cdk from '@aws-cdk/core';
import * as cb from '@aws-cdk/aws-codebuild';
import * as cpl from '@aws-cdk/aws-codepipeline';
import * as cpla from '@aws-cdk/aws-codepipeline-actions';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { ThirdPartyGitAction } from './custom-action';
import { CodeBuildActionSource } from './codebuild-source-action';
import { BuildSpec, ComputeType, LinuxBuildImage } from '@aws-cdk/aws-codebuild';
import { CBSourceProvider } from './codebuild-source-provider';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';

export class CdkPipelineCustomSourceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // const branch = 'dev';
    // const giturl = 'git@ssh.dev.azure.com:v3/AWS-Flowserve/FlowIQ/FlowIQ';
    const branch = 'master';
    const giturl = 'git@github.com:rayjanwilson/cdk-pipeline-custom-source.git';
    const keyname = 'SSHKeyGithub';
    const pipelineName = `Example-Pipeline-${branch}`;
    // const { partition, region, account } = cdk.Stack.of(this);

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

    const cbsourceProvider = new CBSourceProvider(this, 'SourceProvider', {
      providerName: 'CodeBuildSource',
      version: '2',
    });

    const { git_pull_codebuild } = new ThirdPartyGitAction(this, 'TPGA', { branch, giturl, keyname });

    const sourceArtifact = new cpl.Artifact();

    const pipeline = new cpl.Pipeline(this, pipelineName, {
      pipelineName,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new CodeBuildActionSource({
              actionName: 'Source',
              cbsourceProvider,
              project: git_pull_codebuild,
              pipelineName,
              branch,
              giturl,
              sshsecretkey: keyname,
              outputs: [sourceArtifact],
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new cpla.CodeBuildAction({
              actionName: 'GenericBuild',
              input: sourceArtifact,
              project: new cb.Project(this, 'GenericBuild', {
                environment: {
                  buildImage: LinuxBuildImage.STANDARD_5_0,
                  computeType: ComputeType.SMALL,
                },
                buildSpec: BuildSpec.fromObject({
                  version: 0.2,
                  phases: {
                    install: {
                      'runtime-versions': {
                        python: 3.9,
                      },
                    },
                    build: {
                      commands: ['echo hello'],
                    },
                  },
                }),
              }),
            }),
          ],
        },
      ],
    });
  }
}
