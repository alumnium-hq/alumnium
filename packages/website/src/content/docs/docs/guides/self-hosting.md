---
title: Self-hosting LLMs
description: Learn how to use self-hosted LLMs with Alumnium for AI-powered test automation.
---

Using third-party AI providers such as Anthropic, Google AI Studio, and OpenAI is the easiest way to use Aluminium. However, you might prefer using self-hosted LLMs for security, privacy, or cost reasons.

Alumnium provides several options for using self-hosted LLMs:

1. Serverless models on [Amazon Bedrock][1].
2. OpenAI service on [Azure][4].
3. Models via [Azure AI Foundry][7].
4. Local model inference with [Ollama][6].

## Amazon Bedrock

Alumnium supports the following models on Amazon Bedrock:

- [Claude 4.5 Haiku][2]
- [Llama 4 Maverick][3]

Please follow the respective documentation on how to enable access to these models on Bedrock. Once enabled, configure Alumnium to use it by exporting the following environment variables:

```bash
export ALUMNIUM_MODEL="aws_anthropic" # for Claude
export ALUMNIUM_MODEL="aws_meta"      # for Llama

export AWS_ACCESS_KEY="..."
export AWS_SECRET_KEY="..."
export AWS_REGION_NAME="us-west-1"  # default: us-east-1
```

## Azure Foundry

Alumnium supports GPT-5 Nano model on Azure AI Foundry.

Please follow the respective documentation on how to deploy the model to Azure AI Foundry. Once deployed, configure Alumnium to use it by exporting the following environment variables:

```bash
export ALUMNIUM_MODEL="azure_foundry"
export AZURE_FOUNDRY_TARGET_URI="https://..."
export AZURE_FOUNDRY_API_KEY="..."
export AZURE_FOUNDRY_API_VERSION="..."
```

## Azure OpenAI

Alumnium supports GPT-5 Nano model on Azure OpenAI service.

Please follow the respective documentation on how to deploy the model to Azure. Once deployed, configure Alumnium to use it by exporting the following environment variables:

```bash
export ALUMNIUM_MODEL="azure_openai"
export AZURE_OPENAI_API_KEY="..."
# Change as needed
export AZURE_OPENAI_API_VERSION="2025-03-01-preview"
export AZURE_OPENAI_ENDPOINT="https://my-model.openai.azure.com"
```

## Ollama

Ollama provides a fully local model inference. You can use it to power test execution on your own machine or deploy it to a server and access via API.

Please follow the respective documentation on how to deploy Ollama to the cloud. Once deployed, download necessary model and configure Alumnium to use it:

```bash
ollama pull mistral-small3.1:24b
export ALUMNIUM_MODEL="ollama"
```

[1]: https://aws.amazon.com/bedrock
[2]: https://aws.amazon.com/bedrock/claude/
[3]: https://aws.amazon.com/bedrock/llama/
[4]: https://azure.microsoft.com/en-us/products/ai-services/openai-service
[6]: https://ollama.com
[7]: https://azure.microsoft.com/en-us/products/ai-foundry
