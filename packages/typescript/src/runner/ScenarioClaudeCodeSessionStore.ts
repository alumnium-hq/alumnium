import type {
  SessionKey,
  SessionStore,
  SessionStoreEntry,
} from "@anthropic-ai/claude-agent-sdk";

export namespace ScenarioClaudeCodeSessionStore {
  export type Key = SessionKey;

  export type SubkeyKey = Omit<SessionKey, "subpath">;

  export type Entry = SessionStoreEntry;

  export interface Item {
    sessionId: string;
    mtime: number;
  }

  export interface Record {
    key: Key;
    entries: Entry[];
    mtime: number;
  }

  export interface Snapshot {
    sessionId: string;
    records: Record[];
  }
}

export class ScenarioClaudeCodeSessionStore implements SessionStore {
  #records: ScenarioClaudeCodeSessionStore.Record[] = [];

  constructor(session?: ScenarioClaudeCodeSessionStore.Snapshot | undefined) {
    if (session) this.#records = structuredClone(session.records);
  }

  //#region Claude Code API

  async append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
    let record = this.#findRecord(key);
    if (record) {
      record.entries.push(...structuredClone(entries));
      record.mtime = Date.now();
    } else {
      this.#records.push({
        key: structuredClone(key),
        entries: structuredClone(entries),
        mtime: Date.now(),
      });
    }
  }

  async load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
    const record = this.#findRecord(key);
    if (!record) return null;
    return structuredClone(record.entries);
  }

  async listSessions(
    _projectKey: string,
  ): Promise<ScenarioClaudeCodeSessionStore.Item[]> {
    return this.#records.flatMap((record) => {
      if (record.key.subpath) return [];
      return [
        {
          sessionId: record.key.sessionId,
          mtime: record.mtime,
        },
      ];
    });
  }

  async delete(key: SessionKey): Promise<void> {
    const recordIdx = this.#findRecordIndex(key);
    if (recordIdx === -1) return;
    this.#records.splice(recordIdx, 1);
  }

  async listSubkeys(
    subkeyKey: ScenarioClaudeCodeSessionStore.SubkeyKey,
  ): Promise<string[]> {
    return this.#records.flatMap((record) => {
      if (record.key.sessionId !== subkeyKey.sessionId || !record.key.subpath)
        return [];
      return [record.key.subpath];
    });
  }

  //#endregion

  //#region Internal API

  snapshot(sessionId: string): ScenarioClaudeCodeSessionStore.Snapshot {
    return {
      sessionId,
      records: structuredClone(this.#records),
    };
  }

  #findRecord(key: SessionKey) {
    return this.#records[this.#findRecordIndex(key)];
  }

  #findRecordIndex(key: SessionKey) {
    return this.#records.findIndex(
      (record) =>
        key.sessionId === record.key.sessionId &&
        key.subpath === record.key.subpath,
    );
  }

  //#endregion
}
