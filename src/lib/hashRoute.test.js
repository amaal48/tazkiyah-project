// src/lib/hashRoute.test.js — Hash-Adressen (Die Tazkiyah 30, Aktiensuche, Kontakt mit Vorbelegung)

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHash, routes } from "./hashRoute.js";
import { contactPrefill } from "./contact.js";

test("Tazkiyah 30 und Aktiensuche; alte Screener-Adresse führt auf die Tazkiyah 30", () => {
  assert.deepEqual(parseHash("#/tazkiyah-30"), { name: "tazkiyah30" });
  assert.deepEqual(parseHash("#/screener"), { name: "tazkiyah30" });
  assert.deepEqual(parseHash("#/aktien"), { name: "aktien" });
  assert.equal(routes.screener(), routes.tazkiyah30());
  assert.deepEqual(parseHash(routes.aktien()), { name: "aktien" });
});

test("Lernpfad und vereinfachte Methodik haben eigene Adressen", () => {
  assert.deepEqual(parseHash(routes.lernen()), { name: "lernen" });
  assert.deepEqual(parseHash(routes.methodik2()), { name: "methodik2" });
  assert.deepEqual(parseHash(routes.methodik()), { name: "methodik" });
});

test("Detailseite und Sprungmarken wie bisher", () => {
  assert.deepEqual(parseHash("#/aktie/brk-b"), { name: "stock", ticker: "BRK-B" });
  assert.equal(parseHash("#rechtlicher-hinweis"), null);
  assert.deepEqual(parseHash(""), { name: "home" });
});

test("Kontakt mit Vorbelegung über die Adresse", () => {
  assert.deepEqual(parseHash("#/kontakt"), { name: "kontakt", topic: null, ticker: null });
  assert.deepEqual(parseHash(routes.kontakt({ topic: "pruefung", ticker: "aapl" })), { name: "kontakt", topic: "pruefung", ticker: "AAPL" });
  assert.equal(routes.kontakt(), "#/kontakt");
  assert.equal(routes.kontakt({ topic: "fehler" }), "#/kontakt?thema=fehler");
});

test("Vorbelegung des Formulars nutzt nur vorhandene Themen", () => {
  assert.deepEqual(contactPrefill("pruefung", "AAPL"), { topic: "sonstiges", message: "Prüfung gewünscht: AAPL\n\n" });
  assert.equal(contactPrefill("fehler", null).topic, "fehler");
  assert.equal(contactPrefill("unbekannt", "X").topic, "allgemein");
});
