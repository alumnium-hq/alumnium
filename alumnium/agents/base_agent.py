from anthropic import RateLimitError as AnthropicRateLimitError
from botocore.exceptions import ClientError as BedrockClientError
from google.api_core.exceptions import ResourceExhausted as GoogleRateLimitError
from openai import RateLimitError as OpenAIRateLimitError


class BaseAgent:
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
