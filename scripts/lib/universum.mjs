// scripts/lib/universum.mjs
//
// Reine Hilfsfunktionen für die Universums-Prüfung per Excel (kein Netzwerk, kein Dateizugriff):
//   scripts/export-universum.mjs  erzeugt docs/universum-pruefung.xlsx
//   scripts/import-universum.mjs  liest die bearbeitete Datei und erzeugt SQL + Vorschlag MANUAL_OVERRIDES
//
// Schlüssel in der Datenbank: Prüfungen (manual_reviews), Verlauf (screening_runs, screening_status_changes),
// Reinigung (purification_amounts), Holdings (etf_holdings.etf_id) und Benachrichtigungen hängen an
// securities.id, nicht am Ticker. Den Ticker speichern nur die Watchlist (watchlist_items.ticker, Gast-
// Watchlist im Browser) und die Ticker-Listen in industryRules.js. Eine Umbenennung trennt deshalb keine
// Prüfungen und keinen Verlauf; die Watchlist wird im SQL mit umbenannt.

export const HANDLINGS = ["exclude", "review", "b3_focus", "allow"];
export const HANDLING_ORDER = ["exclude", "review", "b3_focus", "allow", "unknown", "etf"];
export const EXCHANGES = ["NYSE", "NASDAQ", "CBOE"];

// Spalten: info = grau (nur Information), edit = gelb (bearbeitbar)
export const COLUMNS = [
  { key: "ticker", header: "Ticker", kind: "info", width: 9 },
  { key: "name", header: "Name", kind: "info", width: 34 },
  { key: "cik", header: "CIK", kind: "info", width: 12 },
  { key: "exchange", header: "Börse", kind: "info", width: 9 },
  { key: "sic", header: "SIC", kind: "info", width: 7 },
  { key: "sicDescription", header: "SIC-Beschreibung", kind: "info", width: 36 },
  { key: "group", header: "Gruppe", kind: "info", width: 20 },
  { key: "handling", header: "Behandlung", kind: "info", width: 11 },
  { key: "reason", header: "Grund", kind: "info", width: 60 },
  { key: "status", header: "Ergebnis im Screener", kind: "info", width: 16 },
  { key: "hint", header: "Hinweis", kind: "info", width: 50 },
  { key: "active", header: "Aktiv", kind: "edit", width: 8 },
  { key: "newTicker", header: "Neuer Ticker", kind: "edit", width: 12 },
  { key: "newName", header: "Neuer Name", kind: "edit", width: 26 },
  { key: "newExchange", header: "Neue Börse", kind: "edit", width: 11 },
  { key: "override", header: "Behandlung abweichend", kind: "edit", width: 14 },
  { key: "overrideReason", header: "Begründung", kind: "edit", width: 50 },
];

export const STATUS_DE = { konform: "konform", nicht_konform: "nicht konform", nicht_geprueft: "nicht geprüft" };

const cellText = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return cellText(v.result);
    if ("text" in v) return String(v.text);
  }
  return String(v);
};
export const clean = (v) => cellText(v).trim();

/** Sortierung: Behandlung (exclude → … → unknown → etf), dann Ticker. */
export function sortRows(rows) {
  const rank = (h) => {
    const i = HANDLING_ORDER.indexOf(h);
    return i === -1 ? HANDLING_ORDER.length : i;
  };
  return [...rows].sort((a, b) => rank(a.handling) - rank(b.handling) || a.ticker.localeCompare(b.ticker));
}

/**
 * Prüft die bearbeiteten Zeilen. rows: [{ row (Excel-Zeile), ticker, handling, active, newTicker, newName,
 * newExchange, override, overrideReason }]. Gibt { errors, warnings, deactivate, activate, renames, overrides }.
 */
export function validateEdits(rows) {
  const errors = [];
  const warnings = [];
  const existing = new Set(rows.map((r) => r.ticker.toUpperCase()));
  const newTickers = new Map();
  const out = { deactivate: [], activate: [], renames: [], overrides: [] };

  for (const r of rows) {
    const at = `Zeile ${r.row} (${r.ticker || "ohne Ticker"})`;
    if (!r.ticker) {
      errors.push(`${at}: Ticker fehlt`);
      continue;
    }
    const active = r.active.toLowerCase();
    if (active === "nein") out.deactivate.push(r.ticker);
    else if (active === "ja" || active === "") out.activate.push(r.ticker);
    else errors.push(`${at}: Aktiv muss „ja“ oder „nein“ sein, nicht „${r.active}“`);

    const newTicker = r.newTicker.toUpperCase();
    if (newTicker || r.newName || r.newExchange) {
      if (newTicker && !/^[A-Z0-9][A-Z0-9.-]{0,9}$/.test(newTicker)) errors.push(`${at}: Neuer Ticker „${r.newTicker}“ ist ungültig`);
      if (newTicker && newTicker !== r.ticker.toUpperCase() && existing.has(newTicker)) {
        errors.push(`${at}: Neuer Ticker ${newTicker} gibt es schon im Universum`);
      }
      if (newTicker && newTickers.has(newTicker)) errors.push(`${at}: Neuer Ticker ${newTicker} doppelt (auch ${newTickers.get(newTicker)})`);
      if (newTicker) newTickers.set(newTicker, `Zeile ${r.row}`);
      const exchange = r.newExchange.toUpperCase();
      if (exchange && !EXCHANGES.includes(exchange)) errors.push(`${at}: Neue Börse muss ${EXCHANGES.join(", ")} sein, nicht „${r.newExchange}“`);
      out.renames.push({ ticker: r.ticker, newTicker: newTicker || null, newName: r.newName || null, newExchange: exchange || null });
    }

    const override = r.override.toLowerCase();
    if (override) {
      if (!HANDLINGS.includes(override)) {
        errors.push(`${at}: Behandlung abweichend muss ${HANDLINGS.join(", ")} oder leer sein, nicht „${r.override}“`);
      } else if (!r.overrideReason) {
        errors.push(`${at}: Behandlung abweichend (${override}) ohne Begründung`);
      } else if (override === r.handling) {
        warnings.push(`${at}: Behandlung abweichend = bisherige Behandlung (${override}), keine Abweichung`);
      } else {
        out.overrides.push({ ticker: r.ticker, from: r.handling, handling: override, group: r.group || null, reason: r.overrideReason });
      }
    } else if (r.overrideReason) {
      warnings.push(`${at}: Begründung ohne abweichende Behandlung (ignoriert)`);
    }
  }
  return { errors, warnings, ...out };
}

