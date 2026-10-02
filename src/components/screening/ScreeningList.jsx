// src/components/screening/ScreeningList.jsx
//
// Filter (Status, Sektor, Aktie/ETF, Suche), Sortierung und Liste der Screening-Ergebnisse.
// Jede Zeile: Name, Ticker, Status und ein Satz Begründung; Klick öffnet die Detailseite.

import { useEffect, useMemo, useState } from "react";
import { routes } from "../../lib/hashRoute.js";
import StatusBadge from "./StatusBadge.jsx";
import { STATUS_ORDER, STATUS_TEXT, reasonLine } from "./format.js";

const PAGE = 30;

const SORTS = [
  { key: "name", label: "Name", needsValues: false },
  { key: "ticker", label: "Ticker", needsValues: false },
  { key: "debt", label: "Niedrigste Verschuldung (B1)", needsValues: true },
  { key: "deposits", label: "Niedrigster Cash-Anteil (B2)", needsValues: true },
];

const ASSET_TYPES = [
  ["stock", "Aktie"],
  ["etf", "ETF"],
];

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-full border px-3 py-1.5 text-xs transition-colors " +
        (active
          ? "border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold-soft)]"
          : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--emerald)]/60")
      }
    >
      {children}
    </button>
  );
}

const byNumberAsc = (key) => (a, b) => {
  const x = a[key];
  const y = b[key];
  if (x === null && y === null) return a.name.localeCompare(b.name);
  if (x === null) return 1; // ohne Wert ans Ende
  if (y === null) return -1;
  return x - y;
};

/** Eine Zeile; auch auf der Watchlist verwendet. */
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

export default function ScreeningList({ rows, loading, error, sortable, sectors, preset, watchlist, onToggleWatchlist, compareTickers, onToggleCompare }) {
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState([]);
  const [activeSectors, setActiveSectors] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [sortChoice, setSortBy] = useState("name");
  // Ohne geladene B1/B2-Werte gibt es diese Sortierungen nicht
  const sortBy = sortable || !SORTS.find((s) => s.key === sortChoice)?.needsValues ? sortChoice : "name";
  const [showFilters, setShowFilters] = useState(false);
  const [visible, setVisible] = useState(PAGE);

  // Vorgaben aus Sidebar oder Schnellkacheln übernehmen
  useEffect(() => {
    if (!preset) return;
    setShowFilters(true);
    if (preset.statuses) setStatuses(preset.statuses);
    if (preset.sectors) setActiveSectors(preset.sectors);
    if (preset.sort) setSortBy(preset.sort);
  }, [preset]);

  useEffect(() => setVisible(PAGE), [query, statuses, activeSectors, assetTypes, sortBy]);

  const toggle = (setter) => (v) => setter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  const toggleStatus = toggle(setStatuses);
  const toggleSector = toggle(setActiveSectors);
  const toggleAsset = toggle(setAssetTypes);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!q || r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) &&
        (!statuses.length || statuses.includes(r.status)) &&
        (!activeSectors.length || activeSectors.includes(r.sector)) &&
        (!assetTypes.length || assetTypes.includes(r.assetType))
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
  }, [rows, query, statuses, activeSectors, assetTypes, sortBy]);

  const shown = filtered.slice(0, visible);

  const chips = [
    ...statuses.map((v) => ({ label: STATUS_TEXT[v], remove: () => toggleStatus(v) })),
    ...activeSectors.map((v) => ({ label: v, remove: () => toggleSector(v) })),
    ...assetTypes.map((v) => ({ label: ASSET_TYPES.find(([k]) => k === v)?.[1], remove: () => toggleAsset(v) })),
  ];

  return (
    <div className="text-left">
      {/* Suche */}
      <div className="sticky top-0 z-20 -mx-6 bg-[var(--bg)]/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name oder Ticker suchen…"
            aria-label="Name oder Ticker suchen"
            className="w-full min-w-0 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            className={
              "flex-shrink-0 rounded-full border px-4 py-1.5 text-xs " +
              (showFilters ? "border-[var(--gold)] text-[var(--gold-soft)]" : "border-[var(--border)] text-[var(--muted)]")
            }
          >
            Filter {chips.length > 0 && `(${chips.length})`}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mt-4 grid gap-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 md:grid-cols-[1fr_2fr_1fr]">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((s) => (
                <FilterChip key={s} active={statuses.includes(s)} onClick={() => toggleStatus(s)}>
                  {STATUS_TEXT[s]}
                </FilterChip>
              ))}
            </div>
            <p className="mb-2 mt-5 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Art</p>
            <div className="flex flex-wrap gap-2">
              {ASSET_TYPES.map(([k, label]) => (
                <FilterChip key={k} active={assetTypes.includes(k)} onClick={() => toggleAsset(k)}>
                  {label}
                </FilterChip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Sektor</p>
            <div className="flex flex-wrap gap-2">
              {sectors.map((s) => (
                <FilterChip key={s} active={activeSectors.includes(s)} onClick={() => toggleSector(s)}>
                  {s}
                </FilterChip>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="screening-sort" className="mb-2 block text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Sortierung
            </label>
            <select
              id="screening-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none"
            >
              {SORTS.filter((s) => sortable || !s.needsValues).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            {(sortBy === "debt" || sortBy === "deposits") && (
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--faint)]">
                Maßgeblich ist der höhere Wert aus Jahresabschluss und Quartal. Titel ohne Wert stehen am Ende.
              </p>
            )}
          </div>
        </div>
      )}

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.remove}
              className="flex items-center gap-1.5 rounded-full border border-[var(--emerald)]/40 bg-[var(--emerald)]/10 px-3 py-1 text-xs text-[var(--emerald-soft)]"
            >
              {c.label} <span aria-label="entfernen">✕</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setStatuses([]);
              setActiveSectors([]);
              setAssetTypes([]);
            }}
            className="text-xs text-[var(--faint)] hover:text-[var(--muted)]"
          >
            Alle zurücksetzen
          </button>
        </div>
      )}

      <p className="mb-3 mt-6 text-xs text-[var(--faint)]">
        {loading
          ? "Lade Ergebnisse…"
          : `${filtered.length} Titel gefunden${filtered.length > shown.length ? ` · ${shown.length} angezeigt` : ""}`}
      </p>

      {error && (
        <p className="rounded-2xl border border-[var(--red)]/50 px-5 py-4 text-sm text-[var(--red-soft)]">
          Die Ergebnisse konnten nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}

      <div className="grid gap-3">
        {!loading && !error && filtered.length === 0 && (
          <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center text-sm text-[var(--muted)]">
            Keine Titel passen zu den aktuellen Filtern.
          </p>
        )}
        {shown.map((r) => (
          <ScreeningRow
            key={r.ticker}
            row={r}
            actions={
              <>
                <button
                  type="button"
                  onClick={() => onToggleWatchlist(r.ticker)}
                  className={watchlist.includes(r.ticker) ? "text-[var(--gold-soft)]" : "text-[var(--faint)] hover:text-[var(--muted)]"}
                >
                  {watchlist.includes(r.ticker) ? "✓ In Watchlist" : "+ Watchlist"}
                </button>
                <label className="flex items-center gap-1.5 text-[var(--faint)] hover:text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={compareTickers.includes(r.ticker)}
                    onChange={() => onToggleCompare(r.ticker)}
                    className="accent-[var(--gold)]"
                  />
                  Vergleichen
                </label>
              </>
            }
          />
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
