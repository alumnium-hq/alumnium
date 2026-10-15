import { McpMode } from "../../../src/mcp/McpMode.ts";
import { McpServer } from "../../../src/mcp/McpServer.ts";

const [mode, port] = process.argv.slice(2);
await new McpServer({
  transport: "http",
  mode: McpMode.parse(mode),
  port: Number(port),
}).run();
