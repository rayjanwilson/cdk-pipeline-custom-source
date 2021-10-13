import * as cdk from '@aws-cdk/core';
import * as cb from '@aws-cdk/aws-codebuild';
import * as cpl from '@aws-cdk/aws-codepipeline';
import * as cpla from '@aws-cdk/aws-codepipeline-actions';
import * as s3 from '@aws-cdk/aws-s3';

import { GenericGitSource } from './generic-git-source';
import { CodeBuildSourceAction } from './codebuild-source-action';

export class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const branch = process.env.BRANCH!; //'master';
    const giturl = process.env.GITURL!; //'git@github.com:rayjanwilson/cdk-pipeline-custom-source.git';
    const keyname = process.env.SSHKEYNAME!; //'SSHKeyGithub';
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
    const artifactBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName: cdk.PhysicalName.GENERATE_IF_NEEDED,
      encryption: s3.BucketEncryption.KMS_MANAGED,
      blockPublicAccess: new s3.BlockPublicAccess(s3.BlockPublicAccess.BLOCK_ALL),
      removalPolicy: cdk.RemovalPolicy.DESTROY, // <--- when the stack gets destroyed this bucket now gets destroyed
      autoDeleteObjects: true, // <--- stands up a custom lambda resource that empties the bucket before removal
    });
    const pipeline = new cpl.Pipeline(this, pipelineName, {
      pipelineName,
      artifactBucket,
      restartExecutionOnUpdate: true,
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
