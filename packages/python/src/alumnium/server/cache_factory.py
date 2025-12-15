from os import getenv
from typing import Optional

from langchain_core.caches import BaseCache

from .cache.chained_cache import ChainedCache
from .cache.filesystem_cache import FilesystemCache
from .cache.fragments_cache import FragmentsCache
from .cache.null_cache import NullCache
from .cache.sqlite_cache import SQLiteCache
from .logutils import get_logger

logger = get_logger(__name__)


class CacheFactory:
    @staticmethod
    def create_cache() -> Optional[BaseCache]:
        cache_provider = getenv("ALUMNIUM_CACHE", "filesystem").lower()

        if cache_provider == "sqlite":
            return SQLiteCache()
        elif cache_provider == "filesystem":
            # Default: chain FilesystemCache (exact match) + FragmentsCache (semantic match)
            return ChainedCache([FilesystemCache(), FragmentsCache()])
        elif cache_provider in ("false", "0", "none", "null"):
            return NullCache()
        else:
            raise ValueError(f"Unknown cache provider: {cache_provider}")
