# Project **AI Workflow Orchestrator**  
_Serverless architecture for Amazon Bedrock agents orchestrated by AWS Step Functions, with version‑controlled prompts in Amazon S3 and infrastructure declared via AWS CDK._

---

## ✨ Overview
This project demonstrates how to build a fully serverless generative‑AI pipeline on AWS:

1. **Prompts** stored and versioned in **Amazon S3**.  
2. **Amazon Bedrock agents** that carry out specific tasks (analysis, summarization, classification, etc.).  
3. **AWS Step Functions** orchestrating agent calls, exception handling, and branching logic.  
4. **AWS CDK** (TypeScript) defining all infrastructure as code, enabling deployment with a single command.

---

## 🏗️ Architecture

```text
 ┌────────────┐           ┌──────────────┐
 │  User /    │  REST/    │ API Gateway  │
 │ Application├──────────►│  (Optional)  │
 └────────────┘           └──────┬───────┘
                                 │Invoke
                         ┌───────▼────────┐
                         │ Step Functions │
                         │ State Machine  │
                         └──────┬─────────┘
        getObject(S3) ─────────►│         │◄─── putObject(S3)
                                 │         │
                         ┌───────▼─────────┐
                         │ Bedrock Agent A │  (Task 1)
                         ├─────────────────┤
                         │ Bedrock Agent B │  (Task 2)
                         └─────────────────┘
```

# Summary Flow

1. The state machine reads the appropriate prompt from S3.  
2. It invokes one or more agents (foundation model + orchestration) sequentially or in parallel.  
3. It persists results/artifacts back to S3 or to another destination (DynamoDB, EventBridge, SNS).  
4. It returns the response to the application (directly or through API Gateway/Lambda proxy).

📂 Folder Structure

```
.
├── cdk/                  # CDK stack (TypeScript)
│   ├── lib/
│   │   └── ai-stack.ts   # Defines S3, IAM, Step Functions, Bedrock agents
│   └── bin/
│       └── ai.ts         # CDK entry point
├── prompts/              # Source prompts (uploaded to S3)
│   ├── analyze.md
│   └── summarize.md
└── README.md             # (This file)
```

# 🚀 Deployment

```bash
# 1. Install dependencies
npm install -g aws-cdk
npm ci

# 2. Configure AWS credentials and bootstrap if necessary
cdk bootstrap

# 3. Deploy
cdk deploy AiWorkflowStack

# 4. Upload prompts to the bucket
aws s3 sync prompts/ s3://<prompt-bucket-name>/
```

# 🔄 Detailed Execution Flow
1. **Trigger** – Can be REST (API Gateway), an S3 event, or a CloudWatch schedule.  
2. **Step Functions**  
   - **GetPrompt task** → S3:GetObject  
   - **InvokeAgent task** (Map/Parallel) → Bedrock:InvokeAgent  
   - **StoreResult task** → S3:PutObject  
   - **Choice / Catch** for failure handling (timeout, quota, etc.).  
3. The response is returned to the caller or posted to a queue/event.

📜 License

MIT