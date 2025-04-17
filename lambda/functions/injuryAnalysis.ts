import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import AWS from "aws-sdk";

const s3 = new S3Client({ region: "us-east-1" });
const BUCKET_NAME = process.env.PROMPT_BUCKET;

async function streamToString(stream: any): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

const extractInjuryScore = (completion: string): number | null => {
  const match = completion.match(/"injury_severity_score"\s*:\s*(\d+)/);
  return match ? parseFloat(match[1]) : null;
};

export async function loadPromptFromS3(fileName: string): Promise<string> {
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

export const handler = async (
  event: any
): Promise<{ injuryScore: number | null; caseSummary: string; caseType: string; liabilityScore: string; expertCredibilityScore: string, email: string }> => {
  console.log("InjuryAnalysisLambda triggered", event);
  const bedrock = new AWS.BedrockRuntime();

  if (!process.env.BEDROCK_MODEL_ID) {
    throw new Error("BEDROCK_MODEL_ID environment variable is not set.");
  }

  try {
    // ✅ Ensure we correctly handle an array input
    const firstPayload = Array.isArray(event) ? event[0]?.Payload : event.Payload || event;
    const secondPayload = Array.isArray(event) ? event[1]?.Payload : event.Payload || event;

    const liabilityScore = firstPayload.liabilityClarityScore;
    const expertCredibilityScore = secondPayload.expertCredibilityScore;

    if (!firstPayload) {
      throw new Error("Payload is missing.");
    }

    let caseSummary = firstPayload.caseSummary;
    let caseType = firstPayload.caseType;
    let email = firstPayload.email;

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

    const promptTemplate = await loadPromptFromS3('injury_analysis_prompt.txt');
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

    const injuryScore = extractInjuryScore(responseBody.completion);

    console.log("Injury Analysis Results:", injuryScore);

    return { injuryScore, caseSummary, caseType, liabilityScore, expertCredibilityScore, email };
  } catch (error) {
    console.error("Error analyzing injury severity:", error);
    throw new Error("Failed to determine injury severity.");
  }
};
