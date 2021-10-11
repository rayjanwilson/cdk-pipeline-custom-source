/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as cdk from '@aws-cdk/core';
import * as cpl from '@aws-cdk/aws-codepipeline';
import * as cpla from '@aws-cdk/aws-codepipeline-actions';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as iam from '@aws-cdk/aws-iam';
import { ICBSourceProvider } from './codebuild-source-provider';

export interface CodeBuildActionSourceProps extends cpl.CommonActionProps {
  readonly input?: cpl.Artifact;
  readonly extraInputs?: cpl.Artifact[];
  readonly outputs?: cpl.Artifact[];
  readonly cbsourceProvider: ICBSourceProvider;
  // readonly projectName: string;
  readonly project: codebuild.IProject;
  readonly pipelineName: string; // might be able to get this smartly, but for now this is a circular dependency so give name directly
  readonly branch: string;
  readonly giturl: string;
  readonly sshsecretkey: string;
  readonly type?: cpla.CodeBuildActionType;
  readonly environmentVariables?: { [name: string]: codebuild.BuildEnvironmentVariable };
  readonly checkSecretsInPlainTextEnvVariables?: boolean;
  readonly executeBatchBuild?: boolean;
  readonly combineBatchBuildArtifacts?: boolean;
}
export class CodeBuildActionSource extends cpla.Action {
  private readonly props: CodeBuildActionSourceProps;
  constructor(props: CodeBuildActionSourceProps) {
    super({
      ...props,
      category: cpl.ActionCategory.SOURCE,
      provider: props.cbsourceProvider.providerName,
      owner: 'Custom',
      artifactBounds: { minInputs: 0, maxInputs: 0, minOutputs: 1, maxOutputs: 1 },
      // resource: props.project,
      version: props.cbsourceProvider.version,
    });

    this.props = props;
  }

  /**
   * Reference a CodePipeline variable defined by the CodeBuild project this action points to.
   * Variables in CodeBuild actions are defined using the 'exported-variables' subsection of the 'env'
   * section of the buildspec.
   *
   * @param variableName the name of the variable to reference.
   *   A variable by this name must be present in the 'exported-variables' section of the buildspec
   *
   * @see https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html#build-spec-ref-syntax
   */
  public variable(variableName: string): string {
    return this.variableExpression(variableName);
  }

  protected bound(scope: cdk.Construct, _stage: cpl.IStage, options: cpl.ActionBindOptions): cpl.ActionConfig {
    // check for a cross-account action if there are any outputs
    if ((this.actionProperties.outputs || []).length > 0) {
      const pipelineStack = cdk.Stack.of(scope);
      const projectStack = cdk.Stack.of(this.props.project);
      if (pipelineStack.account !== projectStack.account) {
        throw new Error(
          'A cross-account CodeBuild action cannot have outputs. ' +
            'This is a known CodeBuild limitation. ' +
            'See https://github.com/aws/aws-cdk/issues/4169 for details'
        );
      }
    }

    // this.props.cbsourceProvider._registerSourceProvider();   this gets done automatically by the base abstract class

    // grant the Pipeline role the required permissions to this Project
    options.role.addToPolicy(
      new iam.PolicyStatement({
        resources: [this.props.project.projectArn],
        actions: [
          `codebuild:${this.props.executeBatchBuild ? 'BatchGetBuildBatches' : 'BatchGetBuilds'}`,
          `codebuild:${this.props.executeBatchBuild ? 'StartBuildBatch' : 'StartBuild'}`,
          `codebuild:${this.props.executeBatchBuild ? 'StopBuildBatch' : 'StopBuild'}`,
        ],
      })
    );

    // allow the Project access to the Pipeline's artifact Bucket
    // but only if the project is not imported
    // (ie., has a role) - otherwise, the IAM library throws an error
    if (this.props.project.role) {
      if ((this.actionProperties.outputs || []).length > 0) {
        options.bucket.grantReadWrite(this.props.project);
      } else {
        options.bucket.grantRead(this.props.project);
      }
    }

    if (this.props.project instanceof codebuild.Project) {
      this.props.project.bindToCodePipeline(scope, {
        artifactBucket: options.bucket,
      });
    }

    const configuration: any = {
      // ProjectName: this.props.project.projectName,
      Branch: this.props.branch,
      GitUrl: this.props.giturl,
      PipelineName: this.props.pipelineName,
      SSHSecretKeyName: this.props.sshsecretkey,

      // EnvironmentVariables:
      //   this.props.environmentVariables &&
      //   cdk.Stack.of(scope).toJsonString(
      //     codebuild.Project.serializeEnvVariables(
      //       this.props.environmentVariables,
      //       this.props.checkSecretsInPlainTextEnvVariables ?? true,
      //       this.props.project
      //     )
      //   ),
    };

    if (this.props.executeBatchBuild) {
      configuration.BatchEnabled = 'true';
      this.props.project.enableBatchBuilds();

      if (this.props.combineBatchBuildArtifacts) {
        configuration.CombineArtifacts = 'true';
      }
    }
    return {
      configuration,
    };
  }
}
