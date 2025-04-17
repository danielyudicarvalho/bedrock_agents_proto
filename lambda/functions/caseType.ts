import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

interface CaseTypeEvent {
  caseId: string;
  email: string;
  caseSummary: string;
}

export const handler = async (event: any): Promise<{ caseType: string, caseSummary: any, email: string }> => {
  console.log("CaseTypeLambda triggered", event);

  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) {
    throw new Error("BEDROCK_MODEL_ID environment variable is not set.");
  }

  let eventPayload: any;

   // ✅ Fix: Correctly extract `extractedText`
   if (typeof event.body === "string") {
    eventPayload = JSON.parse(event.body);
  } else if (event.Payload && typeof event.Payload == "string") {
    eventPayload = JSON.parse(event.Payload);
  } else {
    eventPayload = event as CaseTypeEvent;
  }

  console.log("Parsed event payload:", eventPayload.Payload);  

  const { caseSummary, caseId, email } = eventPayload.Payload;

  try {
    // Prepare the prompt for case classification
    const prompt = `Human: Analyze the following legal case summary and provide a detailed justification for the scoring in the following categories:

            1. Liability Analysis
            2. Expert Analysis
            3. Injury Analysis
            4. Evidence Analysis
            5. Economic Impact
            6. Non-Economic Impact
            7. Insurance Details

            Case Summary:
            ${caseSummary}

            For each category, explain the reasoning behind the assessment based on the information available in the case summary. Use clear, structured language. Your response should be in plain text and follow this format:

            Liability Analysis:
            <Your justification here>

            Expert Analysis:
            <Your justification here>

            Injury Analysis:
            <Your justification here>

            Evidence Analysis:
            <Your justification here>

            Economic Impact:
            <Your justification here>

            Non-Economic Impact:
            <Your justification here>

            Insurance Details:
            <Your justification here>

            Assistant:`;

   
    // Create the command with the necessary parameters
    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        prompt,
        max_tokens_to_sample: 600,
      }),
    });

    // Send the command to the Bedrock model
    const bedrockResponse = await bedrock.send(command);

    // Decode the Uint8Array response body to a string
    const responseString = new TextDecoder("utf-8").decode(bedrockResponse.body);

    // Parse the response string as JSON
    const responseBody = JSON.parse(responseString);

    // Extract the case type from the response
    const caseType = responseBody.completion?.trim() || "Unknown";

    console.log(`Case classified as: ${caseType}`);

    return { caseType, caseSummary, email };
  } catch (error) {
    console.error("Error classifying case type:", error);
    throw new Error("Failed to classify the legal case.");
  }
};
