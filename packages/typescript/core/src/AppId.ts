import { kebabCase } from "case-anything";
import z from "zod";

// NOTE: We define it before schema, so we can use it in `catch`.
const DEFAULT_APP_ID = "unknown";

export const AppId = z
  .string()
  .catch(() => DEFAULT_APP_ID)
  .transform((val) => {
    try {
      const url = URL.parse(val);
      if (url?.host) val = url.host;
    } catch {}
    return kebabCase(val);
  })
  .brand("AppId");

export type AppId = z.infer<typeof AppId>;

export const UNKNOWN_APP_ID: AppId = DEFAULT_APP_ID as AppId;
