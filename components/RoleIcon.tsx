import type { RoleKey } from "@/lib/types";

/**
 * Real per-role glyphs — shield/claws/spark/bow/heart — replacing an earlier
 * set of generic abstract shapes (a hexagon, a starburst, a resize-style
 * cross, a jagged arrow) that didn't read as any role at all. Original
 * artwork, not traced from Riot's UI.
 */
export function RoleIcon({ role }: { role: RoleKey }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {role === "top" && (
        <path fill="currentColor" stroke="none" d="M12 2 4 5v6c0 5.25 3.4 8.76 8 9.95 4.6-1.19 8-4.7 8-9.95V5l-8-3z" />
      )}
      {role === "jungle" && (
        <g fill="currentColor" stroke="none">
          <path d="M4.5 3.3c3.3 1 6.1 3.9 7.1 7.2-3.7-.9-6.5-3.8-7.1-7.2z" />
          <path d="M10.2 2c1.8 2.7 2.5 6.1 1.8 9.5-2-2.6-2.7-6-1.8-9.5z" />
          <path d="M15.5 3.3c.7 3.4-.1 6.8-2.5 9.3-.5-3.4.3-6.7 2.5-9.3z" />
        </g>
      )}
      {role === "mid" && (
        <path
          fill="currentColor"
          stroke="none"
          d="M12 2c.7 4.4 2.5 7.1 6.7 7.8-4.2.7-6 3.4-6.7 7.8-.7-4.4-2.5-7.1-6.7-7.8C9.5 9.1 11.3 6.4 12 2z"
        />
      )}
      {role === "adc" && (
        <>
          <path d="M6.3 3c-2.9 2.9-4.1 5.8-4.1 9s1.2 6.1 4.1 9" />
          <path d="M4 12h13.5" />
          <path d="M14.3 8.3 18 12l-3.7 3.7" />
        </>
      )}
      {role === "support" && (
        <path
          fill="currentColor"
          stroke="none"
          d="M12 21s-7-4.35-9.5-9C1 8.6 2.6 5 6 5c2 0 3.5 1.2 4 2 .5-.8 2-2 4-2 3.4 0 5 3.6 3.5 7-2.5 4.65-9.5 9-9.5 9z"
        />
      )}
    </svg>
  );
}
