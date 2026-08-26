import type { RoleKey } from "@/lib/types";

/** Real Riot role badges (gold-on-black, self-contained square art) for the roles we have source images for. */
const ROLE_IMAGE: Partial<Record<RoleKey, string>> = {
  top: "/icons/roles/top.webp",
  jungle: "/icons/roles/jungle.webp",
  mid: "/icons/roles/mid.webp",
  support: "/icons/roles/support.webp",
};

/**
 * Hand-drawn fallback for roles without a source image yet (currently just
 * ADC — no bot-lane icon was provided alongside the other four). Kept as
 * original artwork, not traced from Riot's UI.
 */
function AdcGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.3 3c-2.9 2.9-4.1 5.8-4.1 9s1.2 6.1 4.1 9" />
      <path d="M4 12h13.5" />
      <path d="M14.3 8.3 18 12l-3.7 3.7" />
    </svg>
  );
}

export function RoleIcon({ role }: { role: RoleKey }) {
  const src = ROLE_IMAGE[role];
  if (!src) return <AdcGlyph />;
  // eslint-disable-next-line @next/next/no-img-element -- fixed tiny badge art, not a page asset worth next/image's overhead
  return <img src={src} alt={role} />;
}
