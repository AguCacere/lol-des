function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

/** Real Riot profile icon with an initials fallback — shared by Sinergia de dúo and the winrate leaderboards, anywhere a PLAYER (not a champion) needs a small avatar chip. */
export function PlayerAvatar({ name, iconUrl, className }: { name: string; iconUrl: string | null; className: string }) {
  return (
    <span className={className}>
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- one small fixed-size avatar, not worth next/image's config for an external CDN
        <img src={iconUrl} alt="" className="duo-avatar-img" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
