from enum import Enum
from os import environ


class Provider(Enum):
    AZURE_OPENAI = "azure_openai"
    ANTHROPIC = "anthropic"
    AWS_ANTHROPIC = "aws_anthropic"
    AWS_META = "aws_meta"
    DEEPSEEK = "deepseek"
    GOOGLE = "google"
    MISTRALAI = "mistralai"
    OLLAMA = "ollama"
    OPENAI = "openai"


class Name:
    DEFAULT = {
        Provider.AZURE_OPENAI: "gpt-4o-mini",  # 2024-07-18
        Provider.ANTHROPIC: "claude-3-haiku-20240307",
        Provider.AWS_ANTHROPIC: "anthropic.claude-3-haiku-20240307-v1:0",
        Provider.AWS_META: "us.meta.llama3-2-90b-instruct-v1:0",
        Provider.DEEPSEEK: "deepseek-chat",
        Provider.GOOGLE: "gemini-2.0-flash-001",
        Provider.MISTRALAI: "mistral-medium-2505",
        Provider.OLLAMA: "mistral-small3.1",
        Provider.OPENAI: "gpt-4o-mini-2024-07-18",
    }


class Model:
    current = None

    def __init__(self, provider=None, name=None):
        self.provider = Provider(provider or Provider.OPENAI)
        self.name = name or Name.DEFAULT.get(self.provider)


provider, *name = environ.get("ALUMNIUM_MODEL", "openai").lower().split("/", maxsplit=1)
Model.current = Model(provider, name and name[0])
