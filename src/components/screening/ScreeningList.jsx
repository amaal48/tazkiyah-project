// src/components/screening/ScreeningList.jsx
//
// Filter (Suche, Status, Sektor, Aktie/ETF), Sortierung und Liste der Screening-Ergebnisse.
// Ab 1000 px Zeilenliste mit Spalten, darunter Karten. Die ganze Zeile öffnet die Detailseite.
// Filter bleiben für die Sitzung erhalten, damit „Zurück“ von der Detailseite sie nicht verliert.

import { useEffect, useMemo, useState } from "react";
import { routes } from "../../lib/hashRoute.js";
import StatusBadge from "./StatusBadge.jsx";
import { STATUS_ORDER, STATUS_TEXT, reasonLine } from "./format.js";

const PAGE = 30;

const SORTS = [
  { key: "name", label: "Nach Name", needsValues: false },
  { key: "ticker", label: "Nach Ticker", needsValues: false },
  { key: "debt", label: "Nach Verschuldung (B1)", needsValues: true },
  { key: "deposits", label: "Nach Cash-Anteil (B2)", needsValues: true },
];

const EMPTY = { query: "", statuses: [], sector: "", assetType: "", sort: "name" };

// Sitzungsweiter Zustand der Filter (Modul-Variable, kein Speicher im Browser nötig)
let saved = { ...EMPTY };
let appliedPresetTs = null;

const byNumberAsc = (key) => (a, b) => {
  const x = a[key];
  const y = b[key];
  if (x === null && y === null) return a.name.localeCompare(b.name);
  if (x === null) return 1; // ohne Wert ans Ende
  if (y === null) return -1;
  return x - y;
};

const SELECT =
  "rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] focus:border-[var(--gold)]/60 focus:outline-none";

/** Karte für schmale Bildschirme; auch auf der Watchlist verwendet. */
export function ScreeningRow({ row, actions }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--emerald)]/60">
      <a href={routes.stock(row.ticker)} className="block px-5 py-4 text-left">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-[IBM_Plex_Mono] text-sm tracking-wide text-[var(--text)]">{row.ticker}</span>
          {row.assetType === "etf" && (
            <span className="rounded-full border border-[var(--gold)]/40 px-1.5 py-0.5 text-[10px] uppercase text-[var(--gold-soft)]">ETF</span>
          )}
          <StatusBadge status={row.status} />
        </div>
        <p className="mt-1 text-[15px] text-[var(--text)]/90">{row.name}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{reasonLine(row)}</p>
      </a>
      {actions && <div className="flex flex-wrap items-center gap-4 border-t border-[var(--border)] px-5 py-2 text-xs">{actions}</div>}
    </div>
  );
}

// Spalten der Zeilenliste: Name und Ticker | Sektor | Status | Begründung | Aktionen
const COLS = "min-[1000px]:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_8.5rem_minmax(0,2.2fr)_auto]";

function TableRow({ row, actions }) {
  const reason = reasonLine(row);
  return (
    <li className={"grid items-start gap-x-6 border-t border-[var(--border)] transition-colors hover:bg-[var(--surface)] " + COLS}>
      <a href={routes.stock(row.ticker)} className="col-span-4 grid grid-cols-subgrid items-start py-3.5 pl-3 text-left">
        <span className="min-w-0">
          <span className="block text-[15px] text-[var(--text)]">{row.name}</span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="font-[IBM_Plex_Mono] text-xs tracking-wide text-[var(--muted)]">{row.ticker}</span>
            {row.assetType === "etf" && (
              <span className="rounded-full border border-[var(--gold)]/40 px-1.5 text-[10px] uppercase text-[var(--gold-soft)]">ETF</span>
            )}
          </span>
        </span>
        <span className="min-w-0 pt-0.5 text-sm text-[var(--text-soft)]">{row.sector || "–"}</span>
        <span className="pt-0.5">
          <StatusBadge status={row.status} />
        </span>
        {/* Höchstens zwei Zeilen; der volle Text steht im Tooltip und auf der Detailseite */}
        <span title={reason} className="line-clamp-2 min-w-0 pt-0.5 text-sm leading-relaxed text-[var(--muted)]">
          {reason}
        </span>
      </a>
      <span className="flex items-center gap-3 py-3.5 pr-3 text-xs">{actions}</span>
    </li>
  );
}

