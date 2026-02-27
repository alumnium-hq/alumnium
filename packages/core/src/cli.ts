import { parseArgs } from "util";
import { serverApp } from "./server/serverApp.js";

//#region CLI

const args = parseArgs({
  args: Bun.argv,
  options: {
    port: {
      type: "string",
      default: "8013",
    },
    "legacy-port": {
      type: "string",
      default: "8014",
    },
    "legacy-image": {
      type: "string",
    },
  },
  strict: true,
  allowPositionals: true,
});

const PORT = parseInt(args.values.port || "8013");

console.log(`Starting at http://localhost:${PORT}`);

serverApp.listen(PORT);

//#endregion
