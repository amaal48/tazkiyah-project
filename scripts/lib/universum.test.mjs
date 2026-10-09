// scripts/lib/universum.test.mjs — Universums-Prüfung per Excel (Import-Logik)
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEdits, universeSql, overridesProposal, sortRows, clean } from "./universum.mjs";

const row = (over) => ({ row: 2, ticker: "AAA", handling: "allow", group: "", active: "ja", newTicker: "", newName: "", newExchange: "", override: "", overrideReason: "", ...over });

test("Abweichung ohne Begründung → Fehler mit Zeilennummer", () => {
  const r = validateEdits([row({ row: 17, ticker: "TKO", override: "exclude" })]);
  assert.deepEqual(r.errors, ["Zeile 17 (TKO): Behandlung abweichend (exclude) ohne Begründung"]);
});

test("Ungültige Werte: Aktiv, Behandlung, Börse, Ticker doppelt", () => {
  const r = validateEdits([
    row({ row: 2, ticker: "AAA", active: "vielleicht" }),
    row({ row: 3, ticker: "BBB", override: "verbieten", overrideReason: "x" }),
    row({ row: 4, ticker: "CCC", newTicker: "AAA" }),
    row({ row: 5, ticker: "DDD", newTicker: "NEU", newExchange: "LSE" }),
  ]);
  assert.equal(r.errors.length, 4);
  assert.match(r.errors[0], /Zeile 2 \(AAA\): Aktiv/);
  assert.match(r.errors[2], /gibt es schon/);
  assert.match(r.errors[3], /Neue Börse/);
});

test("Gültige Bearbeitung: inaktiv, Umbenennung, Abweichung mit Begründung", () => {
  const r = validateEdits([
    row({ ticker: "AVB", active: "nein" }),
    row({ ticker: "PSKY", newTicker: "skyd", newName: "Skydance Corp", newExchange: "nyse" }),
    row({ ticker: "TKO", handling: "review", group: "film_streaming_games", override: "exclude", overrideReason: "Glücksspiel-Anteil" }),
    row({ ticker: "KO", handling: "b3_focus", override: "b3_focus", overrideReason: "gleich" }),
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.deactivate, ["AVB"]);
  assert.deepEqual(r.renames, [{ ticker: "PSKY", newTicker: "SKYD", newName: "Skydance Corp", newExchange: "NYSE" }]);
  assert.deepEqual(r.overrides, [{ ticker: "TKO", from: "review", handling: "exclude", group: "film_streaming_games", reason: "Glücksspiel-Anteil" }]);
  assert.equal(r.warnings.length, 1); // KO: keine echte Abweichung
});

test("SQL: Spalte active, Watchlist mit umbenannt, Ticker und Symbol, Quoting; nichts für leere Listen", () => {
  const sql = universeSql(
    { deactivate: ["AVB"], activate: ["KO"], renames: [{ ticker: "PSKY", newTicker: "SKYD", newName: "O'Brien Corp", newExchange: "NYSE" }] },
    { date: "2026-10-09", source: "x.xlsx" }
  );
  assert.match(sql, /add column if not exists active boolean not null default true/);
  assert.match(sql, /set active = false where ticker in \('AVB'\)/);
  assert.match(sql, /set active = true where active = false and ticker not in \('AVB'\)/);
  assert.match(sql, /update public.watchlist_items set ticker = 'SKYD' where ticker = 'PSKY'/);
  assert.match(sql, /set ticker = 'SKYD', provider_symbol = case/);
  assert.match(sql, /name = 'O''Brien Corp'/);
  assert.ok(sql.indexOf("watchlist_items") < sql.indexOf("set ticker = 'SKYD'"));
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
});

test("Vorschlag MANUAL_OVERRIDES mit Datum und Begründung", () => {
  const md = overridesProposal([{ ticker: "TKO", from: "review", handling: "exclude", group: "film_streaming_games", reason: "Glücksspiel" }], { date: "2026-10-09", source: "x" });
  assert.match(md, /export const MANUAL_OVERRIDES = \{/);
  assert.match(md, /"TKO": \{ handling: "exclude", group: "film_streaming_games", date: "2026-10-09", reason: "Glücksspiel" \}, \/\/ bisher review/);
  assert.match(overridesProposal([], { date: "2026-10-09", source: "x" }), /Keine abweichenden/);
});

test("Sortierung nach Behandlung, dann Ticker; Zellwerte aus Excel", () => {
  const s = sortRows([{ ticker: "B", handling: "allow" }, { ticker: "ISWD", handling: "etf" }, { ticker: "A", handling: "allow" }, { ticker: "Z", handling: "exclude" }]);
  assert.deepEqual(s.map((r) => r.ticker), ["Z", "A", "B", "ISWD"]);
  assert.equal(clean({ richText: [{ text: " ja" }] }), "ja");
  assert.equal(clean(null), "");
  assert.equal(clean(320), "320");
});
