import { DiscordData } from "#/data/discord";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
  const invite = await DiscordData.fetchInvite();
  const result = {
    memberCount: invite.approximate_member_count,
    presenceCount: invite.approximate_presence_count,
  };

  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=900" },
  });
};
