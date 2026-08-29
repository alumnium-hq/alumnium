import { discordInviteUrl } from "#/copy/links";
import * as z from "zod/mini";

export const DiscordInvite = z.object({
  approximate_member_count: z.number(),
  approximate_presence_count: z.number(),
});

export type DiscordInvite = z.infer<typeof DiscordInvite>;

export namespace DiscordData {
  export type Invite = z.infer<typeof DiscordData.Invite>;
  export type Members = z.infer<typeof DiscordData.Members>;
}

export abstract class DiscordData {
  static Invite = z.object({
    approximate_member_count: z.number(),
    approximate_presence_count: z.number(),
  });

  static Members = z.object({
    memberCount: z.number(),
    presenceCount: z.number(),
  });

  static async fetchMembers(): Promise<DiscordData.Members> {
    const response = await fetch("/api/discord.json");

    if (!response.ok)
      throw new Error(
        `Failed to fetch Discord member data: ${response.status} ${response.statusText}`,
      );

    return z.parse(DiscordData.Members, await response.json());
  }

  static async fetchInvite(): Promise<DiscordData.Invite> {
    const inviteApiUrl = DiscordData.inviteApiUrl(discordInviteUrl);
    const response = await fetch(inviteApiUrl);

    if (!response.ok)
      throw new Error(
        `Failed to fetch invite data for ${discordInviteUrl} from ${inviteApiUrl}: ${response.status} ${response.statusText}`,
      );

    return z.parse(DiscordInvite, await response.json());
  }

  static inviteApiUrl(href: string): string {
    const url = new URL(href);
    const inviteCode = url.pathname.split("/").filter(Boolean).at(-1);
    if (!inviteCode) throw new Error(`Invalid Discord invite URL: ${href}`);

    return `https://discord.com/api/v10/invites/${inviteCode}?with_counts=true`;
  }
}
