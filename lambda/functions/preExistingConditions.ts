import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// Initialize the S3 client
const s3 = new S3Client({ region: "us-east-1" }); // Specify your AWS region

/**
 * Load a prompt file from S3.
 * @param fileName - The name of the prompt file in the S3 bucket.
 * @returns The prompt content as a string.
 */
export async function loadPromptFromS3(fileName: string): Promise<string> {
  const BUCKET_NAME = "prompts"; // Replace with your actual bucket name

  try {
    const params = { Bucket: BUCKET_NAME, Key: fileName };
    const command = new GetObjectCommand(params);
    const data = await s3.send(command);

    // Convert the response body stream to a string
    const bodyContents = await streamToString(data.Body);

    return bodyContents;
  } catch (error) {
    console.error(`Error loading prompt from S3 (${fileName}):`, error);
    throw new Error(`Failed to load prompt from S3: ${fileName}`);
  }
}

/**
 * Helper function to convert a ReadableStream to a string.
 * @param stream - The readable stream to convert.
 * @returns The stream contents as a string.
 */
async function streamToString(stream: any): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return buffer.toString("utf-8");
}

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

interface PreExistingConditionsEvent {
  caseId: string;
  caseSummary: string;
}

export const handler = async (
  event: PreExistingConditionsEvent
): Promise<{ conditionImpactScore: number }> => {
  console.log("PreExistingConditionsLambda triggered", event);

  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) {
    throw new Error("BEDROCK_MODEL_ID environment variable is not set.");
  }

  try {
    const promptTemplate = await loadPromptFromS3('pre_existing_condition_prompt.txt');
    const prompt = promptTemplate.replace("{caseSummary}", event.caseSummary);

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        prompt,
        max_tokens_to_sample: 600,
      }),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const conditionImpactScore = parseFloat(responseBody.completion.trim());

    console.log("Pre-existing Conditions Impact Score:", conditionImpactScore);

    return { conditionImpactScore };
  } catch (error) {
    console.error("Error analyzing pre-existing conditions:", error);
    throw new Error("Failed to determine medical condition impact.");
  }
};
