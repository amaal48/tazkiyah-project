// src/components/StartPage.jsx
//
// Startseite (#/): stellt Tazkiyah vor und verlinkt auf die Bereiche.
// Wie geprüft wird, steht in der Methodik; hier nur die Grundlage als eine Zeile.

import { routes } from "../lib/hashRoute.js";
import StatusLegend from "./screening/StatusLegend.jsx";
import BasisLine from "./screening/BasisLine.jsx";
import { H1_STYLE } from "./screening/format.js";

// Einheitliche Linien-Icons (24 × 24, Strich in currentColor)
const ICONS = {
  screener: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  portfolio: (
    <>
      <path d="M12 3v9h9" />
      <path d="M20.5 15A9 9 0 1 1 9 3.5" />
    </>
  ),
  berichte: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </>
  ),
  watchlist: <path d="M7 3h10v18l-5-4-5 4z" />,
  akademie: (
    <>
      <path d="M3 9l9-5 9 5-9 5z" />
      <path d="M7 11.5V16c0 1.5 2.5 3 5 3s5-1.5 5-3v-4.5" />
    </>
  ),
  methodik: (
    <>
      <path d="M5 6h14M5 12h14M5 18h9" />
    </>
  ),
};

// Titel wie in der Navigation
const AREAS = [
  { key: "screener", title: "Screener", text: "Aktien und ETFs nach den AAOIFI-Standards prüfen.", href: routes.screener() },
  { key: "portfolio", title: "Portfolio", text: "Eigenes Portfolio mit dem Status je Position, folgt in Kürze.", page: "portfolio" },
  { key: "berichte", title: "Berichte", text: "Wöchentliche Berichte zum Marktgeschehen.", page: "reports" },
  { key: "watchlist", title: "Watchlist", text: "Titel merken und im Blick behalten.", page: "watchlist" },
  { key: "akademie", title: "Akademie", text: "Grundlagen zum Investieren nach islamischen Grundsätzen.", page: "faq" },
  { key: "methodik", title: "Methodik", text: "Wie wir prüfen, mit Quelle zu jeder Regel.", href: routes.methodik() },
];

function AreaCard({ area, onGo }) {
  const body = (
    <>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--gold-soft)]">
        {ICONS[area.key]}
      </svg>
      <span className="mt-4 flex items-baseline justify-between gap-3">
        <span className="text-[15px] text-[var(--text)]">{area.title}</span>
        <span aria-hidden="true" className="text-[var(--faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--primary)]">
          →
        </span>
      </span>
      <span className="mt-1 block text-sm leading-relaxed text-[var(--muted)]">{area.text}</span>
    </>
  );
  const cls =
    "group flex h-full w-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition-colors hover:border-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]";
  return area.href ? (
    <a href={area.href} className={cls}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={() => onGo(area.page)} className={cls}>
      {body}
    </button>
  );
}

export default function StartPage({ onGo }) {
  return (
    <div className="font-body page pb-16 pt-10">
      {/* A. Hero */}
      <section className="grid items-center gap-8 min-[1000px]:grid-cols-[1.4fr_1fr] min-[1000px]:gap-12">
        <div>
          <p className="text-sm text-[var(--muted)] font-medium">Investieren nach islamischen Grundsätzen</p>
          <h1 className="font-display mt-4" style={{ ...H1_STYLE, fontSize: "clamp(1.75rem, 3.2vw, 2.75rem)", lineHeight: 1.15 }}>
            Aktien und ETFs, geprüft nach AAOIFI-Standards.
          </h1>
          <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-[var(--text-soft)]">
            Tazkiyah zeigt, ob eine Aktie oder ein ETF die Prüfungen nach den AAOIFI-Standards besteht. Zu jeder Regel nennen wir die Quelle.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={routes.screener()} className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)]">
              Zum Screener
            </a>
            <a href={routes.methodik()} className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text)] hover:border-[var(--primary)]">
              So prüfen wir
            </a>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] p-5">
          <p className="mb-4 text-sm text-[var(--text)]">Drei mögliche Ergebnisse</p>
          <StatusLegend variant="list" />
        </div>
      </section>

      {/* B. Bereiche */}
      <section className="mt-12" aria-labelledby="bereiche">
        <h2 id="bereiche" className="text-sm text-[var(--muted)] font-medium" style={{ fontSize: "0.75rem", color: "var(--muted)", margin: 0, fontWeight: 400, letterSpacing: "0.25em" }}>
          Was es bei Tazkiyah gibt
        </h2>
        <ul className="mt-4 grid gap-3 min-[640px]:grid-cols-2 min-[1000px]:grid-cols-3">
          {AREAS.map((a) => (
            <li key={a.key}>
              <AreaCard area={a} onGo={onGo} />
            </li>
          ))}
        </ul>
      </section>

      {/* C. Schlusszeile */}
      <BasisLine className="mt-10 border-t border-[var(--border)] pt-5" />
    </div>
  );
}
