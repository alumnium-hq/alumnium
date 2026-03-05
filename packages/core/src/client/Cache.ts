import { Client } from "../clients/Client.js";

export class Cache {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async save(): Promise<void> {
    await this.client.saveCache();
  }

  async discard(): Promise<void> {
    await this.client.discardCache();
  }
}
