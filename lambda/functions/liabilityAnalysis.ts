import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import AWS from "aws-sdk";

const s3 = new S3Client({ region: "us-east-1" });
const BUCKET_NAME = process.env.PROMPT_BUCKET;

async function streamToString(stream: any): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return buffer.toString("utf-8");
}

const extractLiabilityScore = (completion: string): number | null => {
  const match = completion.match(/"liability_clarity_score"\s*:\s*(\d+)/);
  return match ? parseFloat(match[1]) : null;
};

export async function loadPromptFromS3(fileName: string): Promise<string> {
  try {
    const params = { Bucket: BUCKET_NAME, Key: fileName };
    const command = new GetObjectCommand(params);
    const data = await s3.send(command);
    
    const bodyContents = await streamToString(data.Body);

    return bodyContents;
  } catch (error) {
    console.error(`Error loading prompt from S3 (${fileName}):`, error);
    throw new Error(`Failed to load prompt from S3: ${fileName}`);
  }
}
const bedrock = new AWS.BedrockRuntime();

interface LiabilityClarityEvent {
  caseId: string;
  email: string;
  caseSummary: string;
  caseType: string;
  jurisdictionScore: number;
}

export const handler = async (
  event: any
): Promise<{  liabilityClarityScore: number | null; caseSummary: string; caseType: string, email: string }> => {
  console.log("LiabilityClarityLambda triggered", event);

  let eventPayload: any;

  if (!process.env.BEDROCK_MODEL_ID) {
    throw new Error("BEDROCK_MODEL_ID environment variable is not set.");
  }

   // ✅ Fix: Correctly extract `extractedText`
   if (typeof event.body === "string") {
    eventPayload = JSON.parse(event.body);
  } else if (event.Payload && typeof event.Payload == "string") {
    eventPayload = JSON.parse(event.Payload);
  } else {
    eventPayload = event as LiabilityClarityEvent;
  }

  const { caseSummary, caseType, email } = eventPayload.Payload;

  try {
    const promptTemplate = await loadPromptFromS3('liability_analysis_prompt.txt');
    const prompt = promptTemplate
      .replace("{caseSummary}", caseSummary)
      .replace("{caseType}", caseType); 

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
    const liabilityClarityScore = extractLiabilityScore(responseBody.completion);
    //const bedrockResponse = await bedrock.send(command);
    console.log(`Liability Clarity Score calculated: ${liabilityClarityScore}`);  

    return { liabilityClarityScore, caseSummary, caseType, email };
  } catch (error) {
    console.error("Error analyzing liability clarity:", error);
    throw new Error("Failed to analyze liability clarity.");
  }
};
