/**
 * Best-effort Discord webhook notifier for the group — promotions and
 * win/loss streaks (see lib/refresh.ts). A missing/misconfigured webhook or
 * a Discord outage must never break the refresh cron itself, so every
 * failure here is caught and logged, never thrown. DISCORD_WEBHOOK_URL not
 * being set just means "notifications off" (e.g. local dev/preview), not an
 * error.
 */
export async function sendDiscordNotification(content: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      console.error(`sendDiscordNotification: webhook returned ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("sendDiscordNotification failed —", err instanceof Error ? err.message : err);
  }
}
