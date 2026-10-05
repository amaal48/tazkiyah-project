// src/components/screening/SourceLink.jsx
//
// Quellenangabe als Links. Alle Fundstellen einer Prüfung führen auf dieselbe
// Erklärseite; Angaben mit „[Ableitung]“ bekommen einen Hinweis.

import { splitSources } from "../../screening/explanations.js";
import { routes } from "../../lib/hashRoute.js";

const DERIVATION = "[Ableitung]";

export default function SourceLink({ source, criterion, className = "" }) {
  const parts = splitSources(source);
  if (!parts.length) return null;
  const href = criterion ? routes.criterion(criterion) : null;
  const derived = parts.some((p) => p.includes(DERIVATION));
  return (
    <span className={"inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-1 " + className}>
      <span className="text-[var(--muted)]">Quelle:</span>
      {parts.map((p, i) => {
        const label = p.replace(DERIVATION, "").trim();
        return (
          <span key={i}>
            {href ? (
              <a href={href} className="text-[var(--primary)] underline decoration-[var(--gold)]/40 underline-offset-2 hover:decoration-[var(--gold-soft)]">
                {label}
              </a>
            ) : (
              <span className="text-[var(--text-soft)]">{label}</span>
            )}
            {i < parts.length - 1 && <span className="text-[var(--muted)]">;</span>}
          </span>
        );
      })}
      {derived && <span className="text-[var(--muted)]">(von uns abgeleitet, nicht wörtlich im Standard)</span>}
    </span>
  );
}
