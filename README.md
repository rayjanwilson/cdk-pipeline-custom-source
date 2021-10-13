# CDK Pipeline Custom Source Action

With CDK you can choose a few things to be `Source` action for your pipeline, from GitHub, BitBucket, CodeCommit, to even ECR. What you currently are not able to do out of the box is use any old git provider. This project aims to address that and is a remix of the excellent work done by [kbild.ch custom codepipeline source](https://kbild.ch/blog/2020-11-11-custom_codepipeline_source/).

## How it works

Essentially all we're doing is using CodeBuild to do a git clone, zip it up, and toss into an artifact bucket. 
What is less evident from other documentation is that in order to do this with CodePipeline more seamlessly, you need to create a `source provider` and a `source action`. That's what we're showing here.

The magic happens in the files `lib/codebuild-source-provider.ts` and `lib/codebuild-source-action.ts`. It's implemented in `/lib/generic-git-source.ts` and used in the pipeline stack `custom-source-stack.ts`

A webhook is made that you provide to your git source repository. It has two filters in it, one for essentially every git provider ever, and one for azure devops because they just had to be special.

The webhook triggers CodePipeline. Codepipeline sends an event to EventBus. CodeBuild is registered to kick off when a certain pattern comes through EventBus. After that, everythign works as normal.

## A few nice features added in
- Custom artifact buckets that get destroyed when stack is deleted. Also ensures encryption, etc
- example shows how to run actions in parallel

## Configuration
- we are using `.env` to store configurable values
  - update the `BRANCH`to be whichever branch you want it to trigger off
  - update `GITURL` to be your git clone address
- you will need to save the private key used for git into secrets manager
  - `cat ~/.ssh/id_rsa | pbcopy`
  - save into secrets manager as `SSHKeyGithub` or similar
  - update your `.env` file to `SSHKEYNAME=SSHKeyGithub`

# Reference
- excellent work from [kbild.ch custom codepipeline source](https://kbild.ch/blog/2020-11-11-custom_codepipeline_source/)

