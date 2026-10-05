// src/components/screening/StatusLegend.jsx
//
// Die drei Status mit je einem Satz (Texte: STATUS_EXPLANATIONS in format.js,
// auch für die Tooltips im Screener). Design B: eine weiße Karte, drei Spalten.

import { StatusIcon } from "./StatusBadge.jsx";
import { STATUS_EXPLANATIONS, STATUS_TEXT } from "./format.js";

const ORDER = ["konform", "nicht_konform", "nicht_geprueft"];

const TILE = {
  konform: "bg-[var(--ok-bg)] text-[var(--ok-text)]",
  nicht_konform: "bg-[var(--bad-bg)] text-[var(--bad-text)]",
  nicht_geprueft: "bg-[var(--none-bg)] text-[var(--none-text)]",
};

export default function StatusLegend() {
  return (
    <dl className="card grid gap-6 md:grid-cols-3">
      {ORDER.map((status) => (
        <div key={status} className="flex items-start gap-3">
          <span className={"flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full " + TILE[status]}>
            <StatusIcon status={status} size={16} />
          </span>
          <div>
            <dt className="font-semibold text-[var(--text)]">{STATUS_TEXT[status]}</dt>
            <dd className="mt-0.5 text-[15px] leading-relaxed text-[var(--muted)]">{STATUS_EXPLANATIONS[status]}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