export default function ScreeningList({ rows, loading, error, sortable, sectors, preset, watchlist, onToggleWatchlist, compareTickers, onToggleCompare }) {
  const [f, setF] = useState(saved);
  const [visible, setVisible] = useState(PAGE);

  const update = (patch) =>
    setF((prev) => {
      const next = { ...prev, ...patch };
      saved = next;
      return next;
    });

  // Vorgaben aus der Sidebar (Status- oder Sektorfilter), jede nur einmal anwenden
  useEffect(() => {
    if (!preset || preset.ts === appliedPresetTs) return;
    appliedPresetTs = preset.ts;
    update({ ...EMPTY, ...(preset.statuses ? { statuses: preset.statuses } : {}), ...(preset.sector ? { sector: preset.sector } : {}) });
  }, [preset]);

  useEffect(() => {
    setVisible(PAGE);
  }, [f]);

  // Ohne geladene B1/B2-Werte gibt es diese Sortierungen nicht
  const sortBy = sortable || !SORTS.find((s) => s.key === f.sort)?.needsValues ? f.sort : "name";
  const toggleStatus = (s) => update({ statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s] });
  const active = f.query || f.statuses.length || f.sector || f.assetType;

  const filtered = useMemo(() => {
    const q = f.query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!q || r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) &&
        (!f.statuses.length || f.statuses.includes(r.status)) &&
        (!f.sector || r.sector === f.sector) &&
        (!f.assetType || r.assetType === f.assetType)
    );
    const cmp =
      sortBy === "ticker"
        ? (a, b) => a.ticker.localeCompare(b.ticker)
        : sortBy === "debt"
          ? byNumberAsc("debtPct")
          : sortBy === "deposits"
            ? byNumberAsc("depositsPct")
            : (a, b) => a.name.localeCompare(b.name, "de");
    return [...list].sort(cmp);
  }, [rows, f, sortBy]);

  const shown = filtered.slice(0, visible);

  const actionsFor = (r) => (
    <>
      <button
        type="button"
        onClick={() => onToggleWatchlist(r.ticker)}
        aria-pressed={watchlist.includes(r.ticker)}
        className={"whitespace-nowrap " + (watchlist.includes(r.ticker) ? "text-[var(--gold-soft)]" : "text-[var(--faint)] hover:text-[var(--muted)]")}
      >
        {watchlist.includes(r.ticker) ? "✓ Watchlist" : "+ Watchlist"}
      </button>
      <label className="flex items-center gap-1.5 whitespace-nowrap text-[var(--faint)] hover:text-[var(--muted)]">
        <input type="checkbox" checked={compareTickers.includes(r.ticker)} onChange={() => onToggleCompare(r.ticker)} className="accent-[var(--gold)]" />
        Vergleichen
      </label>
    </>
  );

  return (
    <div className="text-left">
      {/* Filterleiste: ab 1000 px eine Zeile */}
      <div className="sticky top-0 z-20 -mx-[clamp(16px,3vw,48px)] bg-[var(--bg)]/95 px-[clamp(16px,3vw,48px)] py-3 backdrop-blur">
        {/* Eine Zeile, sobald der Platz reicht; sonst bricht die Leiste um statt seitlich überzustehen */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={f.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Name oder Ticker suchen…"
            aria-label="Name oder Ticker suchen"
            className="min-w-[8rem] flex-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:border-[var(--gold)]/60 focus:outline-none"
          />
          <div role="group" aria-label="Status" className="flex flex-shrink-0 gap-1.5">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                aria-pressed={f.statuses.includes(s)}
                className={
                  "whitespace-nowrap rounded-full border px-2.5 py-2 text-xs transition-colors " +
                  (f.statuses.includes(s)
                    ? "border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold-soft)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold)]/50")
                }
              >
                {STATUS_TEXT[s]}
              </button>
            ))}
          </div>
          <select value={f.sector} onChange={(e) => update({ sector: e.target.value })} aria-label="Sektor" className={SELECT}>
            <option value="">Alle Sektoren</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={f.assetType} onChange={(e) => update({ assetType: e.target.value })} aria-label="Aktie oder ETF" className={SELECT}>
            <option value="">Aktien und ETFs</option>
            <option value="stock">Nur Aktien</option>
            <option value="etf">Nur ETFs</option>
          </select>
          <select value={sortBy} onChange={(e) => update({ sort: e.target.value })} aria-label="Sortierung" className={SELECT}>
            {SORTS.filter((s) => sortable || !s.needsValues).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mb-3 mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-[var(--faint)]">
        <span>
          {loading ? "Lade Ergebnisse…" : `${filtered.length} Titel gefunden${filtered.length > shown.length ? ` · ${shown.length} angezeigt` : ""}`}
        </span>
        {active ? (
          <button type="button" onClick={() => update({ ...EMPTY, sort: f.sort })} className="text-[var(--muted)] underline underline-offset-2 hover:text-[var(--text)]">
            Filter zurücksetzen
          </button>
        ) : null}
        {(sortBy === "debt" || sortBy === "deposits") && (
          <span>Niedrigster Wert zuerst. Maßgeblich ist der höhere Wert aus Jahresabschluss und Quartal; Titel ohne Wert stehen am Ende.</span>
        )}
      </p>

      {error && (
        <p className="rounded-2xl border border-[var(--red)]/50 px-5 py-4 text-sm text-[var(--red-soft)]">
          Die Ergebnisse konnten nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-2xl border border-[var(--border)] px-5 py-8 text-center text-sm text-[var(--muted)]">
          Keine Treffer.{" "}
          <button type="button" onClick={() => update({ ...EMPTY, sort: f.sort })} className="text-[var(--gold-soft)] underline underline-offset-2">
            Filter zurücksetzen
          </button>
        </div>
      )}

      {/* Zeilenliste ab 1000 px */}
      {shown.length > 0 && (
        <ul className="hidden min-[1000px]:block">
          <li aria-hidden="true" className={"grid gap-x-6 pb-2 pl-3 text-[11px] uppercase tracking-[0.15em] text-[var(--faint)] " + COLS}>
            <span>Name und Ticker</span>
            <span>Sektor</span>
            <span>Status</span>
            <span>Begründung</span>
            <span />
          </li>
          {shown.map((r) => (
            <TableRow key={r.ticker} row={r} actions={actionsFor(r)} />
          ))}
        </ul>
      )}

      {/* Karten auf schmalen Bildschirmen */}
      <div className="grid gap-3 min-[1000px]:hidden">
        {shown.map((r) => (
          <ScreeningRow key={r.ticker} row={r} actions={actionsFor(r)} />
        ))}
      </div>

      {filtered.length > shown.length && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setVisible((c) => c + PAGE)}
            className="rounded-full border border-[var(--border)] px-5 py-2 text-sm text-[var(--muted)] hover:border-[var(--gold)]/50 hover:text-[var(--gold-soft)]"
          >
            Weitere {Math.min(PAGE, filtered.length - shown.length)} von {filtered.length - shown.length} laden
          </button>
        </div>
      )}
    </div>
  );
}
