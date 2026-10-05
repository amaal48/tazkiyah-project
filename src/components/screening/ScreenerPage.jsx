// src/components/screening/ScreenerPage.jsx
//
// Screener (#/screener), Design B: Überschrift, eine Zeile Einleitung, Filterkarte und Liste.

import { useScreeningList } from "../../lib/screeningData.js";
import { routes } from "../../lib/hashRoute.js";
import ScreeningList from "./ScreeningList.jsx";
import { H1_STYLE } from "./format.js";

export default function ScreenerPage({ sectors, preset, watchlist, onToggleWatchlist, compareTickers, onToggleCompare }) {
  const list = useScreeningList();
  return (
    <div className="font-body page pb-8 pt-14 text-left">
      <header>
        <h1 className="font-display" style={{ ...H1_STYLE, fontSize: "clamp(32px, 4.5vw, 42px)", lineHeight: 1.15 }}>
          Screener
        </h1>
        <p className="mt-3 max-w-[62ch] text-[var(--muted)]">
          Alle Aktien und ETFs mit ihrem Ergebnis nach den AAOIFI-Standards.{" "}
          <a href={routes.methodik()} className="whitespace-nowrap text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]">
            So prüfen wir
          </a>
        </p>
      </header>

      <div className="mt-8">
        <ScreeningList
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          sortable={list.sortable}
          sectors={sectors}
          preset={preset}
          watchlist={watchlist}
          onToggleWatchlist={onToggleWatchlist}
          compareTickers={compareTickers}
          onToggleCompare={onToggleCompare}
        />
      </div>
    </div>
  );
}
