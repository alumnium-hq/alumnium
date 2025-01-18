from anthropic import RateLimitError as AnthropicRateLimitError
from openai import RateLimitError as OpenAIRateLimitError
from google.api_core.exceptions import ResourceExhausted as GoogleRateLimitError


class BaseAgent:
    def _with_rate_limit_retry(self, llm):
        return llm.with_retry(
            retry_if_exception_type=(
                AnthropicRateLimitError,
                OpenAIRateLimitError,
                GoogleRateLimitError,
            ),
            stop_after_attempt=10,
        )
