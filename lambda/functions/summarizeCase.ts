import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import AWS from 'aws-sdk';

const bedrock = new AWS.BedrockRuntime();
const s3 = new S3Client({ region: 'us-east-1' });

interface SummarizeEvent {
  Payload: { extractedText: any; caseId: any; };
  caseId?: string;
  email: string;
  extractedText?: string;
}

/**
 * Takes into account the different ways Step Functions might pass data:
 * 1) Directly as event.extractedText
 * 2) As event.Payload.extractedText
 * 3) Possibly as a JSON string in event.body (e.g. if invoked via API Gateway)
 */
export const handler = async (event: any): Promise<{ caseSummary: string, email:string }> => {
  console.log("SummarizeCaseLambda triggered. Raw event:", JSON.stringify(event));

  if (!process.env.BEDROCK_MODEL_ID) {
    throw new Error("BEDROCK_MODEL_ID environment variable is not set.");
  }

  try {
    // 1) Extract the payload from various possible shapes:
    const eventPayload = parseEventPayload(event);
    console.log("Parsed event payload:", eventPayload);

    const { extractedText, caseId, email } = eventPayload;

    if (!extractedText) {
      throw new Error("Missing extractedText in event payload.");
    }

    // 2) Load the prompt template from S3
    const promptTemplate = await loadPromptFromS3("summarize_prompt.txt");
    const prompt = promptTemplate.replace("{extractedText}", extractedText);

    console.log("Final prompt:", prompt.substring(0, 200), "...");

    // 3) Invoke Amazon Bedrock
    const bedrockResponse = await bedrock
      .invokeModel({
        modelId: process.env.BEDROCK_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          prompt,
          max_tokens_to_sample: 600,
        }),
      })
      .promise();

    // 4) Extract summary
    const responseBody = JSON.parse(bedrockResponse.body as string);
    const caseSummary = responseBody.completion || "Failed to summarize";

    console.log("Case summary:", caseSummary.substring(0, 200), "...");

    return { caseSummary, email };
  } catch (error) {
    console.error("Error summarizing case:", error);
    throw new Error("Failed to summarize the legal case.");
  }
};

/**
 * Attempts to parse `extractedText` from various possible shapes
 * that Step Functions or API Gateway might pass.
 */
function parseEventPayload(rawEvent: any): SummarizeEvent {
  // 1) If there's a "body" string (API Gateway style), parse it:
  if (typeof rawEvent.body === "string") {
    return JSON.parse(rawEvent.body);
  }

  // 2) If there's a "Payload" object with `extractedText` inside
  //    (like your log shows: event.Payload.extractedText)
  if (rawEvent.Payload && rawEvent.Payload.extractedText) {
    return rawEvent.Payload;
  }

  // 3) Otherwise, assume the event is already in SummarizeEvent form
  //    (i.e. rawEvent.extractedText is top-level)
  return rawEvent;
}

/** Loads a text prompt from S3. */
async function loadPromptFromS3(fileName: string): Promise<string> {
  const BUCKET_NAME = process.env.PROMPT_BUCKET;
  if (!BUCKET_NAME) {
    throw new Error("PROMPT_BUCKET environment variable is not set.");
  }

  const s3Client = new S3Client({ region: "us-east-1" });
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileName });
  const data = await s3Client.send(command);

  if (!data.Body) {
    throw new Error(`No content found in S3: ${BUCKET_NAME}/${fileName}`);
  }
  const buffer = await streamToBuffer(data.Body);
  return buffer.toString("utf-8");
}

/** Convert a Node.js readable stream into a Buffer. */
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: any[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
