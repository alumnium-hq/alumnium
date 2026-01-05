from enum import Enum
from os import getenv


class Provider(Enum):
    AZURE_OPENAI = "azure_openai"
    ANTHROPIC = "anthropic"
    AWS_ANTHROPIC = "aws_anthropic"
    AWS_META = "aws_meta"
    DEEPSEEK = "deepseek"
    GITHUB = "github"
    GOOGLE = "google"
    MISTRALAI = "mistralai"
    OLLAMA = "ollama"
    OPENAI = "openai"
    XAI = "xai"


class Name:
    DEFAULT = {
        Provider.AZURE_OPENAI: "gpt-5-nano",  # 2025-08-07
        Provider.ANTHROPIC: "claude-haiku-4-5-20251001",
        Provider.AWS_ANTHROPIC: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        Provider.AWS_META: "us.meta.llama4-maverick-17b-instruct-v1:0",
        Provider.DEEPSEEK: "deepseek-reasoner",
        Provider.GITHUB: "gpt-4o-mini",
        Provider.GOOGLE: "gemini-3-flash-preview",
        Provider.MISTRALAI: "mistral-medium-2505",
        Provider.OLLAMA: "mistral-small3.1",
        Provider.OPENAI: "gpt-5-nano-2025-08-07",
        Provider.XAI: "grok-4-1-fast-reasoning",
    }


class Model:
    current: "Model"

    def __init__(self, provider=None, name=None):
        self.provider = Provider(provider or Provider.OPENAI)
        self.name = name or Name.DEFAULT.get(self.provider, "")


provider, *name = getenv("ALUMNIUM_MODEL", "").lower().split("/", maxsplit=1)
name = name[0] if name else None
if not provider and getenv("GITHUB_ACTIONS"):
    provider = "github"

Model.current = Model(provider, name)
