import * as cdk from '@aws-cdk/core';
import * as cb from '@aws-cdk/aws-codebuild';
import * as cpl from '@aws-cdk/aws-codepipeline';
import * as cpla from '@aws-cdk/aws-codepipeline-actions';

import { GenericGitSourceAction } from './custom-action';
import { CodeBuildActionSource } from './codebuild-source-action';
import { CBSourceProvider } from './codebuild-source-provider';

export class CustomSourceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // const branch = 'dev';
    // const giturl = 'git@ssh.dev.azure.com:v3/AWS-Flowserve/FlowIQ/FlowIQ';
    const branch = 'master';
    const giturl = 'git@github.com:rayjanwilson/cdk-pipeline-custom-source.git';
    const keyname = 'SSHKeyGithub';
    const buildspecname = 'source_action_buildspec.yml';
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
    this.exportValue(webhook.attrUrl, { name: 'NewWebhookUrl' });

    const cbsourceProvider = new CBSourceProvider(this, 'GenericGitSourceProvider', {
      providerName: 'GenericGitSource',
      // version: '2',
    });

    const { git_pull_codebuild } = new GenericGitSourceAction(this, 'GenericSource', {
      branch,
      giturl,
      keyname,
      buildspecname,
      providerName: cbsourceProvider.providerName,
    });

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
                  buildImage: cb.LinuxBuildImage.STANDARD_5_0,
                  computeType: cb.ComputeType.SMALL,
                },
                buildSpec: cb.BuildSpec.fromObject({
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

    pipeline.artifactBucket.grantReadWrite(git_pull_codebuild);
  }
}