export const sqlString = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const sqlList = (xs) => xs.map(sqlString).join(", ");

/** SQL für securities (active, Umbenennungen) und watchlist_items. Wird nie automatisch ausgeführt. */
export function universeSql({ deactivate, activate, renames }, { date, source }) {
  const lines = [
    `-- Universum-Anpassung vom ${date}, erzeugt mit scripts/import-universum.mjs aus ${source}.`,
    "-- Nicht automatisch ausgeführt: im Supabase SQL Editor ausführen und die Kontrollabfrage am Ende prüfen.",
    "--",
    "-- Prüfungen (manual_reviews), Verlauf (screening_runs, screening_status_changes), Reinigung und Holdings",
    "-- hängen an securities.id, nicht am Ticker: Eine Umbenennung trennt nichts. Die Watchlist (watchlist_items)",
    "-- speichert den Ticker und wird mit umbenannt. Nicht erreichbar: Gast-Watchlists im Browser (alter Ticker",
    "-- bleibt dort stehen) und alte Links #/aktie/<alter Ticker>.",
    "",
    "begin;",
    "",
    "-- Inaktive Titel (z. B. delistet) ruft der Cron nicht mehr ab, die Website zeigt sie nicht in der Liste.",
    "alter table public.securities add column if not exists active boolean not null default true;",
    "comment on column public.securities.active is",
    "  'false = nicht mehr im Universum (z. B. delistet). Cron ruft nicht ab, Website-Liste blendet aus. Historie bleibt.';",
    "grant select (active) on public.securities to anon, authenticated;",
    "",
  ];
  if (deactivate.length) lines.push(`update public.securities set active = false where ticker in (${sqlList(deactivate)});`);
  // Alle übrigen Titel aktiv (falls früher einmal inaktiv gesetzt)
  if (activate.length) {
    lines.push(
      `update public.securities set active = true where active = false${deactivate.length ? ` and ticker not in (${sqlList(deactivate)})` : ""};`
    );
  }
  if (renames.length) {
    lines.push("", "-- Umbenennungen");
    for (const r of renames) {
      if (r.newTicker && r.newTicker !== r.ticker) {
        lines.push(
          "do $$ begin",
          "  if to_regclass('public.watchlist_items') is not null then",
          `    update public.watchlist_items set ticker = ${sqlString(r.newTicker)} where ticker = ${sqlString(r.ticker)};`,
          "  end if;",
          "end $$;"
        );
      }
      const set = [];
      if (r.newTicker && r.newTicker !== r.ticker) {
        set.push(`ticker = ${sqlString(r.newTicker)}`);
        set.push(`provider_symbol = case when provider_symbol is null or provider_symbol = ${sqlString(r.ticker)} then ${sqlString(r.newTicker)} else provider_symbol end`);
      }
      if (r.newName) set.push(`name = ${sqlString(r.newName)}`);
      if (r.newExchange) set.push(`exchange = ${sqlString(r.newExchange)}`);
      if (set.length) lines.push(`update public.securities set ${set.join(", ")}, updated_at = now() where ticker = ${sqlString(r.ticker)};`);
    }
  }
  const check = [...new Set([...deactivate, ...renames.flatMap((r) => [r.ticker, r.newTicker].filter(Boolean))])];
  lines.push("", "commit;", "");
  if (check.length) {
    lines.push("-- Kontrolle", `select ticker, name, exchange, provider_symbol, active from public.securities where ticker in (${sqlList(check)}) order by ticker;`, "");
  }
  return lines.join("\n");
}

/** Vorschlag für industryRules.js: MANUAL_OVERRIDES mit Datum und Begründung (wird nicht automatisch eingebaut). */
export function overridesProposal(overrides, { date, source }) {
  const lines = [
    `# Vorschlag MANUAL_OVERRIDES (${date})`,
    "",
    `Aus ${source}, Spalte „Behandlung abweichend“. Nur ein Vorschlag: Erst nach Freigabe in src/screening/industryRules.js übernehmen (gilt dann wie die Ticker-Listen nur bei SEC-Daten).`,
    "",
  ];
  if (!overrides.length) {
    lines.push("Keine abweichenden Behandlungen.", "");
    return lines.join("\n");
  }
  lines.push("| Ticker | bisher | neu | Begründung |", "| --- | --- | --- | --- |");
  for (const o of overrides) lines.push(`| ${o.ticker} | ${o.from} | ${o.handling} | ${o.reason.replace(/\|/g, "\\|")} |`);
  lines.push("", "```js", "export const MANUAL_OVERRIDES = {");
  for (const o of overrides) {
    lines.push(`  ${JSON.stringify(o.ticker)}: { handling: ${JSON.stringify(o.handling)}, group: ${JSON.stringify(o.group)}, date: ${JSON.stringify(date)}, reason: ${JSON.stringify(o.reason)} }, // bisher ${o.from}`);
  }
  lines.push("};", "```", "");
  return lines.join("\n");
}
