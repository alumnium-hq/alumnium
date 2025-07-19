from langchain_anthropic import ChatAnthropic
from langchain_aws import ChatBedrockConverse
from langchain_deepseek import ChatDeepSeek
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from langchain_mistralai import ChatMistralAI

from alumnium.logutils import get_logger
from .models import Model, Provider

logger = get_logger(__name__)


class LLMFactory:
    """Factory for creating LLM instances based on model configuration."""

    @staticmethod
    def create_llm(
        model: Model,
        azure_openai_api_version: str = None,
        aws_access_key: str = None,
        aws_secret_key: str = None,
        aws_region_name: str = "us-east-1",
    ):
        """Create an LLM instance based on the model configuration."""
        logger.info(f"Creating LLM for model: {model.provider.value}/{model.name}")

        if model.provider == Provider.AZURE_OPENAI:
            if not azure_openai_api_version:
                raise ValueError("Azure OpenAI API version is required for Azure OpenAI models")
            llm = AzureChatOpenAI(
                model=model.name,
                api_version=azure_openai_api_version,
                temperature=0,
                seed=1,
            )
        elif model.provider == Provider.ANTHROPIC:
            llm = ChatAnthropic(model=model.name, temperature=0)
        elif model.provider == Provider.AWS_ANTHROPIC or model.provider == Provider.AWS_META:
            if not aws_access_key or not aws_secret_key:
                raise ValueError("AWS access key and secret key are required for AWS models")
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
            llm = ChatOllama(model=model.name, temperature=0)
        elif model.provider == Provider.OPENAI:
            llm = ChatOpenAI(model=model.name, temperature=0, seed=1)
        else:
            raise NotImplementedError(f"Model {model.provider} not implemented")

        return llm
