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
        if getenv("ALUMNIUM_CACHE", "true").lower() == "false":
            return NullCache()

        cache_provider = getenv("ALUMNIUM_CACHE_PROVIDER", "filesystem")
        if cache_provider == "sqlite":
            return SQLiteCache()
        elif cache_provider == "filesystem":
            return FilesystemCache()
        else:
            raise ValueError(f"Unknown cache provider: {cache_provider}")
