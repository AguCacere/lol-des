/**
 * Replaces the 🔥/🔻 emoji used for win/loss streaks — at the ~10.5px size
 * these render at (ladder row + profile chip), color emoji fall back to a
 * scaled-down bitmap strike on a lot of platforms (Windows/Android chief
 * among them) instead of a real vector render, so they came out visibly
 * blocky. A plain currentColor SVG stays crisp at any size and DPI, and
 * automatically matches the chip's win/loss color instead of the emoji's
 * own fixed red/orange.
 */
export function StreakIcon({ result }: { result: "W" | "L" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      {result === "W" ? (
        <path d="M12.7 2c.9 3.4-2.6 5.2-4.3 8.1C7.5 11.7 7 13.2 7 14.7 7 18.7 9.5 22 12.7 22s5.8-3.4 5.8-7.5c0-1.9-.7-3.3-1.5-4.6-.3 1.9-1.6 3.2-3 3.2-1.1 0-1.9-.9-1.7-2.1.2-1.7.9-2.8 1.1-5.3-1.7.6-3 2-3.3 3.8-.4-1.4-.2-3 .6-4.5z" />
      ) : (
        <path d="M5 7h14a1 1 0 0 1 .8 1.6l-7 9a1 1 0 0 1-1.6 0l-7-9A1 1 0 0 1 5 7z" />
      )}
    </svg>
  );
}
