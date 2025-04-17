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


const extractExpertScore = (completion: string): number | null => {
  const match = completion.match(/"expert_credibility_score"\s*:\s*(\d+)/);
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

interface ExpertAnalysisEvent {
  caseType: string;
  caseSummary: string;  
}

export const handler = async (event: any): Promise<{ expertCredibilityScore: number | null; caseSummary: string; caseType: string}> => {
  console.log("ExpertAnalysisLambda triggered", event);

  if (!process.env.BEDROCK_MODEL_ID) {
    throw new Error("BEDROCK_MODEL_ID environment variable is not set.");
  }
  const bedrock = new AWS.BedrockRuntime();

  let eventPayload: any;

  // ✅ Fix: Properly extract `Payload.body`
  try {
   // ✅ Fix: Correctly extract `extractedText`
   if (typeof event.body === "string") {
    eventPayload = JSON.parse(event.body);
  } else if (event.Payload && typeof event.Payload == "string") {
    eventPayload = JSON.parse(event.Payload);
  } else {
    eventPayload = event as ExpertAnalysisEvent;
  }

  const { caseSummary, caseType } = eventPayload.Payload;  


    const promptTemplate = await loadPromptFromS3("expert_analysis_prompt.txt");
    // ✅ Fix: Properly format the prompt
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
    console.log('response', responseBody);
    const expertCredibilityScore = extractExpertScore(responseBody.completion);

    console.log("Expert Credibility Score:", expertCredibilityScore);

    return { expertCredibilityScore, caseSummary, caseType };
  } catch (error) {
    console.error("Error analyzing expert credibility:", error);
    throw new Error("Failed to determine expert credibility.");
  }
}
