from pathlib import Path

from anthropic import RateLimitError as AnthropicRateLimitError
from botocore.exceptions import ClientError as BedrockClientError
from google.api_core.exceptions import ResourceExhausted as GoogleRateLimitError
from openai import RateLimitError as OpenAIRateLimitError

from alumnium.models import Model, Provider


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
        elif provider == Provider.OLLAMA:
            prompt_path /= "ollama"
        else:
            prompt_path /= "openai"

        self.prompts = {}
        for prompt_file in prompt_path.glob("*.md"):
            with open(prompt_file) as f:
                self.prompts[prompt_file.stem] = f.read()

    def _update_usage(self, usage_metadata):
        if usage_metadata:
            self.usage["input_tokens"] += usage_metadata.get("input_tokens", 0)
            self.usage["output_tokens"] += usage_metadata.get("output_tokens", 0)
            self.usage["total_tokens"] += usage_metadata.get("total_tokens", 0)

    def _with_retry(self, llm):
        llm = self.__with_bedrock_retry(llm)
        llm = self.__with_rate_limit_retry(llm)
        return llm

    # Bedrock Llama is quite unstable, we should be retrying
    # on `ModelErrorException` but it cannot be imported.
    def __with_bedrock_retry(self, llm):
        return llm.with_retry(
            retry_if_exception_type=(BedrockClientError,),
            stop_after_attempt=3,
        )

    def __with_rate_limit_retry(self, llm):
        return llm.with_retry(
            retry_if_exception_type=(
                AnthropicRateLimitError,
                OpenAIRateLimitError,
                GoogleRateLimitError,
            ),
            stop_after_attempt=10,
        )
