// src/components/screening/ScreeningList.jsx
//
// Kartenzeile einer Aktie (Watchlist). Die frühere Screener-Liste mit Filtern ist seit 15.10.2026
// durch die Tazkiyah 30 (Tazkiyah30Page.jsx) und die Aktiensuche (AktienPage.jsx) ersetzt.

import { routes } from "../../lib/hashRoute.js";
import StatusBadge from "./StatusBadge.jsx";
import { cardReason } from "./format.js";

const ASSET_TEXT = { stock: "Aktie", etf: "ETF" };

/**
 * Eine Aktie als Kartenzeile (Watchlist). Status und Begründung nur für Titel der Tazkiyah 30 mit
 * Endergebnis (Neue Ausrichtung 15.10.2026); sonst ein Satz ohne Status.
 */
function rowText(row) {
  if (row.hasFinalResult) return cardReason(row);
  if (row.inTazkiyah30) return "Gehört zu den Tazkiyah 30, die Prüfung ist noch nicht abgeschlossen.";
  return "Keine Sharia-Prüfung: nicht in den Tazkiyah 30.";
}

export function ScreeningRow({ row, actions }) {
  const meta = [row.ticker, ASSET_TEXT[row.assetType], row.sector].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-6 py-5 transition-colors hover:border-[var(--primary)]">
      <a href={routes.stock(row.ticker)} className="group flex min-w-0 flex-[1_1_16rem] flex-wrap items-center gap-x-6 gap-y-2 text-left">
        <span className="min-w-0 basis-full sm:basis-auto sm:flex-[1_1_14rem]">
          <span className="block text-[18px] font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">{row.name}</span>
          <span className="mt-0.5 block font-[IBM_Plex_Mono] text-[13px] text-[var(--muted)]">{meta}</span>
        </span>
        {row.hasFinalResult && <StatusBadge status={row.status} />}
        <span className="min-w-0 basis-full text-[16px] sm:basis-auto sm:flex-[2_1_18rem] leading-relaxed text-[var(--muted)]">{rowText(row)}</span>
        <span aria-hidden="true" className="text-[20px] text-[var(--gold-soft)]">
          →
        </span>
      </a>
      {actions && <div className="ml-auto flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
