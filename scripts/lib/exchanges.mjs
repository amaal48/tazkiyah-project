// scripts/lib/exchanges.mjs — US-Börse je Aktie aus der SEC-Liste company_tickers_exchange.json,
// als SQL für securities.exchange. Reine Funktionen, testbar ohne Netzwerk.

export const SEC_EXCHANGES_URL = "https://www.sec.gov/files/company_tickers_exchange.json";

// Börse in der SEC-Liste → Wert in securities.exchange. Alles andere (OTC, leer) wird nicht übernommen.
const EXCHANGE_MAP = { Nasdaq: "NASDAQ", NYSE: "NYSE", CBOE: "CBOE" };

const SAFE_TICKER = /^[A-Z]{1,5}(-[A-Z])?$/;

/** SEC-Datei { fields, data } → Map Ticker → Börse (erster Eintrag je Ticker, nur bekannte Börsen) */
export function parseSecExchanges(json) {
  const fields = json?.fields || [];
  const iTicker = fields.indexOf("ticker");
  const iExchange = fields.indexOf("exchange");
  if (iTicker < 0 || iExchange < 0) throw new Error("Unerwartetes Format der SEC-Datei (Felder ticker/exchange fehlen)");
  const raw = new Map();
  for (const row of json.data || []) {
    const t = row[iTicker];
    if (typeof t === "string" && !raw.has(t)) raw.set(t, row[iExchange]);
  }
  return raw;
}

/**
 * Ordnet die eigenen Ticker zu.
 * @returns {{ found: [ticker, exchange][], unknown: [ticker, secValue][], missing: string[] }}
 */
export function matchExchanges(tickers, secMap) {
  const found = [];
  const unknown = [];
  const missing = [];
  for (const t of tickers) {
    if (!secMap.has(t)) {
      missing.push(t);
      continue;
    }
    const ex = EXCHANGE_MAP[secMap.get(t)];
    if (ex && SAFE_TICKER.test(t)) found.push([t, ex]);
    else unknown.push([t, secMap.get(t)]);
  }
  return { found, unknown, missing };
}

/** SQL für den Supabase SQL Editor. Wiederholbar: legt die Spalte an und füllt nur leere Felder. */
export function exchangesToSql({ found, unknown, missing, fetchedAt }) {
  const lines = [];
  lines.push("-- supabase_securities_exchange.sql");
  lines.push("--");
  lines.push("-- US-Börse je Aktie für die Kurs-Widgets (TradingView) auf der Detailseite.");
  lines.push(`-- Quelle: ${SEC_EXCHANGES_URL}, abgerufen ${fetchedAt}.`);
  lines.push("-- Erzeugt mit: node scripts/sec-exchanges.mjs");
  lines.push("--");
  lines.push("-- Wiederholbar: legt die Spalte an, falls sie fehlt, und füllt nur leere Felder.");
  lines.push("-- Vorhandene Werte (auch von Hand eingetragene) werden nie überschrieben.");
  lines.push("-- Leeres Feld = Börse unbekannt → die Detailseite zeigt kein Kurs-Widget.");
  if (missing.length) lines.push(`-- Nicht in der SEC-Liste (bleiben leer): ${missing.join(", ")}`);
  if (unknown.length) lines.push(`-- Andere Börse in der SEC-Liste (bleiben leer): ${unknown.map(([t, e]) => `${t} (${e ?? "leer"})`).join(", ")}`);
  lines.push("");
  lines.push("alter table public.securities add column if not exists exchange text;");
  lines.push("");
  lines.push("comment on column public.securities.exchange is");
  lines.push("  'US-Börse (NASDAQ, NYSE, CBOE) für die Kurs-Widgets. Quelle: SEC company_tickers_exchange.json. Leer = unbekannt, dann kein Widget.';");
  lines.push("");
  if (found.length) {
    lines.push("update public.securities s");
    lines.push("set exchange = v.exchange");
    lines.push("from (values");
    lines.push(found.map(([t, e]) => `  ('${t}', '${e}')`).join(",\n"));
    lines.push(") as v(ticker, exchange)");
    lines.push("where s.ticker = v.ticker");
    lines.push("  and s.exchange is null;");
    lines.push("");
  }
  lines.push("-- Kontrolle: wie viele Titel haben jetzt eine Börse?");
  lines.push("select exchange, count(*) as titel");
  lines.push("from public.securities");
  lines.push("group by exchange");
  lines.push("order by exchange nulls last;");
  lines.push("");
  return lines.join("\n");
}
