import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Context } from 'aws-lambda';
import Pdf from 'pdf-parse';
import { Readable } from 'stream';

const s3Client = new S3Client({ region: 'us-east-1' });

// The structure you pass to Step Functions:
// e.g. { "documentBucket": "myBucket", "documentKey": "uploads/case123.pdf" }
interface ExtractTextEvent {
  documentBucket: string;
  documentKey: string;
  caseId?: string;   // optional, if you need it for logging/other logic[
  email:string;
}

/**
 * Lambda handler for Step Functions.
 * Expects the event to have { documentBucket, documentKey, ... }.
 */
export const handler = async (event: ExtractTextEvent, _context: Context) => {
  try {
    const { documentBucket, documentKey, email, caseId } = event;

    if (!documentBucket || !documentKey) {
      throw new Error('Missing documentBucket or documentKey in event.');
    }

    // 1) Fetch the PDF from S3
    const command = new GetObjectCommand({ Bucket: documentBucket, Key: documentKey });
    const s3Object = await s3Client.send(command);

    if (!s3Object.Body) {
      throw new Error(`No content found in S3: ${documentBucket}/${documentKey}`);
    }

    // 2) Convert the S3 object stream to a Buffer
    const pdfBuffer = await streamToBuffer(s3Object.Body as Readable);

    // 3) Extract text using pdf-parse
    const data = await Pdf(pdfBuffer);
    const extractedText = data.text;
    console.log(`Extracted text (first 100 chars): ${extractedText.substring(0, 100)}...`);

    // 4) Return the extracted text as output for the next Step Function state
    return { extractedText, email };
  } catch (error) {
    console.error('Error extracting text:', error);
    // Rethrow so Step Functions sees it as a failure (if unhandled)
    throw error;
  }
};

/** Helper to convert a readable stream to a buffer */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
