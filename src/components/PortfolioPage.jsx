// src/components/PortfolioPage.jsx
//
// Portfolio: eigene Portfolios folgen. Bis dahin nur der Hinweis und der Reinheits-Rechner
// (ebenfalls „folgt“). Keine Beispielpositionen.

import { useEffect } from "react";
import { H1_STYLE, H2_STYLE } from "./screening/format.js";

export default function PortfolioPage({ onBack, anchor }) {
  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [anchor]);

  return (
    <div className="font-body page pb-24 text-left">
      <header className="flex items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <button type="button" onClick={onBack} className="hover:text-[var(--text)]">
          Tazkiyah
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-[var(--text)]">Portfolio</span>
      </header>

      <h1 className="font-display" style={H1_STYLE}>
        Portfolio
      </h1>
      <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">
        Folgt in Kürze: Hier legst du dein eigenes Portfolio an und siehst den Status je Position.
      </p>

      <section id="rechner" className="mt-12 scroll-mt-24">
        <h2 className="font-display" style={H2_STYLE}>
          Reinheits-Rechner für Dividenden
        </h2>
        <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">
          Auch bei konformen Aktien enthalten die Einnahmen oft einen kleinen Anteil aus unzulässigen Quellen (z. B. Zinserträge). Dieser
          Anteil wird gespendet. Folgt: Die Reinigungsbeträge setzen die Prüfung der Umsatzsegmente voraus.
        </p>
      </section>
    </div>
  );
}
