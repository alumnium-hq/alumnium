from enum import Enum
from os import environ


class Provider(Enum):
    AZURE_OPENAI = "azure_openai"
    ANTHROPIC = "anthropic"
    AWS_ANTHROPIC = "aws_anthropic"
    AWS_META = "aws_meta"
    DEEPSEEK = "deepseek"
    GOOGLE = "google"
    OLLAMA = "ollama"
    OPENAI = "openai"


class Name:
    DEFAULT = {
        Provider.AZURE_OPENAI: "gpt-4.1-mini", #2025-04-14
        Provider.ANTHROPIC: "claude-3-5-haiku-20241022",
        Provider.AWS_ANTHROPIC: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
        Provider.AWS_META: "us.meta.llama4-scout-17b-instruct-v1:0",
        Provider.DEEPSEEK: "deepseek-chat",
        Provider.GOOGLE: "gemini-2.0-flash-001",
        Provider.OLLAMA: "mistral-small3.1",
        Provider.OPENAI: "gpt-4.1-mini-2025-04-14",
    }


class Model:
    current = None

    def __init__(self, provider=None, name=None):
        self.provider = Provider(provider or Provider.OPENAI)
        self.name = name or Name.DEFAULT.get(self.provider)


provider, *name = environ.get("ALUMNIUM_MODEL", "openai").lower().split("/", maxsplit=1)
Model.current = Model(provider, name and name[0])
