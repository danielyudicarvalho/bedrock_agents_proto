import * as dotenv from 'dotenv';
dotenv.config();

import * as AWS from 'aws-sdk';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';

// Create the S3 client
const s3 = new AWS.S3();

export const handler = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  // Read environment variable
  const bucketName = process.env.BUCKET_NAME;

  if (!bucketName) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'BUCKET_NAME is not defined in environment' }),
    };
  }

  // Parse incoming body
  const body = event.body ? JSON.parse(event.body) : {};
  const fileName = body.fileName as string;

  if (!fileName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing fileName in request body' }),
    };
  }

  // Set up S3 signed URL parameters
  const params = {
    Bucket: bucketName,
    Key: fileName,
    Expires: 3600, // 1 hour
    ContentType: 'application/pdf',
  };

  try {
    // Generate a pre-signed URL
    const uploadUrl = await s3.getSignedUrlPromise('putObject', params);

    return {
      statusCode: 200,
      body: JSON.stringify({ uploadUrl }),
    };
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate presigned URL' }),
    };
  }
};
