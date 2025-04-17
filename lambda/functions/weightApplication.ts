import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Initialize AWS clients
const dynamoDBClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const sesClient = new SESClient({ region: "us-east-1" });

interface ScoreData {
  liabilityScore: number;
  insuranceScore: number;
  injuryScore: number;
  evidenceScore: number;
  expertCredibilityScore: number;
  economicScore: number;
  nonEconomicScore: number;
}

/**
 * Fetch weights from DynamoDB for a given jurisdiction.
 */
const getWeights = async () => {
  const jurisdictionId = "san_diego";
  const params = {
    TableName: "JurisdictionWeights",
    Key: { jurisdictionId },
  };

  try {
    const result = await docClient.send(new GetCommand(params));
    if (!result.Item) throw new Error(`No weights found for jurisdictionId: ${jurisdictionId}`);

    return {
      liability: result.Item.weightLiability || 0,
      insurance: result.Item.weightInsurance || 0,
      injury: result.Item.weightInjury || 0,
      evidence: result.Item.weightEvidence || 0,
      expert: result.Item.weightExpert || 0,
      economic: result.Item.weightEconomic || 0,
      nonEconomic: result.Item.weightNonEconomic || 0,
    };
  } catch (error) {
    console.error("Error fetching weights from DynamoDB:", error);
    throw new Error("Failed to fetch jurisdiction weights");
  }
};

/**
 * Calculates the weighted final score based on aggregated scores and weights.
 */
const calculateWeightedScore = (scores: ScoreData, weights: any) => {
  return (
    scores.liabilityScore * weights.liability +
    scores.insuranceScore * weights.insurance +
    scores.injuryScore * weights.injury +
    scores.evidenceScore * weights.evidence +
    scores.expertCredibilityScore * weights.expert +
    scores.economicScore * weights.economic +
    scores.nonEconomicScore * weights.nonEconomic
  );
};

/**
 * Saves the computed final score and relevant case details to DynamoDB.
 */
const saveFinalScore = async (caseType: string, email: string, weightedFinalScore: number) => {
  const params = {
    TableName: "FinalScoresTable",
    Item: {
      caseType,
      email,
      weightedFinalScore,
      timestamp: new Date().toISOString(),
    },
  };

  try {
    await docClient.send(new PutCommand(params));
    console.log("Final score saved to DynamoDB successfully.");
  } catch (error) {
    console.error("Error saving final score to DynamoDB:", error);
    throw new Error("Failed to save final score");
  }
};

/**
 * Sends an email with the weighted final score.
 */
const sendEmail = async (
  caseType: string,
  weightedFinalScore: number,
  email: string,
  scores: ScoreData,
  weights: any
) => {
  console.log("Email destination:", email);
  const destination = email || "danielyudicarvalho@gmail.com";

          const explanation = `
        Weighted Score Breakdown for Case Type: ${caseType}

        Liability Score: ${(scores.liabilityScore * weights.liability).toFixed(2)}
        Insurance Score: ${(scores.insuranceScore * weights.insurance).toFixed(2)}
        Injury Score: ${(scores.injuryScore * weights.injury).toFixed(2)}
        Evidence Score: ${(scores.evidenceScore * weights.evidence).toFixed(2)}
        Expert Score: ${(scores.expertCredibilityScore * weights.expert).toFixed(2)}
        Economic Score: ${(scores.economicScore * weights.economic).toFixed(2)}
        Non-Economic Score: ${(scores.nonEconomicScore * weights.nonEconomic).toFixed(2)}


        FINAL WEIGHTED SCORE: ${weightedFinalScore.toFixed(2)}
        `;

  const emailParams = {
    Destination: { ToAddresses: [destination] },
    Message: {
      Body: {
        Text: { Data: explanation },
      },
      Subject: { Data: `Final Score Report` },
    },
    Source: "daniel@ah2.io", // Must be SES verified
  };

  try {
    await sesClient.send(new SendEmailCommand(emailParams));
    console.log("Email sent successfully.");
  } catch (emailError) {
    console.error("Error sending email:", emailError);
  }
};


export const handler = async (event: any): Promise<{ weightedFinalScore: number }> => {
  console.log("WeightApplicationLambda triggered", JSON.stringify(event, null, 2));

  try {
    if (!Array.isArray(event) || event.length === 0) {
      throw new Error("Payload is missing or not an array.");
    }

    const firstPayload = event[0].Payload || {};
    const { caseType, email } = firstPayload;

    const aggregatedScores: ScoreData = {
      liabilityScore: 0,
      insuranceScore: 0,
      injuryScore: 0,
      evidenceScore: 0,
      expertCredibilityScore: 0,
      economicScore: 0,
      nonEconomicScore: 0,
    };

    for (const record of event) {
      const payload = record.Payload || {};
      aggregatedScores.liabilityScore += payload.liabilityScore ?? 0;
      aggregatedScores.insuranceScore += payload.insuranceScore ?? 0;
      aggregatedScores.injuryScore += payload.injuryScore ?? 0;
      aggregatedScores.evidenceScore += payload.evidenceScore ?? 0;
      aggregatedScores.expertCredibilityScore += payload.expertCredibilityScore ?? 0;
      aggregatedScores.economicScore += payload.economicScore ?? 0;
      aggregatedScores.nonEconomicScore += payload.nonEconomicScore ?? 0;
    }

    console.log("Aggregated Scores:", aggregatedScores);
    const weights = await getWeights();
    console.log("Retrieved Weights:", weights);

    const weightedFinalScore = calculateWeightedScore(aggregatedScores, weights);
    console.log(`Weighted Final Score Calculated: ${weightedFinalScore}`);

    //await saveFinalScore(caseType, email, weightedFinalScore);
    await sendEmail(caseType, weightedFinalScore, email, aggregatedScores, weights);

    return { weightedFinalScore };
  } catch (error) {
    console.error("Error in WeightApplicationLambda:", error);
    throw new Error("Failed to calculate weighted final score");
  }
};
