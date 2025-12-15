from typing import Any, Optional

from langchain_core.caches import RETURN_VAL_TYPE, BaseCache

from ..logutils import get_logger

logger = get_logger(__name__)


class ChainedCache(BaseCache):
    """Cache that tries multiple caches in order until a hit is found.

    This allows combining multiple caching strategies, e.g.:
    - FilesystemCache for exact prompt matches
    - FragmentsCache for semantic element-based matches
    """

    def __init__(self, caches: list[BaseCache]):
        """Initialize with a list of caches to try in order.

        Args:
            caches: List of cache instances to try. Order matters - first cache is tried first.
        """
        self.caches = caches
        self.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    def lookup(self, prompt: str, llm_string: str) -> Optional[RETURN_VAL_TYPE]:
        """Try each cache in order until a hit is found.

        Args:
            prompt: The prompt string
            llm_string: The LLM identifier string

        Returns:
            Cached response if found in any cache, None otherwise
        """
        for i, cache in enumerate(self.caches):
            result = cache.lookup(prompt, llm_string)
            if result is not None:
                cache_name = cache.__class__.__name__
                logger.debug(f"Cache hit in {cache_name} (position {i})")
                self._aggregate_usage(cache)
                return result

        logger.debug("Cache miss in all chained caches")
        return None

    def update(self, prompt: str, llm_string: str, return_val: RETURN_VAL_TYPE):
        """Update all caches with the new response.

        Args:
            prompt: The prompt string
            llm_string: The LLM identifier string
            return_val: The response to cache
        """
        for cache in self.caches:
            cache.update(prompt, llm_string, return_val)

    def save(self):
        """Save all caches to persistent storage."""
        for cache in self.caches:
            cache.save()

    def discard(self):
        """Discard unsaved changes in all caches."""
        for cache in self.caches:
            cache.discard()

    def clear(self, **kwargs: Any):
        """Clear all caches.

        Args:
            **kwargs: Additional arguments passed to each cache's clear method
        """
        for cache in self.caches:
            cache.clear(**kwargs)

    def _aggregate_usage(self, cache: BaseCache):
        """Aggregate usage stats from the cache that had a hit.

        Args:
            cache: The cache that had the hit
        """
        for key in self.usage:
            self.usage[key] = cache.usage.get(key, 0)
