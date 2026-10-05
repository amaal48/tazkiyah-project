// src/lib/tradingView.js
//
// Symbol für die TradingView-Widgets aus Ticker und US-Börse (securities.exchange).
// Nur bekannte Börsen, sonst null: Dann zeigt die Detailseite kein Widget, statt zu raten.
//
//   tradingViewSymbol("AAPL", "NASDAQ")  → "NASDAQ:AAPL"
//   tradingViewSymbol("BRK-B", "NYSE")   → "NYSE:BRK.B"   (Aktiengattung: Punkt statt Bindestrich)
//   tradingViewSymbol("XYZ", "OTC")      → null

// Börse in securities.exchange → Präfix bei TradingView
const TV_EXCHANGES = { NASDAQ: "NASDAQ", NYSE: "NYSE", CBOE: "CBOE" };

// US-Ticker: 1–5 Buchstaben, optional Gattung mit Bindestrich (BRK-B, BF-B)
const US_TICKER = /^[A-Z]{1,5}(-[A-Z])?$/;

export function tradingViewSymbol(ticker, exchange) {
  const prefix = TV_EXCHANGES[String(exchange ?? "").trim().toUpperCase()];
  if (!prefix || typeof ticker !== "string" || !US_TICKER.test(ticker)) return null;
  return `${prefix}:${ticker.replace("-", ".")}`;
}

/** Seite des Symbols bei TradingView (für den Pflicht-Link unter dem Widget), z. B. …/symbols/NYSE-BRK.B/ */
export function tradingViewSymbolUrl(symbol) {
  return `https://www.tradingview.com/symbols/${symbol.replace(":", "-")}/`;
}
