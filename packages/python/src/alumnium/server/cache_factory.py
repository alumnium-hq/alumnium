from os import getenv
from typing import Optional

from langchain_core.caches import BaseCache

from .cache.chained_cache import ChainedCache
from .cache.elements_cache import ElementsCache
from .cache.null_cache import NullCache
from .cache.response_cache import ResponseCache
from .logutils import get_logger

logger = get_logger(__name__)


class CacheFactory:
    @staticmethod
    def create_cache() -> Optional[BaseCache]:
        cache_provider = getenv("ALUMNIUM_CACHE", "filesystem").lower()

        if cache_provider == "filesystem":
            cache_path = getenv("ALUMNIUM_CACHE_PATH", ".alumnium/cache")
            return ChainedCache([ResponseCache(cache_path), ElementsCache(cache_path)])
        elif cache_provider in ("false", "0", "none", "null"):
            return NullCache()
        else:
            raise ValueError(f"Unknown cache provider: {cache_provider}")
