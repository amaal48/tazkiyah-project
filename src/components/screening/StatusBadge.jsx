// src/components/screening/StatusBadge.jsx
//
// Die drei Status, immer Symbol plus Text (nie nur Farbe). „Nicht geprüft“ ist bewusst
// neutral grau, nicht Amber (Amber stand früher für „Grenzwertig“).

import { STATUS_TEXT } from "./format.js";

// Design B2: kein gefülltes Etikett, sondern Farbe und Linie (eckig)
const STYLES = {
  konform: "border border-[var(--ok-text)] text-[var(--ok-text)]",
  nicht_konform: "border border-[var(--bad-text)] text-[var(--bad-text)]",
  nicht_geprueft: "border border-[var(--control-border)] text-[var(--none-text)]",
};

/** Kleines Strich-Symbol je Status (✓, ✕, –), auch für Legende und Prüfungszeilen. */
export function StatusIcon({ status, size = 14, strokeWidth = 2.3 }) {
  const paths = {
    konform: <path d="M3.5 8.5l3 3 6-7" />,
    nicht_konform: <path d="M4 4l8 8M12 4l-8 8" />,
    nicht_geprueft: <path d="M4 8h8" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[status] || paths.nicht_geprueft}
    </svg>
  );
}

export default function StatusBadge({ status, size = "sm", inverse = false, className = "" }) {
  const key = STYLES[status] ? status : "nicht_geprueft";
  // inverse: auf dunkelgrüner Fläche (Ergebnisfeld „konform“), Hellgold mit Linie
  const colors = inverse ? "border border-[var(--gold-light)] text-[var(--gold-light)]" : STYLES[key];
  const pad = size === "lg" ? "px-[18px] py-[10px] text-[16px]" : "px-3 py-1.5 text-[14px]";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-semibold leading-none ${pad} ${colors} ${className}`}>
      <StatusIcon status={key} size={size === "lg" ? 16 : 14} />
      {STATUS_TEXT[key]}
    </span>
  );
}
