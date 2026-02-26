import z from "zod";

export const ApiVersioned = z.object({
  api_version: z.string().default("v1").describe("API version"),
});
