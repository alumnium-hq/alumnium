from typing import Any, Optional

from langchain_core.caches import RETURN_VAL_TYPE, BaseCache

from ..logutils import get_logger

logger = get_logger(__name__)


class NullCache(BaseCache):
    def __init__(self):
        self.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    def lookup(self, prompt: str, llm_string: str) -> Optional[RETURN_VAL_TYPE]:
        return None

    def update(self, prompt: str, llm_string: str, return_val: RETURN_VAL_TYPE):
        pass

    def save(self):
        pass

    def discard(self):
        pass

    def clear(self, **kwargs: Any):
        pass
