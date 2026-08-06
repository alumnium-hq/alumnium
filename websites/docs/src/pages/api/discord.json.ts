import { DiscordData } from "#/data/discord";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
  console.log("!!!!!!!!!!!", import.meta.env.NODE_ENV);
  const data = await fetchData();
  return Response.json(data, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=900" },
  });
};

async function fetchData() {
  const invite = await DiscordData.fetchInvite();
  return {
    memberCount: invite.approximate_member_count,
    presenceCount: invite.approximate_presence_count,
  };
}
