import type { RoleKey } from "@/lib/types";

/**
 * Real role badges for all five roles. top/jungle/mid/support are Riot's own
 * square art (their own dark backdrop baked in, no transparency); adc is a
 * transparent gold glyph instead (no self-contained backdrop) — .role-chip
 * img uses object-fit:contain rather than cover so this one letterboxes
 * cleanly inside the chip's own gold-wash background instead of getting
 * cropped, which has no visible effect on the other four since they're
 * already perfect squares matching the chip's own aspect ratio.
 */
const ROLE_IMAGE: Record<RoleKey, string> = {
  top: "/icons/roles/top.webp",
  jungle: "/icons/roles/jungle.webp",
  mid: "/icons/roles/mid.webp",
  adc: "/icons/roles/adc.webp",
  support: "/icons/roles/support.webp",
};

export function RoleIcon({ role }: { role: RoleKey }) {
  // eslint-disable-next-line @next/next/no-img-element -- fixed tiny badge art, not a page asset worth next/image's overhead
  return <img src={ROLE_IMAGE[role]} alt={role} />;
}
