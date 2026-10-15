import z from "zod";

export const SessionId = z.string().brand<"SessionId">();

export type SessionId = z.infer<typeof SessionId>;
