import type { Recording } from "./Recording.ts";

export namespace TestCache {
  export interface LookupOptions {
    /**
     * Recording version to accept, `Recording.DEFAULT_VERSION` by default. A
     * recording of another version is a miss, see `Recording.Schema` `version`.
     */
    version?: number | undefined;
  }

  export interface Lookups {
    hits: number;
    misses: number;
  }
}

export interface TestCache {
  readonly lookups: TestCache.Lookups;

  /**
   * Looks up the recording of a test, staged or saved.
   *
   * @param text - Test text.
   * @param options - Lookup options.
   * @returns Recording if found in the accepted version, `null` otherwise.
   */
  lookup(
    text: string,
    options?: TestCache.LookupOptions,
  ): Promise<Recording.Type | null>;

  /**
   * Stages a recording, replacing any other one of the same test.
   *
   * @param recording - Recording to stage.
   */
  update(recording: Recording.Type): Promise<void>;

  /** Persists the staged recordings. */
  save(): Promise<void>;

  /** Drops the staged recordings. */
  discard(): Promise<void>;
}
