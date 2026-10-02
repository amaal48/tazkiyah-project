// src/components/screening/StatusBadge.jsx
//
// Die drei Status, immer Farbe plus Text. „Nicht geprüft“ ist bewusst neutral grau,
// nicht Amber (Amber stand früher für „Grenzwertig“).

import { STATUS_TEXT } from "./format.js";

const STYLES = {
  konform: "border-[var(--emerald)]/50 bg-[var(--emerald)]/15 text-[var(--emerald-soft)]",
  nicht_konform: "border-[var(--red)]/60 bg-[var(--red)]/15 text-[var(--red-soft)]",
  nicht_geprueft: "border-[var(--border)] bg-[var(--track)] text-[var(--text-soft)]",
};

const DOTS = {
  konform: "bg-[var(--emerald-soft)]",
  nicht_konform: "bg-[var(--red-soft)]",
  nicht_geprueft: "bg-[var(--muted)]",
};

export default function StatusBadge({ status, size = "sm" }) {
  const key = STYLES[status] ? status : "nicht_geprueft";
  const pad = size === "lg" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[11px]";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border tracking-wide ${pad} ${STYLES[key]}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOTS[key]}`} />
      {STATUS_TEXT[key]}
    </span>
  );
}
