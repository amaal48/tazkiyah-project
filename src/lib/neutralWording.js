// src/lib/neutralWording.js
//
// Archiv Tazkiyah 30 (17.10.2026): Solange VITE_FEATURE_TAZKIYAH30 aus ist, erscheint öffentlich kein
// Status („konform“, „nicht konform“, „nicht geprüft“). Die Texte der Methodik kommen aber direkt aus der
// Prüflogik (src/screening/parameters.js, explanations.js, industryRules.js) und benutzen diese Wörter.
// Die Prüflogik bleibt unverändert; nur die Anzeige ersetzt die betroffenen Sätze hier wortgenau durch
// eine neutrale Fassung („offen“, „erfüllt die Kriterien nicht“).
//
// Neue Texte mit Status-Wörtern in der Prüflogik fallen im Test auf (neutralWording.test.js).

import { FEATURE_TAZKIYAH30 } from "./features.js";

// [bisher, neutral]; längere Stellen zuerst
export const NEUTRAL_REPLACEMENTS = [
  // src/screening/parameters.js
  ["bleiben B1 und B2 „nicht geprüft“", "bleiben B1 und B2 offen"],
  ["lautet der Status „nicht geprüft“, und", "bleibt die Prüfung offen, und"],
  ["jedes Quartal ohne gesonderten Ausweis als „nicht geprüft“ werten", "jedes Quartal ohne gesonderten Ausweis als offen werten"],
  ["Gemischte oder unklare Segmente → „nicht geprüft“.", "Gemischte oder unklare Segmente → Prüfung offen."],
  ["ohne gültige Prüfung → „nicht geprüft“.", "ohne gültige Prüfung → Prüfung offen."],
  ["Unklar oder ungeprüft → „nicht geprüft“.", "Unklar oder ungeprüft → Prüfung offen."],
  ["Konformität aus der Indexmethodik übernehmen.", "Das Ergebnis der Indexmethodik übernehmen."],
  ["sind nicht konform.", "erfüllen die Kriterien nicht."],
  ["ist er nicht konform.", "erfüllt er die Kriterien nicht."],
  ["darunter „nicht geprüft“.", "darunter bleibt sie offen."],
  ["dass nicht geprüfte Titel keine", "dass Titel ohne Prüfung keine"],
  ["Auch konforme Unternehmen haben", "Auch Unternehmen, die die Kriterien erfüllen, haben"],
  // src/screening/industryRules.js
  ["ohne Prüfung „nicht geprüft“.", "ohne Prüfung bleibt sie offen."],
  ["Ohne Segmentprüfung „nicht geprüft“.", "Ohne Segmentprüfung bleibt die Prüfung offen."],
  // src/screening/explanations.js
  ["bleibt die Aktie auf „nicht geprüft“.", "bleibt die Prüfung offen."],
  ["Der ETF ist nur konform, wenn alle enthaltenen Aktien konform sind.", "Der ETF erfüllt die Kriterien nur, wenn alle enthaltenen Aktien sie erfüllen."],
  ["alle enthaltenen Aktien konform", "alle enthaltenen Aktien erfüllen die Kriterien"],
  // src/components/MethodikPage.jsx
  ["Überschreitet eine davon die Grenze, ist die Aktie nicht konform.", "Überschreitet eine davon die Grenze, erfüllt die Aktie die Kriterien nicht."],
  [
    "Ein ETF ist nur so konform wie die Aktien, die er enthält, und wie er selbst wirtschaftet.",
    "Ein ETF erfüllt die Kriterien nur, wenn die Aktien, die er enthält, sie erfüllen und er selbst entsprechend wirtschaftet.",
  ],
  ["werden nie als konform ausgewiesen", "erfüllen die Kriterien nie"],
  ["Bevor ein Titel als „konform“ gilt, prüfen wir die zitierten Stellen selbst nach.", "Die zitierten Stellen prüfen wir selbst nach."],
  ["bleibt die Prüfung „nicht geprüft“", "bleibt die Prüfung offen"],
  ["lautet der Status „nicht geprüft“, bis", "bleibt die Prüfung offen, bis"],
  ["sonst steht sie auf „nicht geprüft“, nie auf „nicht konform“.", "sonst bleibt sie offen; als nicht bestanden gilt sie dadurch nie."],
];

/** Neutrale Fassung eines Textes (nur wenn die Tazkiyah 30 aus sind; sonst unverändert). */
export function neutralize(text, enabled = !FEATURE_TAZKIYAH30) {
  if (!enabled || typeof text !== "string") return text;
  let out = text;
  for (const [from, to] of NEUTRAL_REPLACEMENTS) if (out.includes(from)) out = out.split(from).join(to);
  return out;
}

/** Status-Wörter, die öffentlich nicht erscheinen dürfen, solange die Tazkiyah 30 archiviert sind. */
export const STATUS_WORDS = /konform|nicht geprüft|nicht geprueft|halal-status/i;
