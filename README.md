`ActionType (Category: 'Source', Provider: 'CodeBuild', Owner: 'AWS', Version: '1') in action 'Source' is not available in region 'US_EAST_1'`

no way around it, if you want to make a new custom source or anything, you need to register it via a provider
this means making a custom provider and then a custom action
so we pretty much DO need to look at the jenkinsprovider as an example, and then a source action like ecr
note that we must make sure our `owner` is `Custom`


`cat ~/.ssh/id_rsa_flowiq_cicd | pbcopy`

- [azure devops specific codebuild and webhook](https://kbild.ch/blog/2020-11-11-custom_codepipeline_source/)



lambda source action -> calls lambda that invokes codebuild
https://github.com/aws/aws-cdk/blob/v1.127.0/packages/%40aws-cdk/aws-codepipeline-actions/lib/lambda/invoke-action.ts

or

build on the codebuild action https://github.com/aws/aws-cdk/blob/v1.127.0/packages/%40aws-cdk/aws-codepipeline-actions/lib/codebuild/build-action.ts
specifically the type becomeing SOURCE

another potential thing to build from:
https://github.com/aws/aws-cdk/blob/v1.127.0/packages/%40aws-cdk/aws-codepipeline-actions/lib/github/source-action.ts
in particular look how the webhook is done

the ecr source one has some things too
