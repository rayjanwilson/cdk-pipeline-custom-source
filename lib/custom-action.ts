import {
  Project,
  LinuxBuildImage,
  BuildSpec,
  BuildEnvironmentVariableType,
  ComputeType,
  Artifacts,
} from '@aws-cdk/aws-codebuild';
import { PolicyStatement, Effect, ServicePrincipal } from '@aws-cdk/aws-iam';
import { Runtime } from '@aws-cdk/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python';
import { Construct, Duration, Stack } from '@aws-cdk/core';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import * as cpl from '@aws-cdk/aws-codepipeline';
import * as events from '@aws-cdk/aws-events';
import * as s3 from '@aws-cdk/aws-s3';

export interface IProps {
  branch: string;
  giturl: string;
  // artifact: Artifact;
}

export class ThirdPartyGitAction extends Construct {
  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id);

    const { branch, giturl } = props;
    const { partition, region, account } = Stack.of(this);

    const doc = readFileSync(`${__dirname}/third_party_custom_action_buildspec.yml`, 'utf8');
    const build_spec = load(doc) as { [key: string]: any };

    const artifact = new s3.Bucket(this, 'SourceArtifact');

    const git_pull_codebuild = new Project(this, 'TPGA', {
      environment: {
        buildImage: LinuxBuildImage.STANDARD_5_0,
        computeType: ComputeType.SMALL,
      },
      buildSpec: BuildSpec.fromObjectToYaml(build_spec),
      environmentVariables: {
        SSHSecretKeyName: {
          value: 'SSHKeyAzure',
          type: BuildEnvironmentVariableType.PLAINTEXT,
        },
        Branch: {
          value: branch,
        },
        GitUrl: {
          value: giturl,
        },
      },
      artifacts: Artifacts.s3({
        bucket: artifact,
        includeBuildId: true,
        packageZip: true,
      }),
    });
    git_pull_codebuild.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`arn:${partition}:secretsmanager:${region}:${account}:secret:*`],
      })
    );

    const custom_source_action = new cpl.CfnCustomActionType(this, 'CAT', {
      category: 'Source',
      settings: {
        entityUrlTemplate:
          'https://docs.aws.amazon.com/codepipeline/latest/userguide/actions-create-custom-action.html',
        executionUrlTemplate:
          'https://docs.aws.amazon.com/codepipeline/latest/userguide/actions-create-custom-action.html',
      },
      configurationProperties: [
        {
          name: 'Branch',
          required: true,
          key: false,
          secret: false,
          queryable: false,
          description: 'Git branch to pull',
          type: 'String',
        },
        {
          name: 'GitUrl',
          required: true,
          key: false,
          secret: false,
          queryable: false,
          description: 'SSH git clone URL',
          type: 'String',
        },
        {
          name: 'PipelineName',
          required: true,
          key: false,
          secret: false,
          queryable: true,
          description: 'Name of CodePipeline',
          type: 'String',
        },
        {
          name: 'SSHSecretKeyName',
          required: true,
          key: false,
          secret: false,
          queryable: false,
          description: 'Name of the Secret for SSH private Key',
          type: 'String',
        },
      ],
      inputArtifactDetails: {
        maximumCount: 0,
        minimumCount: 0,
      },
      outputArtifactDetails: {
        maximumCount: 1,
        minimumCount: 1,
      },
      provider: 'AzureDevOps',
      version: '1',
    });

    const custom_action_function = new PythonFunction(this, 'CodePipelineCustomAction', {
      entry: `${__dirname}/lambdas/`, // required
      index: 'third_party_git_action.py',
      handler: 'lambda_handler',
      environment: {
        LOG_LEVEL: 'DEBUG',
        GitPullCodeBuild: git_pull_codebuild.projectName,
      },
      runtime: Runtime.PYTHON_3_7,
      timeout: Duration.minutes(15),
    });
    custom_action_function.grantInvoke(new ServicePrincipal('events.amazonaws.com'));
    custom_action_function.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'codepipeline:PollForJobs',
          'codepipeline:AcknowledgeJob',
          'codepipeline:GetJobDetails',
          'codepipeline:PutJobSuccessResult',
          'codepipeline:PutJobFailureResult',
          'codepipeline:StopPipelineExecution',
        ],
        resources: ['*'],
      })
    );
    custom_action_function.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'],
        resources: [git_pull_codebuild.projectArn],
      })
    );

    const CodePielineCustomActionTrigger = new events.CfnRule(this, 'TriggerRule', {
      state: 'ENABLED',
      description: 'Handles the AzureDevOps custom provider for CodePipeline',
      eventPattern: {
        source: ['aws.codepipeline'],
        'detail-type': ['CodePipeline Action Execution State Change'],
        detail: {
          type: {
            provider: ['AzureDevOps'],
            category: ['Source'],
            owner: ['Custom'],
          },
          state: ['STARTED'],
        },
      },
      targets: [
        {
          arn: custom_action_function.functionArn,
          id: 'CodePipelineCustomActionTrigger',
        },
      ],
    });
  }
}