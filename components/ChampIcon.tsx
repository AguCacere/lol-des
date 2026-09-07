"use client";

import { champTag } from "@/lib/ladder";
import { championIconUrl } from "@/lib/ddragon";
import { useImageFallback } from "@/lib/useImageFallback";

/**
 * Real Data Dragon champion square art wherever a champion is represented —
 * replaces the generic "two-letter initials in a colored box" chip that used
 * to be everywhere (champion pool, mastery, match rows, duo synergy, live
 * popup). Falls back to that same initials chip if `version` isn't loaded
 * yet or the image fails (an exotic/very-new champion name Data Dragon
 * doesn't have art for under this exact string, or the load errors out).
 *
 * El <img> lleva SU PROPIA clase, igual que PlayerAvatar. Antes salía pelado
 * y entonces cada lugar que usa este componente tenía que acordarse de
 * escribir su regla `.loquesea img{...}` para que la imagen tomara el tamaño
 * del contenedor. Donde alguien se olvidaba —"Campeón más jugado" del resumen
 * y el globito de en vivo— el arte salía a su tamaño natural de 120px adentro
 * de una caja de 36 con overflow:hidden, o sea una tira recortada del medio
 * del dibujo. Con la clase acá, ningún uso futuro puede volver a romperse.
 */
export function ChampIcon({ champ, version, className }: { champ: string; version: string | null; className: string }) {
  const { errored, imgRef } = useImageFallback(`${champ}|${version}`);

  if (!version || errored) {
    return <span className={className}>{champTag(champ)}</span>;
  }
  return (
    <span className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size icon repeated many times per page, not worth next/image's config for an external CDN */}
      <img ref={imgRef} className="champ-icon-img" src={championIconUrl(version, champ)} alt="" />
    </span>
  );
}
