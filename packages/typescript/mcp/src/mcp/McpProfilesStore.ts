import os from "node:os";
import path from "node:path";
import { Env, FileStore } from "@alumnium/core/internal";

export class McpProfilesStore extends FileStore {
  constructor() {
    super(
      Env.ALUMNIUM_MCP_PROFILES_DIR ??
        path.join(os.homedir(), ".alumnium", "profiles"),
    );
  }
}
