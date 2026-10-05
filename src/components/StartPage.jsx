// src/components/StartPage.jsx
//
// Startseite (#/), Design B: Kopfbereich mit Beispielkarte aus echten Screening-Daten,
// Legende der drei Status, die sechs Bereiche. Die Grundlage (AAOIFI) steht in der Fußzeile.

import { routes } from "../lib/hashRoute.js";
import { useScreeningList } from "../lib/screeningData.js";
import { EXPLANATIONS, defaultParameterValues } from "../screening/explanations.js";
import StatusLegend from "./screening/StatusLegend.jsx";
import StatusBadge from "./screening/StatusBadge.jsx";
import SourceLink from "./screening/SourceLink.jsx";
import LimitBar from "./screening/LimitBar.jsx";
import { H1_STYLE, H2_STYLE, fmtLimit, fmtPct } from "./screening/format.js";

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

// Bereiche mit Gold-Kachel (Methodik), sonst Grün
const GOLD_TILE = new Set(["methodik"]);

function AreaCard({ area, onGo }) {
  const body = (
    <>
      <span className={"icon-tile " + (GOLD_TILE.has(area.key) ? "icon-tile-gold" : "")}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {ICONS[area.key]}
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-[18px] font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">{area.title}</span>
        <span className="mt-1 block text-[16px] leading-relaxed text-[var(--muted)]">{area.text}</span>
      </span>
    </>
  );
  const cls = "card group flex h-full w-full items-start gap-4 text-left transition-colors hover:border-[var(--primary)]";
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

/** Kennzahl der Beispielkarte: Wert gegen Grenzwert mit Balken und Grenzmarke. */
function ExampleRatio({ id, value, limit }) {
  const pass = value <= limit;
  return (
    <div className="border-t border-[var(--line)] pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="font-semibold text-[var(--text)]">
          {EXPLANATIONS[id].name} <span className="font-[IBM_Plex_Mono] text-sm font-normal text-[var(--faint)]">{id}</span>
        </span>
        <span className="font-[IBM_Plex_Mono] text-[15px] text-[var(--text)]">
          {fmtPct(value)} von höchstens {fmtLimit(limit)}
        </span>
      </div>
      <LimitBar value={value} limit={limit} result={pass ? "pass" : "fail"} className="mt-2" />
      <p className="mt-2 text-sm">
        <SourceLink source={EXPLANATIONS[id].source} criterion={id} />
      </p>
    </div>
  );
}

/** Echter konformer Titel mit vollständigen B1- und B2-Werten; ohne solchen Titel keine Karte. */
function ExampleCard() {
  const { rows } = useScreeningList();
  const ex = rows.find((r) => r.status === "konform" && typeof r.debtPct === "number" && typeof r.depositsPct === "number");
  if (!ex) return null;
  const p = defaultParameterValues();
  return (
    <a href={routes.stock(ex.ticker)} className="card block space-y-4 transition-colors hover:border-[var(--primary)]" aria-label={`Beispiel: ${ex.name}, Detailseite öffnen`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[18px] font-semibold text-[var(--text)]">{ex.name}</p>
          <p className="font-[IBM_Plex_Mono] text-sm text-[var(--muted)]">{ex.ticker}</p>
        </div>
        <StatusBadge status={ex.status} />
      </div>
      <ExampleRatio id="B1" value={ex.debtPct} limit={p.debtMaxPct} />
      <ExampleRatio id="B2" value={ex.depositsPct} limit={p.depositsMaxPct} />
      <p className="text-sm text-[var(--faint)]">Maßgeblich ist der höhere Wert aus Jahresabschluss und Quartal.</p>
    </a>
  );
}

export default function StartPage({ onGo }) {
  return (
    <div className="font-body page pb-8 pt-20">
      {/* 1. Kopfbereich */}
      <section className="grid items-center gap-10 min-[1000px]:grid-cols-[1.2fr_1fr] min-[1000px]:gap-14">
        <div>
          <p className="text-[15px] font-semibold text-[var(--gold-soft)]">Investieren nach islamischen Grundsätzen</p>
          <h1 className="font-display mt-3" style={{ ...H1_STYLE, fontSize: "clamp(34px, 5vw, 52px)", lineHeight: 1.1 }}>
            Aktien und ETFs, geprüft nach AAOIFI-Standards.
          </h1>
          <p className="mt-5 max-w-[62ch] text-[19px] leading-relaxed text-[var(--muted)]">
            Tazkiyah zeigt, ob eine Aktie oder ein ETF die Prüfungen nach den AAOIFI-Standards besteht. Zu jeder Regel nennen wir die Quelle.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={routes.screener()} className="btn-primary">
              Zum Screener
            </a>
            <a href={routes.methodik()} className="btn-secondary">
              So prüfen wir
            </a>
          </div>
        </div>
        <ExampleCard />
      </section>

      {/* 2. Legende */}
      <section className="mt-[80px]" aria-label="Die drei möglichen Ergebnisse">
        <StatusLegend />
      </section>

      {/* 3. Bereiche */}
      <section className="mt-[80px]" aria-labelledby="bereiche">
        <h2 id="bereiche" className="font-display" style={{ ...H2_STYLE, fontSize: "34px" }}>
          Was es bei Tazkiyah gibt
        </h2>
        <p className="mt-2 text-[var(--muted)]">Alle Bereiche auf einen Blick.</p>
        <ul className="mt-8 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          {AREAS.map((a) => (
            <li key={a.key}>
              <AreaCard area={a} onGo={onGo} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
