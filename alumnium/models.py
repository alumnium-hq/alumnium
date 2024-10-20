from os import environ
from enum import Enum


class Model(Enum):
    AZURE_OPENAI = "gpt-4o-mini"
    ANTHROPIC = "claude-3-haiku-20240307"
    GOOGLE = "gemini-1.5-flash-002"
    OPENAI = "gpt-4o-mini"

    @classmethod
    def load(cls):
        return cls[environ.get("ALUMNIUM_MODEL", "openai").upper()]
