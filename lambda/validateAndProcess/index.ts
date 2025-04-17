import * as dotenv from 'dotenv';
dotenv.config();

dotenv.config();

import * as AWS from 'aws-sdk';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { SQSHandler, SQSRecord } from 'aws-lambda';

// interface ClaudeResponse {
//   probability_of_success: number;
// }

// Create S3 and ApiGatewayManagementApi clients
const s3 = new AWS.S3();
const apigatewaymanagementapi = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_URL,
});

// Load prompt file
const promptPath = path.join(__dirname, '../../prompts/legal_analysis_prompt.txt');
const legalAnalysisPrompt = fs.readFileSync(promptPath, 'utf-8');

export const handler: SQSHandler = async (event): Promise<void> => {
  try {   
    for (const record of event.Records) {
      // Parse the body of the SQS message
      const { connectionId, fileName } = JSON.parse(record.body) as {
        connectionId: string;
        fileName: string;
      };

      // Retrieve document from S3
      const s3Object = await s3.getObject({
        Bucket: process.env.BUCKET_NAME as string,
        Key: fileName,
      }).promise();

      // Convert file contents to text
      const documentText = s3Object.Body?.toString('utf-8') ?? '';

      // Send formatted request to Claude AI
      const claudeResponse = await axios.post<any>(
        'https://api.claude.ai/analyze',
        {
          prompt: legalAnalysisPrompt,
          document: documentText,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.CLAUDE_API_KEY}`,
          },
        }
      );

      // Extract the probability score from the response
      const probabilityScore = claudeResponse.data?.probability_of_success;

      // Send response back to WebSocket API
      await apigatewaymanagementapi.postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify({ probability_score: probabilityScore }),
      }).promise();
    }
  } catch (error: unknown) {
    console.error('Error processing document:', error);    
  }
};
