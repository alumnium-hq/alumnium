from pathlib import Path

from anthropic import RateLimitError as AnthropicRateLimitError
from botocore.exceptions import ClientError as BedrockClientError
from google.api_core.exceptions import ResourceExhausted as GoogleRateLimitError
from openai import RateLimitError as OpenAIRateLimitError

from alumnium.models import Model


class BaseAgent:
    def _load_prompts(self):
        model_name = Model.load()
        agent_name = self.__class__.__name__.replace("Agent", "").lower()
        prompt_path = Path(__file__).parent / f"{agent_name}_prompts"

        if model_name == Model.ANTHROPIC or model_name == Model.AWS_ANTHROPIC:
            prompt_path /= "anthropic"
        elif model_name == Model.GOOGLE:
            prompt_path /= "google"
        elif model_name == Model.DEEPSEEK:
            prompt_path /= "deepseek"
        elif model_name == Model.AWS_META:
            prompt_path /= "meta"
        elif model_name == Model.OLLAMA:
            prompt_path /= "ollama"
        else:
            prompt_path /= "openai"

        self.prompts = {}
        for prompt_file in prompt_path.glob("*.md"):
            with open(prompt_file) as f:
                self.prompts[prompt_file.stem] = f.read()

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
