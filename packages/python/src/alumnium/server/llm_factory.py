from os import getenv

from langchain_anthropic import ChatAnthropic
from langchain_aws import ChatBedrockConverse
from langchain_deepseek import ChatDeepSeek
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mistralai import ChatMistralAI
from langchain_ollama import ChatOllama
from langchain_openai import AzureChatOpenAI, ChatOpenAI

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
            llm = AzureChatOpenAI(
                model=model.name,
                api_version=azure_openai_api_version,
                temperature=0,
                seed=1,
            )
        elif model.provider == Provider.ANTHROPIC:
            llm = ChatAnthropic(model=model.name, temperature=0)
        elif model.provider == Provider.AWS_ANTHROPIC or model.provider == Provider.AWS_META:
            aws_access_key = getenv("AWS_ACCESS_KEY")
            aws_secret_key = getenv("AWS_SECRET_KEY")
            aws_region_name = getenv("AWS_REGION_NAME", "us-east-1")
            llm = ChatBedrockConverse(
                model_id=model.name,
                temperature=0,
                aws_access_key_id=aws_access_key,
                aws_secret_access_key=aws_secret_key,
                region_name=aws_region_name,
            )
        elif model.provider == Provider.DEEPSEEK:
            llm = ChatDeepSeek(model=model.name, temperature=0)
        elif model.provider == Provider.GOOGLE:
            llm = ChatGoogleGenerativeAI(model=model.name, temperature=0)
        elif model.provider == Provider.MISTRALAI:
            llm = ChatMistralAI(model=model.name, temperature=0)
        elif model.provider == Provider.OLLAMA:
            if not getenv("ALUMNIUM_OLLAMA_URL"):
                llm = ChatOllama(model=model.name, temperature=0)
            else:
                cloud_endpoint = getenv("ALUMNIUM_OLLAMA_URL")
                llm = ChatOllama(model=model.name, base_url=cloud_endpoint, temperature=0)
        elif model.provider == Provider.OPENAI:
            llm = ChatOpenAI(model=model.name, temperature=0, seed=1)
        else:
            raise NotImplementedError(f"Model {model.provider} not implemented")

        return llm
