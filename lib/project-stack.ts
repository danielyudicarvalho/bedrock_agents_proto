import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export class LegalCaseScoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for Prompts
    const promptBucket = new s3.Bucket(this, 'PromptsBucket', {
      bucketName: `prompts-${this.account}-us-east-1`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: cdk.Duration.days(365) }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Deploy prompts to S3
    new s3deploy.BucketDeployment(this, 'DeployPrompts', {
      sources: [s3deploy.Source.asset('./prompts')],
      destinationBucket: promptBucket,
    });

    // IAM policy to allow Lambda read access to Prompts Bucket
    const s3AccessPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: [`${promptBucket.bucketArn}/*`],
    });

    // S3 Bucket for Document Storage
    const documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: cdk.Duration.days(365) }],
    });

    // DynamoDB tables
    const jurisdictionTable = new dynamodb.Table(this, 'JurisdictionWeights', {
      tableName: 'JurisdictionWeights',
      partitionKey: { name: 'jurisdictionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const scoreHistoryTable = new dynamodb.Table(this, 'ScoreHistory', {
      partitionKey: { name: 'caseId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const bedrockAccessPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:GetModel"
      ],
      resources: ["*"],
    });

    // Lambda Layer for Shared Utilities
    const utilsLayer = new lambda.LayerVersion(this, 'UtilsLayer', {
      code: lambda.Code.fromAsset('lambda/layers/utils'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Common utilities for legal case processing',
    });
    // Grant write permissions to WeightApplicationLambda


    // IAM Policy for Amazon Bedrock
    const bedrockPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['*'],
    });

    // Lambda Function Factory
    const bedrockModelId = "anthropic.claude-v2:1";

    const createLambda = (name: string, entry: string) =>
      new lambdaNodejs.NodejsFunction(this, name, {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: path.join(__dirname, `../lambda/functions/${entry}.ts`),
        handler: 'handler',
        timeout: cdk.Duration.minutes(5),
        memorySize: 1024,
        bundling: {
          externalModules: ['pdf-parser'],
        },
        environment: {
          JURISDICTION_TABLE: jurisdictionTable.tableName,
          SCORE_HISTORY_TABLE: scoreHistoryTable.tableName,
          DOCUMENT_BUCKET: documentBucket.bucketName,
          PROMPT_BUCKET: promptBucket.bucketName,
          BEDROCK_MODEL_ID: bedrockModelId
        },
        initialPolicy: [bedrockPolicy],
      });

    // Create Lambdas
    const extractTextLambda = createLambda('ExtractText', 'extractText');
    const summarizeCaseLambda = createLambda('SummarizeCase', 'summarizeCase');
    const caseTypeLambda = createLambda('CaseType', 'caseType');
    const localPrecendentLambda = createLambda('LocalPrecedent', 'localPrecedent');
    const liabilityAnalysisLambda = createLambda('LiabilityAnalysis', 'liabilityAnalysis');
    const insuranceDetailsLambda = createLambda('InsuranceDetails', 'insuranceDetails');
    const injuryAnalysisLambda = createLambda('InjuryAnalysis', 'injuryAnalysis');
    const evidenceAnalysisLambda = createLambda('EvidenceAnalysis', 'evidenceAnalysis');
    const expertAnalysisLambda = createLambda('ExpertAnalysis', 'expertAnalysis');
    const economicImpactLambda = createLambda('EconomicImpact', 'economicImpact');
    const nonEconomicImpactLambda = createLambda('NonEconomicImpact', 'nonEconomicImpact');
    const weightApplicationLambda = createLambda('WeightApplication', 'weightApplication');

    // Apply S3 access policy to relevant Lambdas
    extractTextLambda.addToRolePolicy(s3AccessPolicy);
    summarizeCaseLambda.addToRolePolicy(s3AccessPolicy);
    caseTypeLambda.addToRolePolicy(s3AccessPolicy);
    liabilityAnalysisLambda.addToRolePolicy(s3AccessPolicy);
    injuryAnalysisLambda.addToRolePolicy(s3AccessPolicy);
    evidenceAnalysisLambda.addToRolePolicy(s3AccessPolicy);
    economicImpactLambda.addToRolePolicy(s3AccessPolicy);
    nonEconomicImpactLambda.addToRolePolicy(s3AccessPolicy);
    insuranceDetailsLambda.addToRolePolicy(s3AccessPolicy);
    expertAnalysisLambda.addToRolePolicy(s3AccessPolicy);
    weightApplicationLambda.addToRolePolicy(s3AccessPolicy);

    // Apply Bedrock access
    summarizeCaseLambda.addToRolePolicy(bedrockAccessPolicy);
    caseTypeLambda.addToRolePolicy(bedrockAccessPolicy);
    liabilityAnalysisLambda.addToRolePolicy(bedrockAccessPolicy);
    injuryAnalysisLambda.addToRolePolicy(bedrockAccessPolicy);
    evidenceAnalysisLambda.addToRolePolicy(bedrockAccessPolicy);
    economicImpactLambda.addToRolePolicy(bedrockAccessPolicy);
    nonEconomicImpactLambda.addToRolePolicy(bedrockAccessPolicy);
    insuranceDetailsLambda.addToRolePolicy(bedrockAccessPolicy);
    expertAnalysisLambda.addToRolePolicy(bedrockAccessPolicy);
    weightApplicationLambda.addToRolePolicy(bedrockAccessPolicy);

    // Grant additional permissions
    documentBucket.grantRead(extractTextLambda);
    jurisdictionTable.grantReadWriteData(localPrecendentLambda);
    jurisdictionTable.grantReadWriteData(weightApplicationLambda);
    // scoreHistoryTable.grantWriteData(reportGeneratorLambda);

    // Step Functions Workflow
    const extractTextTask = new tasks.LambdaInvoke(this, 'Extract Text', {
      lambdaFunction: extractTextLambda
    });
    const summarizeTask = new tasks.LambdaInvoke(this, 'Summarize Case', {
      lambdaFunction: summarizeCaseLambda
    });
    const caseTypeTask = new tasks.LambdaInvoke(this, 'Case Type Analysis', {
      lambdaFunction: caseTypeLambda
    });

    const parallelAnalysis = new stepfunctions.Parallel(this, 'Parallel Analysis')
      .branch(new tasks.LambdaInvoke(this, 'Liability Analysis', {
        lambdaFunction: liabilityAnalysisLambda
      }))
      .branch(new tasks.LambdaInvoke(this, 'Expert Analysis', {
        lambdaFunction: expertAnalysisLambda
      }));

    const factorAnalysis = new stepfunctions.Parallel(this, 'Factor Analysis')
      .branch(new tasks.LambdaInvoke(this, 'Injury Analysis', {
        lambdaFunction: injuryAnalysisLambda
      }))
      .branch(new tasks.LambdaInvoke(this, 'Evidence Analysis', {
        lambdaFunction: evidenceAnalysisLambda
      }))
      .branch(new tasks.LambdaInvoke(this, 'Economic Impact', {
        lambdaFunction: economicImpactLambda
      }))
      .branch(new tasks.LambdaInvoke(this, 'Non-Economic Impact', {
        lambdaFunction: nonEconomicImpactLambda
      }))
      .branch(new tasks.LambdaInvoke(this, 'Insurance Details', {
        lambdaFunction: insuranceDetailsLambda
      }));

    const weightApplicationTask = new tasks.LambdaInvoke(this, 'Apply Weights', {
      lambdaFunction: weightApplicationLambda
    });
    scoreHistoryTable.grantWriteData(weightApplicationLambda);

    const workflow = extractTextTask
      .next(summarizeTask)
      .next(caseTypeTask)
      .next(parallelAnalysis)
      .next(factorAnalysis)
      .next(weightApplicationTask);      

    const stateMachine = new stepfunctions.StateMachine(this, 'CaseScoringWorkflow', {
      definitionBody: stepfunctions.DefinitionBody.fromChainable(workflow),
      timeout: cdk.Duration.minutes(30),
    });   

    const uploadAndStartLambda =  new lambdaNodejs.NodejsFunction(this, 'upload', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, `../lambda/functions/upload.ts`),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      bundling: {
        externalModules: ['pdf-parser'],
      },
      environment: {
        JURISDICTION_TABLE: jurisdictionTable.tableName,
        SCORE_HISTORY_TABLE: scoreHistoryTable.tableName,
        DOCUMENT_BUCKET: documentBucket.bucketName,
        PROMPT_BUCKET: promptBucket.bucketName,
        BEDROCK_MODEL_ID: bedrockModelId,
        STATE_MACHINE_ARN: stateMachine.stateMachineArn
      },
      initialPolicy: [bedrockPolicy],
    });

    documentBucket.grantPut(uploadAndStartLambda);
    stateMachine.grantStartExecution(uploadAndStartLambda);

    // Create or reuse an existing API
    const api = new apigateway.RestApi(this, 'CaseScoringApi', {
      restApiName: 'Case Scoring Service',
    });

    // POST /upload => calls uploadAndStartLambda
    const uploadResource = api.root.addResource('upload');
    uploadResource.addMethod('POST', new apigateway.LambdaIntegration(uploadAndStartLambda));

    const sesPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    });   
    weightApplicationLambda.addToRolePolicy(sesPolicy);
    scoreHistoryTable.grantWriteData(weightApplicationLambda);

    // ======================
    // API GATEWAY SETUP
    // ======================
     // Create or reuse an existing API  

    // Optionally, you can add other resources or methods for your other Lambdas

    // Outputs
    new cdk.CfnOutput(this, 'StateMachineArn', { value: stateMachine.stateMachineArn });

    // Output the API endpoint for quick reference
    new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.url });
  }
}
