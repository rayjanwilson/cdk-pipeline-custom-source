import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import { CustomActionRegistration } from './custom-action-registration';

export interface ICBSourceProvider extends cdk.IConstruct {
  readonly providerName: string;
  readonly version: string;

  _registerSourceProvider(): void;
}

export interface CBSourceProviderAttributes {
  readonly providerName: string;
  /**
   * The version of your provider.
   *
   * @default '1'
   */
  readonly version?: string;
}

export interface CBSourceProviderProps {
  readonly providerName: string;
  readonly version?: string;
}

export abstract class BaseCBSourceProvider extends cdk.Construct implements ICBSourceProvider {
  public abstract readonly providerName: string;
  public readonly version: string;

  protected constructor(scope: cdk.Construct, id: string, version?: string) {
    super(scope, id);
    this.version = version || '1';
  }
  /**
   * @internal
   */
  public abstract _registerSourceProvider(): void;
}

export class CBSourceProvider extends BaseCBSourceProvider {
  public readonly providerName: string;

  constructor(scope: cdk.Construct, id: string, props: CBSourceProviderProps) {
    super(scope, id, props.version);
    this.providerName = props.providerName;
    this._registerSourceProvider();
  }

  /**
   * @internal
   */
  public _registerSourceProvider(): void {
    this.registerCBSourceCustomAction('CBSourceProviderResource', codepipeline.ActionCategory.SOURCE);
  }

  private registerCBSourceCustomAction(id: string, category: codepipeline.ActionCategory) {
    new CustomActionRegistration(this, id, {
      category,
      artifactBounds: { minInputs: 0, maxInputs: 0, minOutputs: 1, maxOutputs: 1 },
      provider: this.providerName,
      version: this.version,
      entityUrl: 'https://docs.aws.amazon.com/codepipeline/latest/userguide/actions-create-custom-action.html',
      executionUrl: 'https://docs.aws.amazon.com/codepipeline/latest/userguide/actions-create-custom-action.html',
      actionProperties: [
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
    });
  }
}
