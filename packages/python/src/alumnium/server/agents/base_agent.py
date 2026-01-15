from pathlib import Path

from anthropic import RateLimitError as AnthropicRateLimitError
from botocore.exceptions import ClientError as BedrockClientError
from google.genai.errors import ClientError as GoogleClientError
from httpx import HTTPStatusError
from langchain_core.messages import AIMessage
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
        base_prompt_path = Path(__file__).parent / f"{agent_name}_prompts"

        # Map provider to prompt directory name
        provider_map = {
            Provider.ANTHROPIC: "anthropic",
            Provider.AWS_ANTHROPIC: "anthropic",
            Provider.GOOGLE: "google",
            Provider.DEEPSEEK: "deepseek",
            Provider.AWS_META: "meta",
            Provider.MISTRALAI: "mistralai",
            Provider.OLLAMA: "ollama",
            Provider.XAI: "xai",
        }

        # Try provider-specific prompts first, fall back to openai
        provider_dir = provider_map.get(provider, "openai")
        prompt_path = base_prompt_path / provider_dir

        # Fall back to openai if provider-specific directory doesn't exist
        if not prompt_path.exists():
            prompt_path = base_prompt_path / "openai"

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
                ),
            )
            # AWS Bedrock rate limit errors
            or (isinstance(error, BedrockClientError) and error.response["Error"]["Code"] == "ThrottlingException")
            # Google rate limit errors
            or (isinstance(error, GoogleClientError) and error.code == 429)
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
            content = result["raw"].content
            self._update_usage(result["raw"].usage_metadata)
        else:
            content = result.content
            self._update_usage(result.usage_metadata)

        if isinstance(content, list) and content:
            if "reasoning_content" in content[0]:  # Anthropic reasoning
                logger.info(f"  <- Reasoning: {content[0]['reasoning_content']}")
            elif "summary" in content[0]:  # OpenAI reasoning
                for summary in content[0]["summary"]:
                    logger.info(f"  <- Reasoning: {summary['text']}")
            elif "thinking" in content[0]:  # Google reasoning
                logger.info(f"  <- Reasoning: {content[0]['thinking']}")

        return result

    def _update_usage(self, usage_metadata):
        if usage_metadata:
            self.usage["input_tokens"] += usage_metadata.get("input_tokens", 0)
            self.usage["output_tokens"] += usage_metadata.get("output_tokens", 0)
            self.usage["total_tokens"] += usage_metadata.get("total_tokens", 0)
