from os import getenv
from typing import Optional

from .cache.filesystem_cache import FilesystemCache
from .cache.null_cache import NullCache
from .cache.sqlite_cache import SQLiteCache
from .logutils import get_logger

logger = get_logger(__name__)


class CacheFactory:
    @staticmethod
    def create_cache() -> Optional[FilesystemCache | SQLiteCache]:
        cache_provider = getenv("ALUMNIUM_CACHE", "filesystem").lower()

        if cache_provider == "sqlite":
            return SQLiteCache()
        elif cache_provider == "filesystem":
            return FilesystemCache()
        elif cache_provider in ("false", "0", "none", "null"):
            return NullCache()
        else:
            raise ValueError(f"Unknown cache provider: {cache_provider}")
