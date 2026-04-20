---
title: Configuration
description: Configure Alumnium with AI providers like OpenAI, Anthropic, Google, Meta, DeepSeek and Ollama. Learn how to set up API keys and environment variables for test automation.
---

Alumnium needs access to an AI model to work. The following models are supported:

| Provider                | Model                    |
| ----------------------- | ------------------------ |
| [Anthropic][1]          | Claude 4.5 Haiku         |
| [GitHub][20]            | GPT-4o Mini              |
| [Google][2]             | Gemini 3.1 Flash Lite    |
| [OpenAI][3] _(default)_ | GPT-5 Nano               |
| [DeepSeek][12]          | DeepSeek R1              |
| [Meta][8]               | Llama 4 Maverick 17B     |
| [MistralAI][16]         | Mistral Medium 3         |
| [Ollama][15]            | Mistral Small 3.1 24B    |
| [xAI][18]               | Grok 4.1 Fast Reasoning  |

These models were chosen because they provide the best balance between intelligence, performance, and cost. Most models now support reasoning capabilities for improved accuracy and decision-making in test automation.

:::tip[Trying out?]
[Google][7] and [GitHub][21] provide free-of-charge plans in many regions, which are convenient for experimenting. Alumnium automatically retries the requests when hitting rate limits on the free plans.
:::

## Anthropic

To use Anthropic as an AI provider in Alumnium:

1. Get the [API key][4].
2. Export the following environment variables before running tests:

```bash
export ALUMNIUM_MODEL="anthropic"
export ANTHROPIC_API_KEY="sk-ant-..."
```

## GitHub

To use GitHub Models AI provider with OpenAI in Alumnium:

1. Get the [personal access token][21].
2. Export the following environment variables before running tests:

```bash
export ALUMNIUM_MODEL="github"
export OPENAI_API_KEY="github_pat_..."
```

## Google

To use Google AI Studio as an AI provider in Alumnium:

1. Get the [API key][5].
2. Export the following environment variables before running tests:

```bash
export ALUMNIUM_MODEL="google"
export GOOGLE_API_KEY="..."
```

## OpenAI

To use OpenAI as an AI provider in Alumnium:

1. Get the [API key][6].
2. Export the following environment variables before running tests:

```bash
export ALUMNIUM_MODEL="openai"
export OPENAI_API_KEY="sk-proj-..."
```

## DeepSeek

:::caution
DeepSeek support is experimental and doesn't work with vision checks. The current implementation works via the DeepSeek Platform, but we're looking forward to extending it with Ollama, llama.cpp, etc.
:::

To use DeepSeek as an AI provider in Alumnium:

1. Set up a [DeepSeek Platform][13] account.
2. Get the [API key][14].
3. Export the following environment variable before running tests:

```bash
export ALUMNIUM_MODEL="deepseek"
export DEEPSEEK_API_KEY="sk-..."
```

## Meta

:::caution
Llama support is experimental. Its performance also highly depends on how you run it. The current implementation works via Amazon Bedrock, but we're looking forward to extending it with Ollama, llama.cpp, etc.
:::

To use Meta Llama as an AI provider in Alumnium:

1. Set up an [Amazon Bedrock][9] account.
2. Enable access to [Llama 4 Maverick][10] models.
3. Get the [access key and secret][11].
4. Export the following environment variables before running tests:

```bash
export ALUMNIUM_MODEL="aws_meta"
export AWS_ACCESS_KEY="..."
export AWS_SECRET_KEY="..."
```

## MistralAI

To use MistralAI as an AI provider in Alumnium:

1. Get the [API key][17].
2. Export the following environemnt variables before running testes:

```bash
export ALUMNIUM_MODEL="mistralai"
export MISTRAL_API_KEY="..."
```


## Ollama

:::caution
Ollama support is experimental and performance depends on your hardware.
:::

To use Ollama for a fully local model inference:

1. Download and install [Ollama][15].
2. Download Mistrall Small 3.1 24B model:

```bash
ollama pull mistral-small3.1:24b
```

3. Export the following environment variable before running tests:

```bash
export ALUMNIUM_MODEL="ollama"
export ALUMNIUM_OLLAMA_URL="..."  # if you host Ollama on a server
```

## xAI

To use xAI as an AI provider in Alumnium:

1. Get the [API key][19].
2. Export the following environemnt variables before running testes:

```bash
export ALUMNIUM_MODEL="xai"
export XAI_API_KEY="xai-..."
```

Read next to learn how to write tests!

[1]: https://www.anthropic.com
[2]: https://aistudio.google.com
[3]: https://openai.com
[4]: https://docs.anthropic.com/en/api/getting-started
[5]: https://aistudio.google.com/app/apikey
[6]: https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key
[7]: https://ai.google.dev/gemini-api/docs/billing
[8]: https://www.llama.com
[9]: https://aws.amazon.com/bedrock/
[10]: https://aws.amazon.com/bedrock/llama/
[11]: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html
[12]: https://www.deepseek.com
[13]: https://platform.deepseek.com
[14]: https://platform.deepseek.com/api_keys
[15]: https://ollama.com
[16]: https://mistral.ai/products/ai-studio
[17]: https://docs.mistral.ai/getting-started/quickstart#account-setup
[18]: https://x.ai
[19]: https://x.ai/api
[20]: https://docs.github.com/en/github-models
[21]: https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models#experimenting-with-ai-models-using-the-api
