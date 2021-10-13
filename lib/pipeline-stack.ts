import * as cdk from '@aws-cdk/core';
import * as cb from '@aws-cdk/aws-codebuild';
import * as cpl from '@aws-cdk/aws-codepipeline';
import * as cpla from '@aws-cdk/aws-codepipeline-actions';
import * as s3 from '@aws-cdk/aws-s3';
import * as pps from '@aws-cdk/pipelines';

import { GenericGitSource } from './generic-git-source';
import { CodeBuildSourceAction } from './codebuild-source-action';
import { DummyAppStage } from './dummy-app-stage';

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
    const cloudAssemblyArtifact = new cpl.Artifact();

    const artifactBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName: cdk.PhysicalName.GENERATE_IF_NEEDED,
      encryption: s3.BucketEncryption.KMS_MANAGED,
      blockPublicAccess: new s3.BlockPublicAccess(s3.BlockPublicAccess.BLOCK_ALL),
      removalPolicy: cdk.RemovalPolicy.DESTROY, // <--- when the stack gets destroyed this bucket now gets destroyed
      autoDeleteObjects: true, // <--- stands up a custom lambda resource
    });
    const custom_pipeline = new cpl.Pipeline(this, pipelineName, {
      pipelineName,
      artifactBucket,
      restartExecutionOnUpdate: true,
    });
    custom_pipeline.artifactBucket.grantReadWrite(project);

    const sourceAction = new CodeBuildSourceAction({
      actionName: 'Source',
      cbsourceProvider: provider,
      project: project,
      pipelineName,
      branch,
      giturl,
      sshsecretkey: keyname,
      outputs: [sourceArtifact],
    });

    const synthAction = pps.SimpleSynthAction.standardNpmSynth({
      sourceArtifact,
      cloudAssemblyArtifact,
      installCommand: 'npm i -g npm@latest',
      // buildCommand: 'ls -la && npm --version && npm install && npm run build',
      environmentVariables: {
        branch: { value: branch },
      },
    });

    const pipeline = new pps.CdkPipeline(this, 'CICD', {
      codePipeline: custom_pipeline, // <--- inject pipeline here
      cloudAssemblyArtifact,
      sourceAction,
      synthAction,
      singlePublisherPerType: true,
    });

    // this is where we add the application stages (dev, test, prod deployment stages)
    const devStage = pipeline.addApplicationStage(new DummyAppStage(this, 'Dev', { branch }));

    // could also pass in environment values like account and region
    // const devStage = pipeline.addApplicationStage(
    //   new DummyAppStage(this, 'Dev', { branch, env: { account: '12345', region: 'us-east-2' } })
    // );
    // in fact you could fetch the account number and region from secrets manager

    // these actions can be whatever. they're just dummy actions for this example
    // but it does demonstrate a way to do actions in parallel, which is nice
    const current_step_number = devStage.nextSequentialRunOrder();
    devStage.addActions(
      new pps.ShellScriptAction({
        actionName: 'CDKUnitTests',
        runOrder: current_step_number, // <--- this makes it run in parallel with the next entry
        additionalArtifacts: [sourceArtifact],
        commands: ['npm install', 'npm run build', 'npm run test'],
      })
    );
    devStage.addActions(
      new pps.ShellScriptAction({
        actionName: 'SecOps',
        runOrder: current_step_number, // <--- this makes it run in parallel with the previous entry
        additionalArtifacts: [sourceArtifact],
        commands: ["echo 'some secops commands"],
      })
    );

    const webhook = new cpl.CfnWebhook(this, 'GenericWebhook', {
      targetAction: 'Source',
      targetPipeline: custom_pipeline.pipelineName,
      targetPipelineVersion: custom_pipeline.pipelineVersion as unknown as number,
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
