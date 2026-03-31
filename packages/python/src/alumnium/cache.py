from typing import Any

from .clients.http_client import HttpClient


class Cache:
    def __init__(self, client: HttpClient):
        self.client = client

    def save(self):
        self.client.save_cache()

    def discard(self):
        self.client.discard_cache()
