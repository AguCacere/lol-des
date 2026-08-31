import { NextResponse } from "next/server";
import { sendDiscordNotification } from "@/lib/discord";

/**
 * Temporary — one-off manual test to confirm DISCORD_WEBHOOK_URL is wired up
 * correctly in production, at the user's explicit request. Deleted right
 * after use, same as every other scratch diagnostic route this session.
 */
export async function GET() {
  await sendDiscordNotification("Pedre es teemo");
  return NextResponse.json({ sent: true });
}
