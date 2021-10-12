import * as cdk from '@aws-cdk/core';
import * as cb from '@aws-cdk/aws-codebuild';
import * as cpl from '@aws-cdk/aws-codepipeline';
import * as cpla from '@aws-cdk/aws-codepipeline-actions';

import { GenericGitSource } from './generic-git-source';
import { CodeBuildSourceAction } from './codebuild-source-action';

export class CustomSourceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const branch = 'master';
    const giturl = 'git@github.com:rayjanwilson/cdk-pipeline-custom-source.git';
    const keyname = 'SSHKeyGithub';
    const buildspec_location = `${__dirname}/source_action_buildspec.yml`;
    const pipelineName = `Example-Pipeline-${branch}`;

    const { project, provider } = new GenericGitSource(this, 'GenericGitSource', {
      branch,
      giturl,
      keyname,
      buildspec_location,
      providerName: 'GenericGitSource',
    });

    const sourceArtifact = new cpl.Artifact();
    const pipeline = new cpl.Pipeline(this, pipelineName, {
      pipelineName,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new CodeBuildSourceAction({
              actionName: 'Source',
              cbsourceProvider: provider,
              project: project,
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
                  privileged: true,
                },
                buildSpec: cb.BuildSpec.fromObject({
                  version: 0.2,
                  phases: {
                    install: {
                      'runtime-versions': {
                        python: 3.9,
                        nodejs: 14,
                      },
                    },
                    pre_build: {
                      commands: [
                        'npm i -g npm@latest',
                        'npm i -g cdk',
                        'node --version',
                        'npm --version',
                        'cdk -version',
                      ],
                    },
                    build: {
                      commands: ['ls -la', 'npm ci', 'cdk synth'],
                    },
                  },
                }),
              }),
            }),
          ],
        },
      ],
    });
    pipeline.artifactBucket.grantReadWrite(project);

    const webhook = new cpl.CfnWebhook(this, 'GenericWebhook', {
      targetAction: 'Source',
      targetPipeline: pipeline.pipelineName,
      targetPipelineVersion: pipeline.pipelineVersion as unknown as number,
      filters: [
        {
          jsonPath: '$.ref', // catches for most git sources
          matchEquals: `refs/heads/${branch}`,
        },
        {
          jsonPath: '$.resource.refUpdates..name', // catches specifically for azure devops
          matchEquals: `refs/heads/${branch}`,
        },
      ],
      authentication: 'UNAUTHENTICATED',
      authenticationConfiguration: {},
      registerWithThirdParty: false,
    });
    this.exportValue(webhook.attrUrl, { name: 'WebhookUrl' });
  }
}
