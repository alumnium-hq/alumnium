import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from anthropic import RateLimitError as AnthropicRateLimitError
from botocore.exceptions import ClientError as BedrockClientError
from google.genai.errors import ClientError as GoogleClientError
from httpx import HTTPStatusError
from langchain_core.runnables import Runnable
from openai import InternalServerError as OpenAIInternalServerError
from openai import RateLimitError as OpenAIRateLimitError
from retry import retry

from ..logutils import get_logger
from ..models import Model, Provider

logger = get_logger(__name__)


@dataclass
class Response:
    """
    Common interface for LLM chain responses.

    Normalizes responses across providers (Anthropic, OpenAI, Google, etc.)
    into a single structure with content, reasoning, structured output, and tool calls.
    """

    content: str = ""
    reasoning: str | None = None
    structured: Any = None
    tool_calls: list[dict] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)


class BaseAgent:
    def __init__(self):
        self.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        self._load_prompts()

    def _load_prompts(self):
        provider = Model.current.provider
        # Convert CamelCase to snake_case (e.g., ChangesAnalyzer -> changes_analyzer)
        agent_name = self.__class__.__name__.replace("Agent", "")
        agent_name = re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", "_", agent_name).lower()
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
    def _invoke_chain(self, chain: Runnable, *args) -> Response:
        result = chain.invoke(*args)

        if isinstance(result, dict) and "raw" in result:
            message = result["raw"]
            structured = result.get("parsed")
        else:
            message = result
            structured = None

        reasoning = self._extract_reasoning(message.content)
        if reasoning:
            logger.info(f"  <- Reasoning: {reasoning}")

        usage = {}
        if message.usage_metadata:
            self._update_usage(message.usage_metadata)
            usage["input_tokens"] = message.usage_metadata.get("input_tokens", 0)
            usage["output_tokens"] = message.usage_metadata.get("output_tokens", 0)
            usage["total_tokens"] = message.usage_metadata.get("total_tokens", 0)

        return Response(
            content=self._extract_text(message.content),
            reasoning=reasoning,
            structured=structured,
            tool_calls=getattr(message, "tool_calls", None) or [],
            usage=usage,
        )

    def _extract_reasoning(self, content) -> str | None:
        if not isinstance(content, list) or not content:
            return None

        first = content[0]
        if not isinstance(first, dict):
            return None

        if "reasoning_content" in first:  # Anthropic
            return first["reasoning_content"]
        elif "summary" in first:  # OpenAI
            return " ".join(s["text"] for s in first["summary"])
        elif "thinking" in first:  # Google
            return first["thinking"]

        return None

    def _extract_text(self, content) -> str:
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            texts = []
            for block in content:
                if isinstance(block, str):
                    texts.append(block)
                elif isinstance(block, dict) and block.get("type") == "text":
                    texts.append(block.get("text", ""))
            return "".join(texts)

        return str(content)

    def _update_usage(self, usage_metadata):
        self.usage["input_tokens"] += usage_metadata.get("input_tokens", 0)
        self.usage["output_tokens"] += usage_metadata.get("output_tokens", 0)
        self.usage["total_tokens"] += usage_metadata.get("total_tokens", 0)
