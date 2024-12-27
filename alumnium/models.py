from os import environ
from enum import Enum


class Model(Enum):
    AZURE_OPENAI = "gpt-4o-mini"  # 2024-07-18
    ANTHROPIC = "claude-3-haiku-20240307"
    AWS_ANTHROPIC = "anthropic.claude-3-haiku-20240307-v1:0"
    AWS_META = "us.meta.llama3-2-90b-instruct-v1:0"
    GOOGLE = "gemini-2.0-flash-exp"
    OPENAI = "gpt-4o-2024-11-20"

    @classmethod
    def load(cls):
        return cls[environ.get("ALUMNIUM_MODEL", "openai").upper()]
