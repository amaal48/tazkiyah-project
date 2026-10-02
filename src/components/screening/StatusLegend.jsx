// src/components/screening/StatusLegend.jsx
//
// Die drei Status mit je einem Satz (Texte: STATUS_EXPLANATIONS in format.js,
// auch für die Tooltips im Screener).

import StatusBadge from "./StatusBadge.jsx";
import { STATUS_EXPLANATIONS } from "./format.js";

const ORDER = ["konform", "nicht_konform", "nicht_geprueft"];

/** variant "cards" (drei Karten nebeneinander) oder "list" (untereinander, für eine Karte) */
export default function StatusLegend({ variant = "cards" }) {
  if (variant === "list") {
    return (
      <dl className="space-y-4">
        {ORDER.map((status) => (
          <div key={status}>
            <dt>
              <StatusBadge status={status} />
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-[var(--text-soft)]">{STATUS_EXPLANATIONS[status]}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className="grid gap-3 md:grid-cols-3">
      {ORDER.map((status) => (
        <div key={status} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <dt>
            <StatusBadge status={status} />
          </dt>
          <dd className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">{STATUS_EXPLANATIONS[status]}</dd>
        </div>
      ))}
    </dl>
  );
}
