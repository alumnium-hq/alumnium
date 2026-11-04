---
title: Self-hosting LLMs
description: Learn how to use self-hosted LLMs with Alumnium for AI-powered test automation.
---

Using third-party AI providers such as Anthropic, Google AI Studio, and OpenAI is the easiest way to use Aluminium. However, you might prefer using self-hosted LLMs for security, privacy, or cost reasons.

Alumnium provides several options for using self-hosted LLMs:

1. Serverless models on [Amazon Bedrock][1].
2. OpenAI models on [Azure][4].
3. Local model inference with [Ollama][6].

## Amazon Bedrock

Alumnium can use any model available on Amazon Bedrock by passing its model or inference profile ID after `aws/`. By default, it uses [GPT-6 Luna][5]. Alumnium picks prompts and request settings tuned for the model vendor (e.g. [Claude][2], GPT) and falls back to generic prompts for other vendors.

Please follow the respective documentation on how to enable access to the model on Bedrock. Once enabled, configure Alumnium to use it by exporting the following environment variables:

```bash
export ALUMNIUM_MODEL="aws"                                # for GPT-6 Luna
export ALUMNIUM_MODEL="aws/us.anthropic.claude-haiku-5-5"  # for Claude

export AWS_ACCESS_KEY="..."
export AWS_SECRET_KEY="..."
export AWS_REGION_NAME="us-west-1"  # default: us-east-1
```

## Azure

Alumnium supports GPT-6 Luna model on Azure via the Responses API. It works with both Azure OpenAI and Azure AI Foundry resources.

Please follow the respective documentation on how to deploy the model to Azure. Once deployed, configure Alumnium to use it by exporting the following environment variables:

```bash
export ALUMNIUM_MODEL="azure"  # or "azure/<deployment-name>"
export AZURE_API_KEY="..."
# Change as needed
export AZURE_ENDPOINT="https://my-project.openai.azure.com"
```

## Ollama

Ollama provides a fully local model inference. You can use it to power test execution on your own machine or deploy it to a server and access via API.

Please follow the respective documentation on how to deploy Ollama to the cloud. Once deployed, download necessary model and configure Alumnium to use it:

```bash
ollama pull qwen3.6
export ALUMNIUM_MODEL="ollama"
export ALUMNIUM_OLLAMA_URL="..."  # if you host Ollama on a server
```

[1]: https://aws.amazon.com/bedrock
[2]: https://aws.amazon.com/bedrock/claude/
[4]: https://azure.microsoft.com/en-us/products/ai-services/openai-service
[5]: https://aws.amazon.com/bedrock/openai/
[6]: https://ollama.com
