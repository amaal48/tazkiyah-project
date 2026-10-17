// src/lib/neutralWording.test.js — Archiv Tazkiyah 30 (17.10.2026)
//
// Prüft, dass die Texte der Methodik und der Erklärseiten (direkt aus der Prüflogik) bei ausgeschaltetem
// Schalter VITE_FEATURE_TAZKIYAH30 kein Status-Wort mehr enthalten, und dass der Schalter standardmäßig aus ist.

import { test } from "node:test";
import assert from "node:assert/strict";
import { NEUTRAL_REPLACEMENTS, STATUS_WORDS, neutralize } from "./neutralWording.js";
import { FEATURE_TAZKIYAH30 } from "./features.js";
import { DEFAULT_PARAMETERS, EXCLUDED_PRODUCT_TYPES, PRINCIPLE, USER_NOTICES } from "../screening/parameters.js";
import { INDUSTRY_GROUPS, PROHIBITED_INCOME_CATEGORIES } from "../screening/industryRules.js";
import { ETF_STAGE, EXPLANATIONS, STAGES, defaultParameterValues, fillParams } from "../screening/explanations.js";
import { shortExplanation } from "../components/screening/format.js";
import { LEGAL_NOTICE_TEXT, LEGAL_NOTICE_TEXT_ARCHIV } from "../components/screening/legalNoticeText.js";

/** Alle Texte eines Objekts (rekursiv). */
function strings(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

test("Schalter ist ohne Umgebungsvariable aus", () => {
  assert.equal(FEATURE_TAZKIYAH30, false);
  assert.equal(LEGAL_NOTICE_TEXT, LEGAL_NOTICE_TEXT_ARCHIV);
  assert.doesNotMatch(LEGAL_NOTICE_TEXT, STATUS_WORDS);
  assert.doesNotMatch(LEGAL_NOTICE_TEXT, /Tazkiyah 30/);
});

test("Methodik und Erklärseiten: nach neutralize kein Status-Wort", () => {
  const params = defaultParameterValues();
  const texts = [
    ...strings(DEFAULT_PARAMETERS),
    ...strings(EXCLUDED_PRODUCT_TYPES),
    ...strings(USER_NOTICES),
    PRINCIPLE,
    ...strings(INDUSTRY_GROUPS),
    ...strings(PROHIBITED_INCOME_CATEGORIES),
    ...Object.values(EXPLANATIONS).flatMap((e) => [e.name, e.source, ...e.simple.map((t) => fillParams(t, params))]),
    ...[...STAGES, ETF_STAGE].flatMap((s) => [s.title, s.question, ...s.criteria.map((id) => shortExplanation(id))]),
  ].filter((t) => typeof t === "string");
  const left = texts.map((t) => neutralize(t, true)).filter((t) => STATUS_WORDS.test(t));
  assert.deepEqual(left, []);
});

test("Jede Ersetzung wird gebraucht und ist neutral", () => {
  for (const [from, to] of NEUTRAL_REPLACEMENTS) {
    assert.match(from, STATUS_WORDS, from);
    assert.doesNotMatch(to, STATUS_WORDS, to);
  }
});

test("Eingeschaltet bleibt der Text unverändert", () => {
  const t = "Synthetische ETFs (Nachbildung über Swaps) sind nicht konform.";
  assert.equal(neutralize(t, false), t);
  assert.equal(neutralize(t, true), "Synthetische ETFs (Nachbildung über Swaps) erfüllen die Kriterien nicht.");
});
