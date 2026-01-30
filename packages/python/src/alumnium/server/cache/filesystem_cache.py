import json
import os
import shutil
from pathlib import Path
from typing import Any

from filelock import FileLock
from langchain_core.caches import RETURN_VAL_TYPE, BaseCache
from langchain_core.load import dumps, loads
from xxhash import xxh3_128_hexdigest

from ..logutils import get_logger
from ..models import Model

logger = get_logger(__name__)


class FilesystemCache(BaseCache):
    def __init__(self, cache_dir: str = ".alumnium/cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        # Each (llm_string, hashed_request) pair is cached in memory
        # as (response, save) where `save` means it should be saved to filesystem.
        self._in_memory_cache: dict[tuple[str, str], tuple[RETURN_VAL_TYPE, bool]] = {}

    def lookup(self, prompt: str, llm_string: str) -> RETURN_VAL_TYPE | None:
        try:
            system_message, human_message = self._extract_messages(prompt)
            hashed_request = self._hash_request(system_message, human_message, llm_string)

            if (llm_string, hashed_request) in self._in_memory_cache:
                logger.debug(f"Cache hit (in-memory) for message: {human_message[:100]}...")
                return_val, _ = self._in_memory_cache[(llm_string, hashed_request)]
                self._update_usage(return_val[0].message.usage_metadata)
                return return_val

            cache_path = self._get_cache_path(hashed_request)
            response_file = cache_path / "response.json"
            if response_file.exists():
                logger.debug(f"Cache hit (file) for message: {human_message[:100]}...")
                with open(response_file, "r") as f:
                    response = loads(f.read())
                    self._in_memory_cache[(llm_string, hashed_request)] = ([response], False)
                    self._update_usage(response.message.usage_metadata)
                    return [response]
        except Exception as e:
            logger.fatal(f"Error occurred while looking up cache: {e}")

        return None

    def update(self, prompt: str, llm_string: str, return_val: RETURN_VAL_TYPE):
        system_message, human_message = self._extract_messages(prompt)
        hashed_request = self._hash_request(system_message, human_message, llm_string)
        self._in_memory_cache[(llm_string, hashed_request)] = (return_val, True)

    def save(self):
        for (_, hashed_request), (return_val, save) in self._in_memory_cache.items():
            if save:
                cache_path = self._get_cache_path(hashed_request)
                cache_path.mkdir(parents=True, exist_ok=True)
                lock_path = f"{cache_path}.lock"
                lock = FileLock(lock_path, timeout=1)
                try:
                    lock.acquire()
                    response_file = cache_path / "response.json"
                    with open(response_file, "w") as f:
                        f.write(dumps(return_val[0], pretty=True))
                finally:
                    lock.release()
                    # https://github.com/tox-dev/filelock/pull/408
                    Path.unlink(Path(lock_path))
        self.discard()

    def discard(self):
        self._in_memory_cache.clear()

    def clear(self, **kwargs: Any):
        for path in self.cache_dir.iterdir():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                os.remove(path)
        self.discard()

    def _extract_messages(self, prompt: str) -> tuple[str, str]:
        messages = json.loads(prompt)
        system_message = ""
        human_message = ""
        for msg in messages:
            if msg["kwargs"]["type"] == "system":
                system_message = msg["kwargs"]["content"]
            elif msg["kwargs"]["type"] == "human":
                content = msg["kwargs"]["content"]
                if isinstance(content, list):
                    for content_item in content:
                        if "text" in content_item:
                            human_message += content_item["text"]
                        if "image_url" in content_item:
                            human_message += content_item["image_url"]["url"]
                elif isinstance(content, dict):
                    if "text" in content:
                        human_message += content["text"]
                    if "image_url" in content:
                        human_message += content["image_url"]["url"]
                else:
                    human_message += content

        return system_message, human_message

    def _hash_request(self, system_message: str, human_message: str, llm_string: str) -> str:
        combined = f"{system_message}|{human_message}|{llm_string}"
        return xxh3_128_hexdigest(combined)

    def _get_cache_path(self, hashed_request: str) -> Path:
        provider = Model.current.provider.value
        model_name = Model.current.name
        return self.cache_dir / provider / model_name / hashed_request

    def _update_usage(self, usage_metadata: dict) -> None:
        self.usage["input_tokens"] += usage_metadata.get("input_tokens", 0)
        self.usage["output_tokens"] += usage_metadata.get("output_tokens", 0)
        self.usage["total_tokens"] += usage_metadata.get("total_tokens", 0)
