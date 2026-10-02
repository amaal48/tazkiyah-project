// src/components/screening/StatusLegend.jsx

import StatusBadge from "./StatusBadge.jsx";

const ITEMS = [
  ["konform", "Alle Prüfungen sind bestanden."],
  ["nicht_konform", "Mindestens eine Prüfung ist nicht bestanden."],
  ["nicht_geprueft", "Mindestens eine Prüfung steht noch aus oder ließ sich mit den Daten nicht abschließen; keine ist nicht bestanden."],
];

export default function StatusLegend() {
  return (
    <dl className="grid gap-3 md:grid-cols-3">
      {ITEMS.map(([status, text]) => (
        <div key={status} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <dt>
            <StatusBadge status={status} />
          </dt>
          <dd className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">{text}</dd>
        </div>
      ))}
    </dl>
  );
}
