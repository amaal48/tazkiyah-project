// src/components/StockInfoPage.jsx
//
// Aktienseite OHNE Halal-Status (#/aktie/XYZ für alle Titel außerhalb der Tazkiyah 30, Neue Ausrichtung
// 15.10.2026): Name, Ticker, Branche, Kurs und Chart sowie Unternehmensprofil von TradingView (erst nach
// Zustimmung), Platzhalter für Termine und Berichte. Keine Kriterien, keine Ampel, kein Status.
//
// Auch Titel der Tazkiyah 30, deren Prüfung noch nicht abgeschlossen ist, erscheinen hier
// (pending: true), damit öffentlich kein Zwischenstand zu sehen ist.

import { useEffect } from "react";
import { routes } from "../lib/hashRoute.js";
import MarketData from "./screening/MarketData.jsx";
import { H1_STYLE, H2_STYLE } from "./screening/format.js";

const ASSET_TEXT = { stock: "Aktie", etf: "ETF" };
const linkClass = "text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]";

function Placeholder({ title, children }) {
  return (
    <section className="card h-full">
      <h2 className="font-display" style={{ ...H2_STYLE, fontSize: "22px" }}>
        {title}
      </h2>
      <p className="mt-2 text-[16px] leading-relaxed text-[var(--muted)]">{children}</p>
    </section>
  );
}

export default function StockInfoPage({ ticker, row, pending = false, onBack, backLabel = "← Zur Aktiensuche", watchlist = [], onToggleWatchlist }) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [ticker]);

  const name = row?.name || ticker;
  const meta = [ticker, ASSET_TEXT[row?.assetType], row?.sector].filter(Boolean).join(" · ");
  const saved = watchlist.includes(ticker);

  return (
    <div className="font-body page pb-12 pt-8 text-left">
      <button type="button" onClick={onBack} className="inline-flex min-h-[44px] items-center text-[16px] font-medium text-[var(--primary)] hover:text-[var(--primary-hover)] hover:underline">
        {backLabel}
      </button>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display" style={{ ...H1_STYLE, fontSize: "clamp(32px, 4.5vw, 44px)", lineHeight: 1.15 }}>
            {name}
          </h1>
          <p className="mt-2 font-[IBM_Plex_Mono] text-sm text-[var(--muted)]">{meta}</p>
        </div>
        {onToggleWatchlist && (
          <button type="button" onClick={() => onToggleWatchlist(ticker)} aria-pressed={saved} className="btn-secondary">
            {saved ? "✓ In der Watchlist" : "+ Zur Watchlist"}
          </button>
        )}
      </header>

      <section aria-label="Hinweis zur Sharia-Prüfung" className="mt-8 rounded-[18px] border border-[var(--note-border)] bg-[var(--note-bg)] p-6">
        {pending ? (
          <p className="max-w-[68ch] text-[17px] leading-relaxed text-[var(--text-soft)]">
            Diese Aktie gehört zu den Tazkiyah 30. Die Prüfung ist noch nicht abgeschlossen; das Ergebnis erscheint, sobald sie
            fertig ist.{" "}
            <a href={routes.tazkiyah30()} className={linkClass}>
              Zu den Tazkiyah 30
            </a>
          </p>
        ) : (
          <>
            <p className="max-w-[68ch] text-[17px] leading-relaxed text-[var(--text-soft)]">
              Eine Sharia-Prüfung bieten wir nur für die Tazkiyah 30 an. Hier steht deshalb kein Halal-Status.
            </p>
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
              <a href={routes.kontakt({ topic: "pruefung", ticker })} className={linkClass}>
                Prüfung wünschen
              </a>
              <a href={routes.tazkiyah30()} className={linkClass}>
                Zu den Tazkiyah 30
              </a>
            </p>
          </>
        )}
      </section>

      <MarketData ticker={ticker} exchange={row?.exchange} name={name} variant="info" className="mt-12" />

      <div className="mt-12 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
        <Placeholder title="Nächste Zahlen im Kalender">Folgt später. Hier erscheint der nächste Termin für Quartalszahlen.</Placeholder>
        <Placeholder title="Berichte">Folgt später. Hier erscheinen die Berichte des Unternehmens.</Placeholder>
      </div>

      <p className="mt-10 max-w-[62ch] text-sm leading-relaxed text-[var(--muted)]">
        Kurse über TradingView. Die Inhalte dienen der Information und sind keine Anlageberatung.
      </p>
    </div>
  );
}
