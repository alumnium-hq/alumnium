from typing import Any

from .clients.http_client import HttpClient
from .clients.native_client import NativeClient


class Cache:
    def __init__(self, client: HttpClient | NativeClient):
        self.client = client

    def save(self):
        self.client.save_cache()

    def discard(self):
        self.client.discard_cache()

    def clear(self, **kwargs: Any):
        """Clear the cache.

        Args:
            **kwargs: Additional arguments passed to the cache clear method
        """
        self.client.cache.clear(**kwargs)

    @property
    def usage(self) -> dict[str, int]:
        """Get cache usage statistics.

        Returns:
            Dict with input_tokens, output_tokens, and total_tokens
        """
        return self.client.cache.usage

    @property
    def caches(self):
        """Get underlying cache instances (for ChainedCache).

        Returns:
            List of caches if using ChainedCache, otherwise None
        """
        cache = self.client.cache
        return getattr(cache, "caches", None)
