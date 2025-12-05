from pathlib import Path

from anthropic import RateLimitError as AnthropicRateLimitError
from botocore.exceptions import ClientError as BedrockClientError
from google.api_core.exceptions import ResourceExhausted as GoogleRateLimitError
from httpx import HTTPStatusError
from langchain_core.runnables import Runnable
from openai import InternalServerError as OpenAIInternalServerError
from openai import RateLimitError as OpenAIRateLimitError
from retry import retry

from ..logutils import get_logger
from ..models import Model, Provider

logger = get_logger(__name__)


class BaseAgent:
    def __init__(self):
        self.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        self._load_prompts()

    def _load_prompts(self):
        provider = Model.current.provider
        agent_name = self.__class__.__name__.replace("Agent", "").lower()
        prompt_path = Path(__file__).parent / f"{agent_name}_prompts"

        if provider == Provider.ANTHROPIC or provider == Provider.AWS_ANTHROPIC:
            prompt_path /= "anthropic"
        elif provider == Provider.GOOGLE:
            prompt_path /= "google"
        elif provider == Provider.DEEPSEEK:
            prompt_path /= "deepseek"
        elif provider == Provider.AWS_META:
            prompt_path /= "meta"
        elif provider == Provider.MISTRALAI:
            prompt_path /= "mistralai"
        elif provider == Provider.OLLAMA:
            prompt_path /= "ollama"
        elif provider == Provider.XAI:
            prompt_path /= "xai"
        else:
            prompt_path /= "openai"

        self.prompts = {}
        for prompt_file in prompt_path.glob("*.md"):
            with open(prompt_file) as f:
                self.prompts[prompt_file.stem] = f.read()

    @staticmethod
    def _should_raise(error) -> bool:
        if (
            # Common API rate limit errors
            isinstance(
                error,
                (
                    AnthropicRateLimitError,
                    OpenAIRateLimitError,
                    GoogleRateLimitError,
                ),
            )
            # AWS Bedrock rate limit errors
            or (isinstance(error, BedrockClientError) and error.response["Error"]["Code"] == "ThrottlingException")
            # MistralAI rate limit errors
            or (isinstance(error, HTTPStatusError) and error.response.status_code == 429)
            # DeepSeek instead throws internal server error
            or isinstance(error, OpenAIInternalServerError)
        ):
            return False  # Retry
        else:
            raise error

    @retry(
        tries=8,
        delay=1,
        backoff=2,
        on_exception=_should_raise,
        logger=logger,
    )
    def _invoke_chain(self, chain: Runnable, *args):
        result = chain.invoke(*args)
        if isinstance(result, dict) and "raw" in result:
            self._update_usage(result["raw"].usage_metadata)
        else:
            self._update_usage(result.usage_metadata)

        return result

    def _update_usage(self, usage_metadata):
        if usage_metadata:
            self.usage["input_tokens"] += usage_metadata.get("input_tokens", 0)
            self.usage["output_tokens"] += usage_metadata.get("output_tokens", 0)
            self.usage["total_tokens"] += usage_metadata.get("total_tokens", 0)
