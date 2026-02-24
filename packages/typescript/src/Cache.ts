import { HttpClient } from "@alumnium/core";

export class Cache {
  private client: HttpClient;

  constructor(client: HttpClient) {
    this.client = client;
  }

  async save(): Promise<void> {
    await this.client.saveCache();
  }

  async discard(): Promise<void> {
    await this.client.discardCache();
  }
}
