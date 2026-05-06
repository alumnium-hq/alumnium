import os from "node:os";
import path from "node:path";
import { Env } from "../Env.ts";
import { FileStore } from "../FileStore/FileStore.ts";

export class McpProfilesStore extends FileStore {
  constructor() {
    super(
      Env.ALUMNIUM_MCP_PROFILES_DIR ??
        path.join(os.homedir(), ".alumnium", "profiles"),
    );
  }
}
