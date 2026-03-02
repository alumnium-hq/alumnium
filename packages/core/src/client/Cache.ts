import type { HttpClient } from "../clients/HttpClient.js";
import type { NativeClient } from "../clients/NativeClient.js";

export class Cache {
  private client: HttpClient | NativeClient;

  constructor(client: HttpClient | NativeClient) {
    this.client = client;
  }

  async save(): Promise<void> {
    await this.client.saveCache();
  }

  async discard(): Promise<void> {
    await this.client.discardCache();
  }
}
