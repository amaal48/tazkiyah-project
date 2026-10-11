// src/components/screening/format.test.js — B1/B2 in der Oberfläche nur binär
import { test } from "node:test";
import assert from "node:assert/strict";
import * as f from "./format.js";

// format.js setzt ein geschütztes Leerzeichen vor „%“; für die Vergleiche als normales Leerzeichen
const norm = (x) => (typeof x === "string" ? x.replace(/[\u00a0\u202f]/g, " ") : x);
const binaryOutcome = (c) => norm(f.binaryOutcome(c));
const reasonLine = (r) => norm(f.reasonLine(r));
const reasonDetails = (h) => ({ failed: f.reasonDetails(h).failed.map((x) => ({ ...x, text: norm(x.text) })) });
const { headlineFromCriteria } = f;

const row = (headline) => ({ hasResult: true, status: "nicht_konform", headline, runAt: "2026-10-11" });

test("binaryOutcome: höchstens/über bei Höchstwerten, mindestens/unter bei Mindestwerten, sonst null", () => {
  assert.equal(binaryOutcome({ result: "pass", limit: 30, comparator: "<=" }), "höchstens 30 %");
  assert.equal(binaryOutcome({ result: "fail", limit: 30, comparator: "<=" }), "über 30 %");
  assert.equal(binaryOutcome({ result: "pass", limit: 33.3, comparator: ">=" }), "mindestens 33,3 %");
  assert.equal(binaryOutcome({ result: "fail", limit: 33.3, comparator: ">=" }), "unter 33,3 %");
  assert.equal(binaryOutcome({ result: "not_checked", limit: 30, comparator: "<=" }), null);
  assert.equal(binaryOutcome(null), null);
});

test("Begründungszeile B1 ohne Wert (öffentliches Ergebnis)", () => {
  const h = { failed: [{ criterion: "B1", name: "Zinstragende Schulden", reason: null, check: { basis: "quarter", periodEnd: "2026-06-30", limit: 30, comparator: "<=" } }], notChecked: [] };
  assert.equal(reasonLine(row(h)), "Zinstragende Schulden über 30 %, Quartal 30.06.2026.");
});

test("Begründungszeile B2 zeigt auch dann keinen Wert, wenn ein älteres Ergebnis ihn noch enthält", () => {
  const h = { failed: [{ criterion: "B2", name: "Zinstragende Einlagen", reason: null, check: { basis: "annual", periodEnd: "2025-12-31", value: 41.27, limit: 30, comparator: "<=" } }], notChecked: [] };
  const line = reasonLine(row(h));
  assert.equal(line, "Zinstragende Einlagen über 30 %, Jahresabschluss 31.12.2025.");
  assert.ok(!line.includes("41"));
  assert.ok(!reasonDetails(h).failed[0].text.includes("41"));
});

test("Ersatz aus den Prüfungen (Ergebnis ohne headline): B1 ohne Wert, B3 weiter mit Wert", () => {
  const criteria = [
    { id: "B1", name: "Zinstragende Schulden", result: "fail", checks: [{ basis: "annual", periodEnd: "2025-12-31", value: 35.5, distanceToLimit: -5.5, limit: 30, comparator: "<=", result: "fail" }] },
    { id: "B3", name: "Verbotene Einnahmen", result: "fail", checks: [{ basis: "annual", periodEnd: "2025-12-31", value: 7.25, limit: 5, comparator: "<=", result: "fail" }] },
  ];
  const texts = reasonDetails(headlineFromCriteria(criteria)).failed.map((f) => f.text);
  assert.equal(texts[0], "Zinstragende Schulden über 30 %, Jahresabschluss 31.12.2025");
  assert.ok(!texts[0].includes("35"));
  assert.match(texts[1], /^Verbotene Einnahmen 7,3 % \(höchstens 5 %\)/);
});
