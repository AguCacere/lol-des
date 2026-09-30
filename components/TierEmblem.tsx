"use client";

import type { TierKey } from "@/lib/types";
import { tierFor, rankEmblemUrl, divisionCorta } from "@/lib/ladder";
import { useImageFallback } from "@/lib/useImageFallback";

/**
 * Real rank emblem crest for the ladder's tier column — replaces the flat
 * "D4 in a colored square" text badge with actual Riot-style rank art. Falls
 * back to that same colored-square-with-initial if the emblem fails to load.
 */
export function TierEmblem({ tierKey, division }: { tierKey: TierKey; division: number }) {
  const { errored, imgRef } = useImageFallback(tierKey);
  const t = tierFor(tierKey);
  const url = rankEmblemUrl(tierKey);

  // No art for this tier yet (url null) or the file failed to load — same
  // colored-square-with-initial either way, just without a wasted 404 first.
  if (url === null || errored) {
    return (
      <span className="tier-badge" style={{ background: t.bg, color: t.fg }}>
        {t.name[0]}
        {/* Sin número en Maestro: no tiene divisiones, así que la chapa
            decía "M1" y eso no existe (ver tieneDivisiones en lib/ladder). */}
        {divisionCorta(tierKey, division)}
      </span>
    );
  }
  return (
    <span className="tier-badge tier-badge-real">
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size icon repeated many times per page, not worth next/image's config for an external CDN */}
      <img ref={imgRef} src={url} alt="" />
    </span>
  );
}
