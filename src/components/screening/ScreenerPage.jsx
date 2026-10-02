// src/components/screening/ScreenerPage.jsx
//
// Screener (#/screener): Kopf mit kurzer Erklärung, Filter und Liste in voller Inhaltsbreite.

import { useScreeningList } from "../../lib/screeningData.js";
import { routes } from "../../lib/hashRoute.js";
import ScreeningList from "./ScreeningList.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { H1_STYLE, STATUS_EXPLANATIONS, STATUS_ORDER, STATUS_TEXT } from "./format.js";

export default function ScreenerPage({ sectors, preset, watchlist, onToggleWatchlist, compareTickers, onToggleCompare }) {
  const list = useScreeningList();
  return (
    <div className="font-body page pb-24 pt-10 text-left">
      <header>
        <h1 className="font-display" style={H1_STYLE}>
          Screener
        </h1>
        <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">
          Alle Aktien und ETFs mit ihrem Ergebnis nach den AAOIFI-Standards.{" "}
          <a href={routes.methodik()} className="whitespace-nowrap text-[var(--gold-soft)] underline decoration-[var(--gold)]/40 underline-offset-2">
            So prüfen wir
          </a>
        </p>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Mögliche Ergebnisse">
          {STATUS_ORDER.map((s) => (
            <li key={s} title={STATUS_EXPLANATIONS[s]} aria-label={`${STATUS_TEXT[s]}: ${STATUS_EXPLANATIONS[s]}`}>
              <StatusBadge status={s} />
            </li>
          ))}
        </ul>
      </header>

      <div className="mt-6">
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
