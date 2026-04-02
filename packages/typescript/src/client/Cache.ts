import type { Client } from "../clients/Client.ts";

export namespace Cache {
  export type ClearProps = Record<string, unknown>;
}

export class Cache {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  save(): Promise<void> {
    return this.client.saveCache();
  }

  discard(): Promise<void> {
    return this.client.discardCache();
  }
}
