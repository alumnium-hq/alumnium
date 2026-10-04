import type { BrowserContext } from "playwright-core";
import type { ToolClass } from "../tools/BaseTool.ts";

/** Optional embedding policies. The CLI keeps its unrestricted local defaults. */
export interface McpPolicy {
  maxSessions?: number;
  resolveCapabilities?: (input: {
    capabilities: string;
    server_url?: string | undefined;
  }) => Record<string, unknown> | Promise<Record<string, unknown>>;
  allowAction?: (tool: ToolClass) => boolean;
  configureBrowserContext?: (context: BrowserContext) => Promise<void>;
}
