// src/components/screening/StatusLegend.jsx
//
// Die Status mit je einem Satz (Texte: STATUS_EXPLANATIONS in format.js). Design B: eine weiße Karte.

import { StatusIcon } from "./StatusBadge.jsx";
import { STATUS_EXPLANATIONS, STATUS_TEXT } from "./format.js";

// Öffentlich erscheinen seit 15.10.2026 nur Endergebnisse (Tazkiyah 30), deshalb zwei Status
const ORDER = ["konform", "nicht_konform"];

const TILE = {
  konform: "bg-[var(--ok-bg)] text-[var(--ok-text)]",
  nicht_konform: "bg-[var(--bad-bg)] text-[var(--bad-text)]",
  nicht_geprueft: "bg-[var(--none-bg)] text-[var(--none-text)]",
};

export default function StatusLegend() {
  return (
    <dl className="card grid gap-6 md:grid-cols-2">
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
