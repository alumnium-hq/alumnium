from os import getenv

from langchain_anthropic import ChatAnthropic
from langchain_aws import ChatBedrockConverse
from langchain_deepseek import ChatDeepSeek
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mistralai import ChatMistralAI
from langchain_ollama import ChatOllama
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from langchain_xai import ChatXAI
from pydantic import SecretStr

from .logutils import get_logger
from .models import Model, Provider

logger = get_logger(__name__)


class LLMFactory:
    """Factory for creating LLM instances based on model configuration."""

    @staticmethod
    def create_llm(model: Model):
        """Create an LLM instance based on the model configuration."""
        logger.info(f"Creating LLM for model: {model.provider.value}/{model.name}")

        if model.provider == Provider.AZURE_OPENAI:
            azure_openai_api_version = getenv("AZURE_OPENAI_API_VERSION")
            if "gpt-4o" in model.name:
                llm = AzureChatOpenAI(
                    model=model.name,
                    api_version=azure_openai_api_version,
                    temperature=0,
                    reasoning_effort="low",
                    seed=1,
                )
            else:
                llm = AzureChatOpenAI(
                    model=model.name,
                    api_version=azure_openai_api_version,
                    temperature=0,
                    reasoning_effort="low",
                    seed=1,
                )
        elif model.provider == Provider.ANTHROPIC:
            llm = ChatAnthropic(
                model_name=model.name,
                stop=None,
                timeout=None,
                thinking={
                    "type": "enabled",
                    "budget_tokens": 1024,
                },
            )
        elif model.provider == Provider.AWS_ANTHROPIC or model.provider == Provider.AWS_META:
            aws_access_key = getenv("AWS_ACCESS_KEY", "")
            aws_secret_key = getenv("AWS_SECRET_KEY", "")
            aws_region_name = getenv("AWS_REGION_NAME", "us-east-1")
            additional_model_request_fields = {}

            if model.provider == Provider.AWS_ANTHROPIC:
                additional_model_request_fields["thinking"] = {
                    "type": "enabled",
                    "budget_tokens": 1024,
                }

            llm = ChatBedrockConverse(
                model=model.name,
                aws_access_key_id=SecretStr(aws_access_key),
                aws_secret_access_key=SecretStr(aws_secret_key),
                region_name=aws_region_name,
                additional_model_request_fields=additional_model_request_fields,
            )
        elif model.provider == Provider.DEEPSEEK:
            llm = ChatDeepSeek(model=model.name, temperature=0, disabled_params={"tool_choice": None})
        elif model.provider == Provider.GOOGLE:
            if "gemini-2.0" in model.name:
                llm = ChatGoogleGenerativeAI(model=model.name, temperature=0)
            else:
                llm = ChatGoogleGenerativeAI(model=model.name, temperature=0, thinking_level="low")
        elif model.provider == Provider.GITHUB:
            llm = ChatOpenAI(model=model.name, base_url="https://models.github.ai/inference", temperature=0)
        elif model.provider == Provider.MISTRALAI:
            llm = ChatMistralAI(model_name=model.name, temperature=0)
        elif model.provider == Provider.OLLAMA:
            if not getenv("ALUMNIUM_OLLAMA_URL"):
                llm = ChatOllama(model=model.name, temperature=0)
            else:
                cloud_endpoint = getenv("ALUMNIUM_OLLAMA_URL")
                llm = ChatOllama(model=model.name, base_url=cloud_endpoint, temperature=0)
        elif model.provider == Provider.OPENAI:
            if "gpt-4o" in model.name:
                llm = ChatOpenAI(
                    model=model.name,
                    base_url=getenv("OPENAI_CUSTOM_URL"),
                    seed=None if getenv("OPENAI_CUSTOM_URL") else 1,  # Only OpenAI official API gets a seed
                    temperature=0,
                )
            else:
                llm = ChatOpenAI(
                    model=getenv("OPENAI_CUSTOM_MODEL", model.name),
                    base_url=getenv("OPENAI_CUSTOM_URL"),
                    seed=None if getenv("OPENAI_CUSTOM_URL") else 1,  # Only OpenAI official API gets a seed
                    reasoning_effort="low",
                    temperature=0,
                )
        elif model.provider == Provider.XAI:
            llm = ChatXAI(model=model.name, temperature=0)
        else:
            raise NotImplementedError(f"Model {model.provider} not implemented")

        return llm
