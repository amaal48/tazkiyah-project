import { test } from "node:test";
import assert from "node:assert/strict";
import { tradingViewSymbol, tradingViewSymbolUrl } from "./tradingView.js";

test("Börse und Ticker ergeben das TradingView-Symbol", () => {
  assert.equal(tradingViewSymbol("AAPL", "NASDAQ"), "NASDAQ:AAPL");
  assert.equal(tradingViewSymbol("KO", "NYSE"), "NYSE:KO");
  assert.equal(tradingViewSymbol("CBOE", "CBOE"), "CBOE:CBOE");
  assert.equal(tradingViewSymbol("A", "nyse"), "NYSE:A");
});

test("Aktiengattung: Bindestrich wird zum Punkt", () => {
  assert.equal(tradingViewSymbol("BRK-B", "NYSE"), "NYSE:BRK.B");
  assert.equal(tradingViewSymbol("BF-B", "NYSE"), "NYSE:BF.B");
});

test("Unbekannte oder fehlende Börse: kein Symbol", () => {
  assert.equal(tradingViewSymbol("AAPL", null), null);
  assert.equal(tradingViewSymbol("AAPL", ""), null);
  assert.equal(tradingViewSymbol("XYZ", "OTC"), null);
  assert.equal(tradingViewSymbol("ISWD", "XETRA"), null);
});

test("Ungewöhnlicher Ticker: kein Symbol", () => {
  assert.equal(tradingViewSymbol("", "NYSE"), null);
  assert.equal(tradingViewSymbol(null, "NYSE"), null);
  assert.equal(tradingViewSymbol("BRK.B", "NYSE"), null);
  assert.equal(tradingViewSymbol("ABC\"<x>", "NYSE"), null);
});

test("Link zur Symbolseite", () => {
  assert.equal(tradingViewSymbolUrl("NYSE:BRK.B"), "https://www.tradingview.com/symbols/NYSE-BRK.B/");
});
