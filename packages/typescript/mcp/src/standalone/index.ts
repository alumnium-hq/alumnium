// Standalone (single-file executable) support, kept out of the main barrel so
// it can be set up before the MCP server and its drivers are loaded.
export * from "./embeddedAssetNames.ts";
export * from "./setupEmbeddedDependencies.ts";
