// src/screening/holdingsCsv.js
//
// Liest die Bestandsliste (Holdings-CSV) eines ETFs, wie sie iShares auf der
// Produktseite zum Download anbietet, und erzeugt daraus SQL für die Tabelle
// etf_holdings. Unterstützt die englische und die deutsche Fassung.
//
// Aufnahme nur von Aktienpositionen (Asset Class „Equity“ / „Aktien“).
// Cash, Devisen und Geldmarkt werden gezählt und gemeldet, aber nicht
// übernommen — der Look-through (G1) prüft nur Aktien.

const HEADER_ALIASES = {
  ticker: ["ticker", "emittententicker"],
  name: ["name"],
  assetClass: ["asset class", "anlageklasse"],
  weight: ["weight (%)", "gewichtung (%)"],
  country: ["location", "standort"],
  isin: ["isin"],
};
const EQUITY = new Set(["equity", "aktien"]);
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  mär: 3, mai: 5, okt: 10, dez: 12 };

/** Zerlegt eine CSV-Zeile mit Anführungszeichen korrekt. */
export function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Zahl aus englischem („1,234.56“) oder deutschem („1.234,56“) Format. */
export function parseNumber(s, decimalComma) {
  if (s == null) return null;
  let t = String(s).replace(/[%\s]/g, "");
  if (!t || t === "-") return null;
  t = decimalComma ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Stichtag aus „30/Sep/2026“, „30.09.2026“ oder „2026-09-30“. */
export function parseDate(s) {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/ .-]([A-Za-zäÄ]{3})[a-zä]*[/ .-](\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function parseHoldingsCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let asOf = null;
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]).map((c) => c.toLowerCase());
    if (!asOf && /holdings as of|positionen per|stand/.test(cells[0] || "")) asOf = parseDate(splitCsvLine(lines[i])[1]);
    if (HEADER_ALIASES.ticker.some((a) => cells.includes(a)) && HEADER_ALIASES.weight.some((a) => cells.includes(a))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("Kopfzeile mit Ticker und Gewichtung nicht gefunden — ist das die Holdings-CSV?");

  const header = splitCsvLine(lines[headerIdx]).map((c) => c.toLowerCase());
  const col = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) col[key] = header.findIndex((h) => aliases.includes(h));
  const decimalComma = header.includes("gewichtung (%)");

  const rows = [];
  const skipped = {};
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const c = splitCsvLine(line);
    if (c.length < header.length - 2) continue; // Fußzeilen / Hinweistexte
    const assetClass = (c[col.assetClass] || "").trim();
    const weight = parseNumber(c[col.weight], decimalComma);
    if (!EQUITY.has(assetClass.toLowerCase())) {
      const key = assetClass || "unbekannt";
      skipped[key] = (skipped[key] || 0) + (weight || 0);
      continue;
    }
    if (weight === null) continue;
    const ticker = (c[col.ticker] || "").trim();
    const country = col.country >= 0 ? (c[col.country] || "").trim() : "";
    const isin = col.isin >= 0 ? (c[col.isin] || "").trim() : "";
    rows.push({
      key: isin && /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) ? isin : `TICKER:${ticker}:${country}`,
      ticker,
      name: (c[col.name] || "").trim(),
      country,
      weight,
    });
  }

  // Doppelte Zeilen (gleicher Titel mehrfach gelistet) zusammenfassen
  const merged = new Map();
  for (const r of rows) {
    if (merged.has(r.key)) merged.get(r.key).weight += r.weight;
    else merged.set(r.key, { ...r });
  }
  const holdings = [...merged.values()];
  const equityWeight = holdings.reduce((a, r) => a + r.weight, 0);
  return { asOf, holdings, equityWeight, skipped, hasIsin: col.isin >= 0 };
}

const q = (s) => (s == null || s === "" ? "null" : `'${String(s).replace(/'/g, "''")}'`);

/** SQL: vorhandene Zeilen dieses ETFs und Stichtags ersetzen (wiederholbar). */
export function holdingsToSql({ etfTicker, asOf, holdings, sourceUrl }) {
  const values = holdings
    .map((h) => `  (${q(h.key)}, ${q(h.name)}, ${q(h.ticker)}, ${q(h.country)}, ${Number(h.weight.toFixed(6))})`)
    .join(",\n");
  return `-- Holdings ${etfTicker} zum ${asOf} (${holdings.length} Aktienpositionen)
begin;

delete from public.etf_holdings
where etf_id = (select id from public.securities where ticker = ${q(etfTicker)})
  and as_of = ${q(asOf)};

insert into public.etf_holdings (etf_id, holding_isin, holding_name, holding_ticker, holding_country, weight, as_of, source_url)
select s.id, v.key, v.name, v.ticker, v.country, v.weight, ${q(asOf)}, ${q(sourceUrl)}
from public.securities s
cross join (values
${values}
) as v(key, name, ticker, country, weight)
where s.ticker = ${q(etfTicker)};

commit;
`;
}
