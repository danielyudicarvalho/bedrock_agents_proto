# Projeto **AI Workflow Orchestrator**  
_Arquitetura serverless para agentes Amazon Bedrock orquestrados por AWS Step Functions, com prompts versionados no Amazon S3 e infraestrutura declarada via AWS CDK._

---

## ✨ Visão Geral
Este projeto demonstra como construir um pipeline de IA generativa totalmente serverless na AWS:

1. **Prompts** armazenados e versionados em **Amazon S3**.  
2. **Agentes do Amazon Bedrock** que executam tarefas específicas (análise, sumarização, classificação etc.).  
3. **AWS Step Functions** orquestrando a lógica de chamada dos agentes, tratamento de exceções e branching.  
4. **AWS CDK** (TypeScript) definindo toda a infraestrutura como código, permitindo _deploy_ com um único comando.

---

## 🏗️ Arquitetura

```text
 ┌────────────┐           ┌──────────────┐
 │ Usuário/   │  REST/    │ API Gateway  │
 │ Aplicação  ├──────────►│  (Opcional)  │
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
# Fluxo resumido

1. A state machine lê o prompt adequado em S3.

2. Chama sequencial ou paralelamente um ou mais Agents (modelos foundation model + orchestration).

3. Persiste resultados/artefatos novamente no S3 ou em outro destino (DynamoDB, EventBridge, SNS).

4. Retorna a resposta à aplicação (diretamente ou via API Gateway/Lambda proxy).


📂 Estrutura de Pastas

```
.
├── cdk/                  # Stack CDK (TypeScript)
│   ├── lib/
│   │   └── ai-stack.ts   # Define S3, IAM, Step Functions, Bedrock    agents
│   └── bin/
│       └── ai.ts         # Entry point CDK
├── prompts/              # Prompts fonte (serão enviados ao S3)
│   ├── analyze.md
│   └── summarize.md
└── README.md             # (Este arquivo)

```

# 🚀 Implantação

```

    # 1. Instalar dependências
    npm install -g aws-cdk
    npm ci

    # 2. Configurar credenciais AWS e bootstrap se necessário
    cdk bootstrap

    # 3. Fazer o deploy
    cdk deploy AiWorkflowStack

    # 4. Enviar prompts para o bucket
    aws s3 sync prompts/ s3://<nome-do-bucket-prompts>/

```

# 🔄 Fluxo de Execução Detalhado
1. Trigger – Pode ser REST (API Gateway), evento S3 ou CloudWatch Schedule.

2. Step Functions:

     - Task GetPrompt → S3:GetObject

     - Task InvokeAgent (Map/Parallel) → Bedrock:InvokeAgent

     - Task StoreResult → S3:PutObject

     - Choice / Catch para tratamento de falhas (timeout, quota, etc.).

3. Resposta é devolvida para quem chamou ou posta em fila/evento.

📜 Licença

MIT