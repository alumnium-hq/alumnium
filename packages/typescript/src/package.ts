import packageJson from "../package.json" with { type: "json" };

declare const BUILD_COMMIT_SHA: string | undefined;
const COMMIT_SHA =
  typeof BUILD_COMMIT_SHA === "undefined" ? undefined : BUILD_COMMIT_SHA;

export const ALUMNIUM_VERSION = packageJson.version;
export const ALUMNIUM_BIN_VERSION = COMMIT_SHA
  ? `${ALUMNIUM_VERSION}+${COMMIT_SHA}`
  : ALUMNIUM_VERSION;
