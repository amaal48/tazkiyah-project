// src/components/screening/ScreeningList.jsx
//
// Filter (Suche, Status, Aktie/ETF, Sektor), Sortierung und Liste der Screening-Ergebnisse.
// Design B: Filterkarte oben, darunter jede Aktie als eigene Kartenzeile, ganz klickbar
// zur Detailseite. Filter bleiben für die Sitzung erhalten, damit „Zurück“ sie nicht verliert.

import { useEffect, useMemo, useState } from "react";
import { routes } from "../../lib/hashRoute.js";
import StatusBadge, { StatusIcon } from "./StatusBadge.jsx";
import { STATUS_ORDER, STATUS_TEXT, reasonLine } from "./format.js";

const PAGE = 30;

const SORTS = [
  { key: "name", label: "Nach Name", needsValues: false },
  { key: "ticker", label: "Nach Ticker", needsValues: false },
  { key: "debt", label: "Nach Verschuldung (B1)", needsValues: true },
  { key: "deposits", label: "Nach Cash-Anteil (B2)", needsValues: true },
];

const EMPTY = { query: "", statuses: [], sector: "", assetType: "", sort: "name" };

const ASSET_TEXT = { stock: "Aktie", etf: "ETF" };

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

const ICON_BTN =
  "inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border border-[var(--control-border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] aria-pressed:border-[var(--primary)] aria-pressed:bg-[var(--primary)] aria-pressed:text-[var(--on-primary)]";

/** Eine Aktie als Kartenzeile; auch auf der Watchlist verwendet. */
export function ScreeningRow({ row, actions }) {
  const meta = [row.ticker, ASSET_TEXT[row.assetType], row.sector].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-6 py-5 transition-colors hover:border-[var(--primary)]">
      <a href={routes.stock(row.ticker)} className="group flex min-w-0 flex-[1_1_16rem] flex-wrap items-center gap-x-6 gap-y-2 text-left">
        <span className="min-w-0 basis-full sm:basis-auto sm:flex-[1_1_14rem]">
          <span className="block text-[18px] font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">{row.name}</span>
          <span className="mt-0.5 block font-[IBM_Plex_Mono] text-[13px] text-[var(--muted)]">{meta}</span>
        </span>
        <StatusBadge status={row.status} />
        <span className="min-w-0 basis-full text-[16px] sm:basis-auto sm:flex-[2_1_18rem] leading-relaxed text-[var(--muted)]">{reasonLine(row)}</span>
        <span aria-hidden="true" className="text-[20px] text-[var(--gold-soft)]">
          →
        </span>
      </a>
      {actions && <div className="ml-auto flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
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

  // Vorgaben aus der Navigation (Status- oder Sektorfilter), jede nur einmal anwenden
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
  const toggleAsset = (t) => update({ assetType: f.assetType === t ? "" : t });
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

  const actionsFor = (r) => {
    const inList = watchlist.includes(r.ticker);
    const comparing = compareTickers.includes(r.ticker);
    return (
      <>
        <button
          type="button"
          onClick={() => onToggleWatchlist(r.ticker)}
          aria-pressed={inList}
          aria-label={`${r.name} ${inList ? "aus der Watchlist entfernen" : "zur Watchlist hinzufügen"}`}
          title={inList ? "In der Watchlist" : "Zur Watchlist"}
          className={ICON_BTN}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={inList ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 3h10v18l-5-4-5 4z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onToggleCompare(r.ticker)}
          aria-pressed={comparing}
          aria-label={`${r.name} ${comparing ? "nicht mehr vergleichen" : "zum Vergleich hinzufügen"}`}
          title={comparing ? "Im Vergleich" : "Vergleichen"}
          className={ICON_BTN}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M8 4v16M16 4v16M4 8h8M12 16h8" />
          </svg>
        </button>
      </>
    );
  };

  return (
    <div className="text-left">
      {/* Filterkarte */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[14rem] flex-1">
            <span className="sr-only-label">Name oder Ticker suchen</span>
            <input value={f.query} onChange={(e) => update({ query: e.target.value })} placeholder="Name oder Ticker suchen" className="field w-full" />
          </label>
          <label>
            <span className="sr-only-label">Sortierung</span>
            <select value={sortBy} onChange={(e) => update({ sort: e.target.value })} className="field">
              {SORTS.filter((s) => sortable || !s.needsValues).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[15px] font-medium text-[var(--muted)]">Status:</span>
          <button type="button" className="chip" aria-pressed={f.statuses.length === 0} onClick={() => update({ statuses: [] })}>
            Alle
          </button>
          {STATUS_ORDER.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={f.statuses.includes(s)} onClick={() => toggleStatus(s)}>
              <StatusIcon status={s} size={14} />
              {STATUS_TEXT[s]}
            </button>
          ))}
          <span aria-hidden="true" className="mx-2 hidden h-7 w-px bg-[var(--border)] sm:inline-block" />
          <button type="button" className="chip" aria-pressed={f.assetType === "stock"} onClick={() => toggleAsset("stock")}>
            Aktien
          </button>
          <button type="button" className="chip" aria-pressed={f.assetType === "etf"} onClick={() => toggleAsset("etf")}>
            ETFs
          </button>
          <label className="inline-flex">
            <span className="sr-only-label">Sektor</span>
            <select value={f.sector} onChange={(e) => update({ sector: e.target.value })} className="chip pr-3">
              <option value="">Alle Sektoren</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="mb-4 mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[15px] text-[var(--muted)]">
        <span>
          {loading ? "Lade Ergebnisse…" : `${filtered.length} Titel gefunden${filtered.length > shown.length ? ` · ${shown.length} angezeigt` : ""}`}
        </span>
        {active ? (
          <button type="button" onClick={() => update({ ...EMPTY, sort: f.sort })} className="min-h-[44px] text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]">
            Filter zurücksetzen
          </button>
        ) : null}
        {(sortBy === "debt" || sortBy === "deposits") && (
          <span>Niedrigster Wert zuerst. Maßgeblich ist der höhere Wert aus Jahresabschluss und Quartal; Titel ohne Wert stehen am Ende.</span>
        )}
      </p>

      {error && (
        <p className="card border-[var(--bad-border)] bg-[var(--bad-bg)] text-[var(--bad-strong)]">
          Die Ergebnisse konnten nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="card text-center text-[var(--muted)]">
          Keine Treffer.{" "}
          <button type="button" onClick={() => update({ ...EMPTY, sort: f.sort })} className="text-[var(--primary)] underline underline-offset-2">
            Filter zurücksetzen
          </button>
        </div>
      )}

      <ul className="grid gap-[10px]">
        {shown.map((r) => (
          <li key={r.ticker}>
            <ScreeningRow row={r} actions={actionsFor(r)} />
          </li>
        ))}
      </ul>

      {filtered.length > shown.length && (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => setVisible((c) => c + PAGE)} className="btn-secondary">
            Weitere {Math.min(PAGE, filtered.length - shown.length)} von {filtered.length - shown.length} laden
          </button>
        </div>
      )}
    </div>
  );
}
