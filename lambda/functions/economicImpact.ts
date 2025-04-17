import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import AWS from "aws-sdk";

// Initialize the S3 client
const s3 = new S3Client({ region: "us-east-1" });

/**
 * Load a prompt file from S3.
 * @param fileName - The name of the prompt file in the S3 bucket.
 * @returns The prompt content as a string.
 */
export async function loadPromptFromS3(fileName: string): Promise<string> {
  const BUCKET_NAME = process.env.PROMPT_BUCKET; // Replace with your actual bucket name

  try {
    const params = { Bucket: BUCKET_NAME, Key: fileName };
    const command = new GetObjectCommand(params);
    const data = await s3.send(command);

    return await streamToString(data.Body);
  } catch (error) {
    console.error(`Error loading prompt from S3 (${fileName}):`, error);
    throw new Error(`Failed to load prompt from S3: ${fileName}`);
  }
}

const extractEconomicScore = (completion: string): number | null => {
  const match = completion.match(/"economic_score"\s*:\s*(\d+)/);
  return match ? parseFloat(match[1]) : null;
};

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
  return Buffer.concat(chunks).toString("utf-8");
}

interface EconomicImpactEvent {
  caseType: string;
  caseSummary: string;
}

export const handler = async (
  event: any
): Promise<{ economicScore: number | null; caseSummary: string; caseType: string }> => {
  console.log("EconomicImpactLambda triggered", event);
  const bedrock = new AWS.BedrockRuntime();

  if (!process.env.BEDROCK_MODEL_ID) {
    throw new Error("BEDROCK_MODEL_ID environment variable is not set.");
  }

  try {
    // ✅ Ensure we correctly handle an array input
    const firstPayload = Array.isArray(event) ? event[0]?.Payload : event.Payload || event;

    if (!firstPayload) {
      throw new Error("Payload is missing.");
    }

    let caseSummary = firstPayload.caseSummary;
    let caseType = firstPayload.caseType;

    // ✅ If caseSummary is wrapped in JSON, parse it
    try {
      const parsedSummary = JSON.parse(caseSummary);
      if (parsedSummary.caseSummary) {
        caseSummary = parsedSummary.caseSummary;
      }
    } catch (e) {
      console.log("caseSummary is not JSON, using raw value.");
    }

    // ✅ Ensure required fields exist
    if (!caseSummary || !caseType) {
      throw new Error("Missing required fields: caseSummary or caseType.");
    }

    const promptTemplate = await loadPromptFromS3('economic_impact_prompt.txt');
    const prompt = promptTemplate
      .replace("{caseSummary}", caseSummary)
      .replace("{caseType}", caseType);

    console.log("Generated prompt:", prompt);

    const bedrockResponse = await bedrock.invokeModel({
      modelId: process.env.BEDROCK_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        prompt,
        max_tokens_to_sample: 600,
      }),
    }).promise();

    const responseBody = JSON.parse(bedrockResponse.body as string);
    console.log("Bedrock Response:", responseBody);

    const economicScore = extractEconomicScore(responseBody.completion);

    console.log("Economic Score Calculated:", economicScore);

    return { economicScore, caseSummary, caseType };
  } catch (error) {
    console.error("Error analyzing economic impact:", error);
    throw new Error("Failed to analyze economic damages.");
  }
};
