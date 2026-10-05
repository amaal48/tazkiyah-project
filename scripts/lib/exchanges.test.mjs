import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSecExchanges, matchExchanges, exchangesToSql } from "./exchanges.mjs";

const SEC = {
  fields: ["cik", "name", "ticker", "exchange"],
  data: [
    [320193, "Apple Inc.", "AAPL", "Nasdaq"],
    [1067983, "BERKSHIRE HATHAWAY INC", "BRK-B", "NYSE"],
    [1067983, "BERKSHIRE HATHAWAY INC", "BRK-A", "NYSE"],
    [1374310, "Cboe Global Markets, Inc.", "CBOE", "CBOE"],
    [1, "Irgendwas OTC", "XYZF", "OTC"],
    [2, "Ohne Börse", "NOEX", null],
    [3, "Doppelt", "AAPL", "OTC"],
  ],
};

test("SEC-Datei lesen: erster Eintrag je Ticker zählt", () => {
  const m = parseSecExchanges(SEC);
  assert.equal(m.get("AAPL"), "Nasdaq");
  assert.equal(m.get("BRK-B"), "NYSE");
});

test("Unerwartetes Format wird abgelehnt", () => {
  assert.throws(() => parseSecExchanges({ fields: ["cik"], data: [] }));
});

test("Zuordnung: bekannte Börsen, unbekannte und fehlende getrennt", () => {
  const r = matchExchanges(["AAPL", "BRK-B", "CBOE", "XYZF", "NOEX", "EA"], parseSecExchanges(SEC));
  assert.deepEqual(r.found, [["AAPL", "NASDAQ"], ["BRK-B", "NYSE"], ["CBOE", "CBOE"]]);
  assert.deepEqual(r.unknown, [["XYZF", "OTC"], ["NOEX", null]]);
  assert.deepEqual(r.missing, ["EA"]);
});

test("SQL: Spalte anlegen, nur leere Felder füllen, Lücken als Kommentar", () => {
  const r = matchExchanges(["AAPL", "BRK-B", "XYZF", "EA"], parseSecExchanges(SEC));
  const sql = exchangesToSql({ ...r, fetchedAt: "2026-10-05" });
  assert.match(sql, /add column if not exists exchange text/);
  assert.match(sql, /\('AAPL', 'NASDAQ'\)/);
  assert.match(sql, /\('BRK-B', 'NYSE'\)/);
  assert.match(sql, /and s\.exchange is null;/);
  assert.match(sql, /Nicht in der SEC-Liste \(bleiben leer\): EA/);
  assert.match(sql, /XYZF \(OTC\)/);
  assert.doesNotMatch(sql, /'XYZF', /);
});
