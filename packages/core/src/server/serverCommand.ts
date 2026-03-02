import { parseArgs } from "node:util";
import { getLogger } from "../utils/logger.js";
import { serverApp } from "./serverApp.js";

const logger = getLogger(import.meta.url);

export function serverCommand() {
  logger.debug("Starting server");

  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      port: {
        type: "string",
        default: "8013",
        short: "p",
      },
    },
    allowPositionals: true,
  });
  const port = parseInt(values.port || "8013");

  serverApp.listen(port, () => {
    logger.info(`Started at http://localhost:${port}`);
  });
}
