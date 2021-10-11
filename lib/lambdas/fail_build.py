import logging
from botocore.exceptions import ClientError
import boto3
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)


def codepipeline_failure(job_id, message, link):
    try:
        codepipeline = boto3.client('codepipeline')
        codepipeline.put_job_failure_result(
            jobId=job_id,
            failureDetails={'type': 'JobFailed',
                            'message': message, 'externalExecutionId': link}
        )
        LOGGER.info('===FAILURE===')
        return True
    except ClientError as err:
        LOGGER.error(
            "Failed to PutJobFailureResult for CodePipeline!\n%s", err)
        return False


def codepipeline_stop(execution_id, message, pipelinename):
    try:
        codepipeline = boto3.client('codepipeline')
        codepipeline.stop_pipeline_execution(
            pipelineName=pipelinename,
            pipelineExecutionId=execution_id,
            abandon=True,
            reason=message
        )
        LOGGER.info('===FAILURE===')
        return True
    except ClientError as err:
        LOGGER.error("Failed to Stop CodePipeline!\n%s", err)
        return False


def lambda_handler(event, context):
    LOGGER.info(event)
    try:
        job_id = event['exported-environment-variables'][0]['value']
        print(job_id)
        execution_id = event['environment-variables'][0]['value']
        print(execution_id)
        pipelinename = event['environment-variables'][1]['value']
        print(pipelinename)
        loglink = event['loglink']
        print(loglink)
        if (job_id != ""):
            print("Found an job id")
            codepipeline_failure(job_id, "CodeBuild process failed", loglink)
        else:
            print("Found NO job id")
            codepipeline_stop(
                execution_id, "CodeBuild process failed", pipelinename)
    except KeyError as err:
        LOGGER.error("Could not retrieve CodePipeline Job ID!\n%s",
                     err, pipelinename)
        return False
