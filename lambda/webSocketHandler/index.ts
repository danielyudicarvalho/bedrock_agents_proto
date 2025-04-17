import * as AWS from 'aws-sdk';
import { APIGatewayProxyResult } from 'aws-lambda';

// Minimal interface for the WebSocket event
interface APIGatewayWebSocketEvent {
  requestContext: {
    connectionId?: string;    
  };
  body?: string | null;
}

// Create the SQS client
const sqs = new AWS.SQS();

export const handler = async (
  event: APIGatewayWebSocketEvent
): Promise<APIGatewayProxyResult> => {
  // The connectionId should come from event.requestContext
  const { connectionId } = event.requestContext;

  if (!connectionId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Missing connectionId from WebSocket event',
      }),
    };
  }

  // Parse request data
  const requestBody = event.body ? JSON.parse(event.body) : {};
  const { action, fileName } = requestBody;

  // Check if we need to start analysis
  if (action === 'startAnalysis') {
    // Ensure we have a Queue URL
    const queueUrl = process.env.QUEUE_URL;
    if (!queueUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'QUEUE_URL is not defined in environment variables',
        }),
      };
    }

    // Send message to SQS
    await sqs
      .sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          connectionId,
          fileName,
        }),
      })
      .promise();
  }

  // Return success
  return {
    statusCode: 200,
    body: '',
  };
};
