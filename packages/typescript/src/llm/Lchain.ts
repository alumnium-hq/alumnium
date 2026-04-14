import {
  deserializeStoredGeneration,
  serializeGeneration,
} from "@langchain/core/caches";
import type { StoredGeneration } from "@langchain/core/messages";
import type { Generation } from "@langchain/core/outputs";
import { logSchemaParseError } from "../utils/logFormat.ts";
import { scanTypes } from "../utils/typesScan.ts";
import { LchainSchema } from "./LchainSchema.ts";

export abstract class Lchain {
  static toStored(
    this: void,
    generation: Generation,
  ): LchainSchema.StoredGeneration {
    const stored = serializeGeneration(generation);
    scanTypes({
      url: import.meta.url,
      id: "serialized",
      value: stored,
    });
    const result = LchainSchema.StoredGeneration.safeParse(stored);
    if (!result.success) {
      const message = logSchemaParseError(
        "stored generation",
        generation,
        result,
      );
      throw new Error(
        `Failed to serialize generation to stored format: ${message}`,
      );
    }
    return result.data;
  }

  static fromStored(stored: LchainSchema.StoredGeneration): Generation {
    return deserializeStoredGeneration(stored as unknown as StoredGeneration);
  }
}
