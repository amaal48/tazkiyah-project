import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHoldingsCsv, holdingsToSql, parseDate, parseNumber } from "./holdingsCsv.js";

const EN = `iShares MSCI World Islamic UCITS ETF
Fund Holdings as of,"30/Sep/2026"
Inception Date,"07/Dec/2007"

Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Nominal,Price,Location,Exchange,Market Currency
"MSFT","MICROSOFT CORP","Information Technology","Equity","70,123,456.00","8.12","70,123,456.00","150,000.00","467.50","United States","NASDAQ","USD"
"ASML","ASML HOLDING NV","Information Technology","Equity","20,000,000.00","2.31","20,000,000.00","30,000.00","666.00","Netherlands","Euronext Amsterdam","EUR"
"BRKB","O'REILLY TEST","Consumer","Equity","1,000.00","0.50","1,000.00","1.00","1.00","United States","NYSE","USD"
"USD","USD CASH","Cash and/or Derivatives","Cash","2,000,000.00","0.25","2,000,000.00","2,000,000.00","100.00","United States","-","USD"

"The content contained herein is owned or licensed by BlackRock"
`;

const DE = `iShares MSCI World Islamic UCITS ETF
Fondspositionen per,"30.09.2026"

Emittententicker,Name,Sektor,Anlageklasse,Marktwert,Gewichtung (%),Nominalwert,Nominale,Kurs,Standort,Börse,Marktwährung
"MSFT","MICROSOFT CORP","IT","Aktien","70.123.456,00","8,12","70.123.456,00","150.000,00","467,50","Vereinigte Staaten","NASDAQ","USD"
`;

test("englische iShares-CSV", () => {
  const p = parseHoldingsCsv(EN);
  assert.equal(p.asOf, "2026-09-30");
  assert.equal(p.holdings.length, 3);
  assert.equal(p.holdings[0].key, "TICKER:MSFT:United States");
  assert.equal(p.holdings[0].weight, 8.12);
  assert.equal(p.skipped.Cash, 0.25);
  assert.equal(p.hasIsin, false);
});

test("deutsche iShares-CSV mit Dezimalkomma", () => {
  const p = parseHoldingsCsv(DE);
  assert.equal(p.asOf, "2026-09-30");
  assert.equal(p.holdings[0].weight, 8.12);
  assert.equal(p.holdings[0].country, "Vereinigte Staaten");
});

test("SQL escaped Apostrophe und ist wiederholbar", () => {
  const p = parseHoldingsCsv(EN);
  const sql = holdingsToSql({ etfTicker: "ISWD", asOf: p.asOf, holdings: p.holdings, sourceUrl: null });
  assert.match(sql, /O''REILLY/);
  assert.match(sql, /delete from public\.etf_holdings/);
});

test("Datums- und Zahlenformate", () => {
  assert.equal(parseDate("7/Dec/2007"), "2007-12-07");
  assert.equal(parseNumber("1.234,5", true), 1234.5);
  assert.equal(parseNumber("1,234.5", false), 1234.5);
  assert.equal(parseNumber("-", false), null);
});

test("fehlende Kopfzeile → verständlicher Fehler", () => {
  assert.throws(() => parseHoldingsCsv("foo,bar\n1,2"), /Kopfzeile/);
});
