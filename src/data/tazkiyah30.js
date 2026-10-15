// src/data/tazkiyah30.js
//
// Die Tazkiyah 30 (Neue Ausrichtung 15.10.2026). Maßgeblich ist die Tabelle tazkiyah30 in Supabase
// (supabase_tazkiyah30.sql). Diese Liste ist nur der Rückfall, solange die Tabelle noch nicht angelegt
// ist oder nicht geladen werden kann, und muss mit der SQL-Datei übereinstimmen.
//
// gruppe: "beliebt" = verbreitet bei deutschen Anlegern, "datenlage" = wegen guter Datenlage aufgenommen.

export const TAZKIYAH30_SIZE = 30;

const BELIEBT = new Set(["NVDA", "MU", "AMD", "CRM", "META", "PLTR", "ADBE", "LLY", "JNJ", "PFE"]);

export const TAZKIYAH30_FALLBACK = [
  "NVDA", "MU", "QCOM", "TXN", "ADI", "AMAT", "LRCX", "KLAC", "ANET", "AMD",
  "CRM", "META", "PLTR", "ADBE", "SNPS", "FTNT", "WDAY", "LLY", "JNJ", "PFE",
  "AMGN", "GILD", "REGN", "VRTX", "BMY", "SYK", "BSX", "EW", "SHW", "ITW",
].map((ticker, i) => ({
  ticker,
  sortOrder: i + 1,
  gruppe: BELIEBT.has(ticker) ? "beliebt" : "datenlage",
  kurzbegruendung: null,
  aufgenommenAm: "2026-10-15",
}));

/** Endergebnis vorhanden (öffentlich angezeigt); „nicht geprüft“ erscheint öffentlich nicht. */
export const FINAL_STATUSES = new Set(["konform", "nicht_konform"]);
