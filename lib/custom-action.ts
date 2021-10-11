/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Project,
  LinuxBuildImage,
  BuildSpec,
  BuildEnvironmentVariableType,
  ComputeType,
  Artifacts,
  IProject,
} from '@aws-cdk/aws-codebuild';
import { PolicyStatement, Effect, ServicePrincipal } from '@aws-cdk/aws-iam';
import { IFunction, Runtime } from '@aws-cdk/aws-lambda';
import { Construct, Duration, Stack } from '@aws-cdk/core';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import * as s3 from '@aws-cdk/aws-s3';
import * as events from '@aws-cdk/aws-events';
import { PythonFunction } from '@aws-cdk/aws-lambda-python';

export interface IProps {
  branch: string;
  giturl: string;
  keyname: string;
}

export class GenericGitSourceAction extends Construct {
  public readonly custom_action_function: IFunction;
  public readonly git_pull_codebuild: IProject;
  public readonly CodePipelineCustomActionTrigger: events.CfnRule;

  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id);

    const { branch, giturl, keyname } = props;
    const { partition, region, account } = Stack.of(this);

    const doc = readFileSync(`${__dirname}/third_party_custom_action_buildspec.yml`, 'utf8');
    const build_spec = load(doc) as { [key: string]: any };

    const artifact = new s3.Bucket(this, 'SourceArtifact');

    this.git_pull_codebuild = new Project(this, 'TPGA', {
      environment: {
        buildImage: LinuxBuildImage.STANDARD_5_0,
        computeType: ComputeType.SMALL,
      },
      buildSpec: BuildSpec.fromObjectToYaml(build_spec),
      environmentVariables: {
        SSHSecretKeyName: {
          value: keyname,
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
    this.git_pull_codebuild.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`arn:${partition}:secretsmanager:${region}:${account}:secret:*`],
      })
    );

    this.custom_action_function = new PythonFunction(this, 'CodePipelineCustomAction', {
      entry: `${__dirname}/lambdas/`, // required
      index: 'third_party_git_action.py',
      handler: 'lambda_handler',
      environment: {
        LOG_LEVEL: 'DEBUG',
        GitPullCodeBuild: this.git_pull_codebuild.projectName,
      },
      runtime: Runtime.PYTHON_3_7,
      timeout: Duration.minutes(15),
    });
    this.custom_action_function.grantInvoke(new ServicePrincipal('events.amazonaws.com'));
    this.custom_action_function.addToRolePolicy(
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
    this.custom_action_function.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'],
        resources: [this.git_pull_codebuild.projectArn],
      })
    );

    this.CodePipelineCustomActionTrigger = new events.CfnRule(this, 'TriggerRule', {
      state: 'ENABLED',
      description: 'Handles the CodeBuildSource custom provider for CodePipeline',
      eventPattern: {
        source: ['aws.codepipeline'],
        'detail-type': ['CodePipeline Action Execution State Change'],
        detail: {
          type: {
            provider: ['CodeBuildSource'],
            category: ['Source'],
            owner: ['Custom'],
          },
          state: ['STARTED'],
        },
      },
      targets: [
        {
          arn: this.custom_action_function.functionArn,
          id: 'CodePipelineCustomActionTrigger',
        },
      ],
    });
  }
}
