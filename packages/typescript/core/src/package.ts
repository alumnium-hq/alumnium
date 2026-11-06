import packageJson from "../package.json" with { type: "json" };

declare const BUILD_COMMIT_SHA: string | undefined;
const COMMIT_SHA =
  typeof BUILD_COMMIT_SHA === "undefined" ? undefined : BUILD_COMMIT_SHA;

declare const ALUMNIUM_VERSION: string | undefined;
export const ALUMNIUM_CORE_VERSION = packageJson.version;

const BIN_VERSION =
  typeof ALUMNIUM_VERSION === "undefined"
    ? ALUMNIUM_CORE_VERSION
    : ALUMNIUM_VERSION;

export const ALUMNIUM_BIN_VERSION = COMMIT_SHA
  ? `${BIN_VERSION}+${COMMIT_SHA}`
  : BIN_VERSION;
