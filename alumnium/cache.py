from .clients.http_client import HttpClient
from .clients.native_client import NativeClient


class Cache:
    def __init__(self, client: HttpClient | NativeClient):
        self.client = client

    def save(self):
        self.client.save_cache()

    def discard(self):
        self.client.discard_cache()
