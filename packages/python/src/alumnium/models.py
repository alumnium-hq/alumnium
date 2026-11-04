from enum import Enum
from os import getenv


class Provider(Enum):
    ANTHROPIC = "anthropic"
    AWS = "aws"
    AZURE = "azure"
    CODEX = "codex"
    CURSOR = "cursor"
    DEEPSEEK = "deepseek"
    GOOGLE = "google"
    META = "meta"
    MISTRALAI = "mistralai"
    OLLAMA = "ollama"
    OPENAI = "openai"
    OPENROUTER = "openrouter"
    XAI = "xai"


class Name:
    DEFAULT = {
        Provider.ANTHROPIC: "claude-haiku-5-5",
        Provider.AWS: "us.openai.gpt-6-luna",
        Provider.AZURE: "gpt-6-luna",
        Provider.CODEX: "gpt-6-luna",
        Provider.CURSOR: "composer-2.5",
        Provider.DEEPSEEK: "deepseek-flash",
        Provider.GOOGLE: "gemini-3.5-flash-lite",
        Provider.META: "muse-spark-1.3-contributor",
        Provider.MISTRALAI: "mistral-large-4",
        Provider.OLLAMA: "qwen3.6",
        Provider.OPENAI: "gpt-6-luna",
        Provider.OPENROUTER: "openai/gpt-6-luna",
        Provider.XAI: "grok-4.3",
    }


class Model:
    def __init__(self, provider=None, name=None):
        self.provider = Provider(provider or Provider.OPENAI)
        self.name = name or Name.DEFAULT.get(self.provider, "")

    @staticmethod
    def from_string(model: str) -> "Model":
        provider, *name = model.lower().split("/", maxsplit=1)
        return Model(provider, name[0] if name else None)

    @staticmethod
    def from_env() -> "Model | None":
        provider, *name = getenv("ALUMNIUM_MODEL", "").lower().split("/", maxsplit=1)
        if not provider:
            return None

        return Model(provider, name[0] if name else None)
