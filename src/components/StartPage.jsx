// src/components/StartPage.jsx
//
// Startseite (#/), Design B: Kopfbereich mit Stand der Tazkiyah 30 (ohne einzelne Aktie hervorzuheben,
// keine Rangfolge), Legende der Status, die Bereiche. Die Grundlage (AAOIFI) steht in der Fußzeile.

import { routes } from "../lib/hashRoute.js";
import { useScreeningList } from "../lib/screeningData.js";
import { TAZKIYAH30_SIZE } from "../data/tazkiyah30.js";
import StatusLegend from "./screening/StatusLegend.jsx";
import { H1_STYLE, H2_STYLE } from "./screening/format.js";

// Einheitliche Linien-Icons (24 × 24, Strich in currentColor)
const ICONS = {
  screener: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  aktien: (
    <>
      <path d="M4 19h16" />
      <path d="M5 15l4-4 3 3 6-7" />
    </>
  ),
  kalender: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
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
  { key: "screener", title: "Die Tazkiyah 30", text: "30 Aktien, sorgfältig geprüft und mit Quelle belegt.", href: routes.tazkiyah30() },
  { key: "aktien", title: "Aktien", text: "Kurs, Chart und Unternehmensprofil für alle Aktien, ohne Halal-Status.", href: routes.aktien() },
  { key: "kalender", title: "Kalender", text: "Termine für Quartalszahlen und Hauptversammlungen.", page: "calendar" },
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

/** Stand der Tazkiyah 30 als Zahlen, ohne einzelne Aktie hervorzuheben. */
function Tazkiyah30Card() {
  const { rows, loading, error } = useScreeningList();
  const done = rows.filter((r) => r.hasFinalResult);
  const konform = done.filter((r) => r.status === "konform").length;
  return (
    <a href={routes.tazkiyah30()} className="card group block space-y-4 text-left transition-colors hover:border-[var(--primary)]">
      <p className="text-[18px] font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">Die Tazkiyah 30</p>
      <p className="text-[16px] leading-relaxed text-[var(--muted)]">
        Eine bewusst kleine Liste von {TAZKIYAH30_SIZE} Aktien, die wir nach jedem Quartalsbericht neu prüfen.
      </p>
      {!loading && !error && (
        <p className="border-t border-[var(--line)] pt-4 text-[16px] text-[var(--text-soft)]">
          {done.length} von {TAZKIYAH30_SIZE} geprüft · {konform} konform · {done.length - konform} nicht konform
        </p>
      )}
      <p className="text-[16px] font-semibold text-[var(--primary)]">Zur Liste →</p>
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
            Die Tazkiyah 30: Aktien, geprüft nach AAOIFI-Standards.
          </h1>
          <p className="mt-5 max-w-[62ch] text-[19px] leading-relaxed text-[var(--muted)]">
            Tazkiyah zeigt für 30 Aktien, die bei deutschen Brokern handelbar sind, ob sie die Prüfungen nach den AAOIFI-Standards
            bestehen. Zu jeder Aktie und jeder Regel nennen wir die Quelle.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={routes.tazkiyah30()} className="btn-primary">
              Zu den Tazkiyah 30
            </a>
            <a href={routes.methodik()} className="btn-secondary">
              So prüfen wir
            </a>
          </div>
        </div>
        <Tazkiyah30Card />
      </section>

      {/* 2. Legende */}
      <section className="mt-[80px]" aria-label="Die möglichen Ergebnisse">
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
