"use client";

import { useEffect, useRef, useState } from "react";
import { champTag } from "@/lib/ladder";
import { championIconUrl } from "@/lib/ddragon";

/**
 * Real Data Dragon champion square art wherever a champion is represented —
 * replaces the generic "two-letter initials in a colored box" chip that used
 * to be everywhere (champion pool, mastery, match rows, duo synergy, live
 * popup). Falls back to that same initials chip if `version` isn't loaded
 * yet or the image fails (an exotic/very-new champion name Data Dragon
 * doesn't have art for under this exact string, or the load errors out
 * before the image can settle).
 *
 * Uses a manually-attached native `error` listener (ref + addEventListener)
 * rather than React's onError prop — a load that fails near-instantly (seen
 * testing against a network that rejects the CDN host outright) can race
 * ahead of React's synthetic listener attachment and never call it, even
 * though the browser did fire a real `error` event on the element. A native
 * listener added in an effect right after the img mounts doesn't have that
 * gap: img.complete is checked once on attach to also catch a failure that
 * already happened by the time the effect runs.
 */
export function ChampIcon({ champ, version, className }: { champ: string; version: string | null; className: string }) {
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Resetting `errored` when champ/version change is a state *adjustment*,
  // not a side effect — done during render (React's documented pattern for
  // this) instead of in a useEffect, which would cost an extra render pass.
  const target = `${champ}|${version}`;
  const [prevTarget, setPrevTarget] = useState(target);
  if (target !== prevTarget) {
    setPrevTarget(target);
    setErrored(false);
  }

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth === 0) {
      setErrored(true);
      return;
    }
    function onError() {
      setErrored(true);
    }
    img.addEventListener("error", onError);
    return () => img.removeEventListener("error", onError);
  }, [champ, version]);

  if (!version || errored) {
    return <span className={className}>{champTag(champ)}</span>;
  }
  return (
    <span className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size icon repeated many times per page, not worth next/image's config for an external CDN */}
      <img ref={imgRef} src={championIconUrl(version, champ)} alt="" />
    </span>
  );
}
