// src/components/screening/BasisLine.jsx
//
// Die Grundlage in einer kompakten Zeile: AAOIFI SS 21, 27, 35 (Link zur Methodik),
// keine Verbindung zur AAOIFI, keine Anlageberatung, kein Rechtsgutachten.

import { routes } from "../../lib/hashRoute.js";

export default function BasisLine({ className = "" }) {
  return (
    <p className={"flex flex-wrap gap-x-2 gap-y-1 text-xs leading-relaxed text-[var(--muted)] " + className}>
      <span>
        Grundlage:{" "}
        <a href={routes.methodik()} className="text-[var(--gold-soft)] underline decoration-[var(--gold)]/40 underline-offset-2 hover:decoration-[var(--gold-soft)]">
          AAOIFI Shari'ah Standards Nr. 21, 27 und 35
        </a>
      </span>
      <span aria-hidden="true">·</span>
      <span>nicht mit der AAOIFI verbunden</span>
      <span aria-hidden="true">·</span>
      <span>keine Anlageberatung, kein Rechtsgutachten (Fatwa)</span>
    </p>
  );
}
