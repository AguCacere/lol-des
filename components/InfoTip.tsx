/**
 * Small "ⓘ" trigger that reveals an explainer bubble on hover/focus — pure CSS,
 * no JS state — so it works with keyboard nav (tab + focus-visible) too.
 * Used next to metrics that can read as ambiguous without context (Fase 5).
 *
 * `align="end"` para los que están pegados al borde derecho: el globo mide
 * 230px y centrado sobre el ícono se sale de la pantalla, que es peor que no
 * mostrarlo. Anclado a la derecha crece hacia adentro.
 */
export function InfoTip({ text, align = "center" }: { text: string; align?: "center" | "end" }) {
  return (
    <span className="info-tip" tabIndex={0}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className={`info-tip-bubble${align === "end" ? " end" : ""}`} role="tooltip">
        {text}
      </span>
    </span>
  );
}
