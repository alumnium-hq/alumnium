from os import getenv

from .cache.filesystem_cache import FilesystemCache
from .cache.sqlite_cache import SQLiteCache
from .logutils import get_logger

logger = get_logger(__name__)


class CacheFactory:
    @staticmethod
    def create_cache() -> FilesystemCache | SQLiteCache:
        cache_provider = getenv("ALUMNI_CACHE_PROVIDER", "filesystem")
        if cache_provider == "sqlite":
            return SQLiteCache()
        elif cache_provider == "filesystem":
            return FilesystemCache()
        else:
            raise ValueError(f"Unknown cache provider: {cache_provider}")
