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
  ImagePullPrincipalType,
} from '@aws-cdk/aws-codebuild';
import { PolicyStatement, Effect, ServicePrincipal } from '@aws-cdk/aws-iam';
import { IFunction, Runtime } from '@aws-cdk/aws-lambda';
import { Construct, Duration, Stack } from '@aws-cdk/core';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import * as s3 from '@aws-cdk/aws-s3';
import * as events from '@aws-cdk/aws-events';
import * as iam from '@aws-cdk/aws-iam';
import { PythonFunction } from '@aws-cdk/aws-lambda-python';

export interface IProps {
  branch: string;
  giturl: string;
  keyname: string;
  buildspecname: string;
}

export class GenericGitSourceAction extends Construct {
  public readonly custom_action_function: IFunction;
  public readonly git_pull_codebuild: IProject;
  public readonly CodePipelineCustomActionTrigger: events.CfnRule;

  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id);

    const { branch, giturl, keyname, buildspecname } = props;
    const { partition, region, account } = Stack.of(this);

    const doc = readFileSync(`${__dirname}/${buildspecname}`, 'utf8');
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

    const cloudwatch_event_role = new iam.Role(this, 'CWEEventRole', {
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
      inlinePolicies: {
        jobworker: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['codebuild:StartBuild'],
              resources: [this.git_pull_codebuild.projectArn],
            }),
          ],
        }),
      },
    });
    const cloudwatch_event = new events.CfnRule(this, 'NewTriggerRule', {
      state: 'ENABLED',
      description: 'Handles the CodeBuildSource custom provider for CodePipeline',
      eventPattern: {
        source: ['aws.codepipeline'],
        'detail-type': ['CodePipeline Action Execution State Change'],
        detail: {
          type: {
            provider: ['GenericGitSource'],
            category: ['Source'],
            owner: ['Custom'],
          },
          state: ['STARTED'],
        },
      },
      targets: [
        {
          arn: this.git_pull_codebuild.projectArn,
          id: 'triggerjobworker',
          roleArn: cloudwatch_event_role.roleArn,
          inputTransformer: {
            inputPathsMap: { executionid: '$.detail.execution-id', pipelinename: '$.detail.pipeline' },
            inputTemplate:
              '{"environmentVariablesOverride": [{"name": "executionid", "type": "PLAINTEXT", "value": <executionid>},{"name": "pipelinename", "type": "PLAINTEXT", "value": <pipelinename>}]}',
          },
        },
      ],
    });

    const lambda_build_fails = new PythonFunction(this, 'BuildFails', {
      entry: `${__dirname}/lambdas/`, // required
      index: 'fail_build.py',
      handler: 'lambda_handler',
      environment: {
        LOG_LEVEL: 'DEBUG',
        // GitPullCodeBuild: this.git_pull_codebuild.projectName,
      },
      runtime: Runtime.PYTHON_3_7,
      timeout: Duration.minutes(15),
    });
    lambda_build_fails.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'codepipeline:PutJobSuccessResult',
          'codepipeline:PutJobFailureResult',
          'codepipeline:StopPipelineExecution',
        ],
        resources: ['*'],
      })
    );

    const build_failed = new events.CfnRule(this, 'CustomSourceBuildFailed', {
      state: 'ENABLED',
      description: 'Handles the CodeBuildSource custom provider for CodePipeline',
      eventPattern: {
        source: ['aws.codepipeline'],
        'detail-type': ['CodeBuild Build State Change'],
        detail: {
          'build-status': ['FAILED'],
          'project-name': [this.git_pull_codebuild.projectName],
        },
      },
      targets: [
        {
          arn: lambda_build_fails.functionArn,
          id: 'failtrigger',
          inputTransformer: {
            inputPathsMap: {
              loglink: '$.detail.additional-information.logs.deep-link',
              'environment-variables': '$.detail.additional-information.environment.environment-variables',
              'exported-environment-variables': '$.detail.additional-information.exported-environment-variables',
            },
            inputTemplate:
              '{"loglink": <loglink>, "environment-variables": <environment-variables>, "exported-environment-variables": <exported-environment-variables>}',
          },
        },
      ],
    });
  }
}
