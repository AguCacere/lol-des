"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether an <img> (attached via the returned ref) failed to load,
 * resetting whenever `key` changes. Shared by ChampIcon and TierEmblem —
 * both need "show real art, fall back to a text chip on error" and can't
 * trust React's onError prop for it: a load that fails near-instantly (seen
 * testing against a network that rejects the CDN host outright) can race
 * ahead of React's synthetic listener attachment and never call it, even
 * though the browser did fire a real `error` event on the element. A native
 * listener added in an effect right after the img mounts doesn't have that
 * gap — img.complete/naturalWidth also catches a failure that already
 * happened by the time the effect runs.
 */
export function useImageFallback(key: string) {
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Resetting `errored` when `key` changes is a state *adjustment*, not a
  // side effect — done during render (React's documented pattern for this)
  // instead of in a useEffect, which would cost an extra render pass.
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
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
  }, [key]);

  return { errored, imgRef };
}
