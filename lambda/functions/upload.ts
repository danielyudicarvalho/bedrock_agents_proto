import { S3 } from 'aws-sdk';
import { StepFunctions } from 'aws-sdk';
import { APIGatewayProxyHandler } from 'aws-lambda';

const s3 = new S3();
const stepfunctions = new StepFunctions();

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // 1) Parse the body (assume JSON with "fileBase64" and "caseId", for example)
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Request body missing.' }),
      };
    }

    const { fileBase64, caseId, email } = JSON.parse(event.body);

    if (!fileBase64 || !caseId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing fileBase64 or caseId in JSON body.' }),
      };
    }    
    const fileBuffer = Buffer.from(fileBase64, 'base64');
   
    const documentBucket = process.env.DOCUMENT_BUCKET; 
    const fileKey = `uploads/${caseId}.pdf`;

    await s3.putObject({
      Bucket: documentBucket!,
      Key: fileKey,
      Body: fileBuffer,
    }).promise();

       const input = {
      documentBucket,
      documentKey: fileKey,
      caseId,
      email
    };

    await stepfunctions.startExecution({
      stateMachineArn: process.env.STATE_MACHINE_ARN!, 
      input: JSON.stringify(input),
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Successfully started Step Functions workflow.' }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Something went wrong', details: (error as Error).message }),
    };
  }
};
