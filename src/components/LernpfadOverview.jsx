// src/components/LernpfadOverview.jsx
//
// Übersicht des Lernpfads oben in der Akademie (#/lernen): 11 Lektionen als Karten mit Nummer, Titel,
// einem Satz und Status. Inhalte folgen, deshalb sind die Karten noch keine Links.

import { LESSONS } from "../data/lernpfad.js";
import { H1_STYLE } from "./screening/format.js";
import { StarNumber } from "./ornaments.jsx";

function StatusPill({ status }) {
  return (
    <span className="inline-flex border border-[var(--control-border)] px-2.5 py-0.5 text-[13px] font-semibold text-[var(--text-soft)]">{status}</span>
  );
}

export default function LernpfadOverview() {
  return (
    <section aria-labelledby="lernpfad">
      <h1 id="lernpfad" className="font-display" style={{ ...H1_STYLE, fontSize: "clamp(40px, 6vw, 60px)", lineHeight: 1.05 }}>
        Lernen
      </h1>
      <p className="mt-4 max-w-[68ch] text-[19px] leading-relaxed text-[var(--muted)]">
        Der Lernpfad in {LESSONS.length} Lektionen. Die Inhalte erscheinen nach und nach.
      </p>
      <ol className="mt-8 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
        {LESSONS.map((l) => (
          <li key={l.nr} className="card flex h-full flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <StarNumber n={l.nr} size={40} stroke="var(--gold)" color="var(--gold-soft)" />
                <span className="kicker">Lektion {l.nr}</span>
              </span>
              <StatusPill status={l.status} />
            </div>
            <h2 className="font-display text-[26px] font-semibold leading-tight text-[var(--heading)]">{l.title}</h2>
            <p className="text-[16px] leading-relaxed text-[var(--muted)]">{l.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
