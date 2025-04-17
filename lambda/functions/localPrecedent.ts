import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

// Initialize DynamoDB Client
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// Define the structure of the incoming event
interface CaseSummaryEvent {
  caseId: string;
  caseSummary: string;
}

// Lambda handler function
export const handler = async (event: CaseSummaryEvent): Promise<{ message: string }> => {
  console.log("Received event:", event);

  const { caseId, caseSummary } = event;

  if (!caseId || !caseSummary) {
    throw new Error("Missing required parameters: caseId and caseSummary.");
  }

  const params = {
    TableName: process.env.CASE_SUMMARIES_TABLE,
    Item: {
      caseId: caseId,
      caseSummary: caseSummary,
      timestamp: new Date().toISOString(),
    },
  };

  try {
    await ddbDocClient.send(new PutCommand(params));
    console.log(`Case summary for caseId ${caseId} stored successfully.`);
    return { message: "Case summary stored successfully." };
  } catch (error) {
    console.error("Error storing case summary:", error);
    throw new Error("Failed to store case summary.");
  }
};
