import * as AWS from "aws-sdk";

const s3 = new AWS.S3();
const BUCKET_NAME = "prompts"; // Replace with your actual bucket name

/**
 * Load a prompt file from S3.
 * @param fileName - The name of the prompt file in the S3 bucket.
 * @returns The prompt content as a string.
 */
export async function loadPromptFromS3(fileName: string): Promise<string> {
  try {
    const params = { Bucket: BUCKET_NAME, Key: fileName };
    const data = await s3.getObject(params).promise();
    return data.Body?.toString("utf-8") || "";
  } catch (error) {
    console.error(`Error loading prompt from S3 (${fileName}):`, error);
    throw new Error(`Failed to load prompt from S3: ${fileName}`);
  }
}
