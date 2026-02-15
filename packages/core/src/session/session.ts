import { z } from "zod";

export const SESSION_PLATFORMS = [
  "chromium",
  "uiautomator2",
  "xcuitest",
] as const;

export const SessionPlatform = z.enum(SESSION_PLATFORMS);

export type SessionPlatform = z.infer<typeof SessionPlatform>;

export interface Session {
  id: string;
  model: unknown;
  platform: SessionPlatform;
  tools: unknown[];
  llm: unknown;
}
