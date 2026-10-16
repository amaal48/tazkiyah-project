// src/lib/weeklyDraft.test.js — „Entwurf einfügen“: Aufteilung eines Entwurfs aus Notion

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { parseDraft, parseRange, parseSourceLine } from "./weeklyDraft.js";
import { findGaps } from "./weeklyReport.js";

const SAMPLE = readFileSync(new URL("./fixtures/wochenbericht-beispiel.md", import.meta.url), "utf8");

test("Titel, KW und Zeitraum; Vorspann wird nicht übernommen", () => {
  const d = parseDraft(SAMPLE);
  assert.equal(d.titel, "Teure Energie, ruhige Märkte");
  assert.equal(d.kw, 42);
  assert.equal(d.jahr, 2026);
  assert.equal(d.zeitraum_von, "2026-10-12");
  assert.equal(d.zeitraum_bis, "2026-10-16");
  assert.match(d.ignoriert.vorspann, /Hinweiskasten/);
  assert.match(d.ignoriert.vorspann, /Wochenschluss DAX/);
  assert.doesNotMatch(d.body_md, /Hinweiskasten|Offene Stellen|Vorlage und Beispiel/);
});

test("Drei Sätze, Fließtext mit Zwischenüberschriften, Einordnung", () => {
  const d = parseDraft(SAMPLE);
  assert.equal(d.drei_saetze, "Satz eins. Satz zwei. Satz drei.");
  assert.match(d.body_md, /^## Eine Woche im Zeichen der Inflation\nErster Absatz/);
  assert.match(d.body_md, /## Aus den Tazkiyah 30/);
  assert.doesNotMatch(d.body_md, /Einordnung für muslimische Anleger/);
  assert.equal(d.einordnung, "Steigende Zinsen haben eine besondere Seite.\nEine Prüfung gilt nie dauerhaft.");
});

test("Quellen nummeriert, Links erkannt, Lücken bleiben", () => {
  const d = parseDraft(SAMPLE);
  assert.deepEqual(d.quellen, [
    { nr: 1, titel: "U.S. Bureau of Labor Statistics, Verbraucherpreise September 2026 (14.10.2026)", url: null },
    { nr: 2, titel: "Eurostat, Inflation (16.10.2026)", url: "https://ec.europa.eu/eurostat/x" },
    { nr: 3, titel: "IWF, World Economic Outlook [Links ergänzen]", url: null },
  ]);
});

test("Nichts wird verworfen: Unbekanntes bleibt im Fließtext, Hinweis und Mail erkannt", () => {
  const d = parseDraft(SAMPLE);
  assert.match(d.body_md, /Ein unbekannter Absatz am Ende\./);
  assert.match(d.ignoriert.hinweis, /^\*Hinweis: Dieser Bericht/);
  assert.match(d.mail_kurzfassung, /^Betreff: Wochenbericht KW 42/);
  assert.deepEqual(d.warnungen, []);
});

test("Lücken im eingefügten Entwurf", () => {
  const gaps = findGaps(parseDraft(SAMPLE));
  assert.deepEqual(gaps.map((g) => g.text), ["[Wert prüfen.]", "[Absatz zum islamischen Finanzwesen ergänzen.]", "[Links ergänzen]"]);
});

test("Zeitraum: Wortmonat, Monatswechsel, Zahlenform", () => {
  assert.deepEqual(parseRange("KW 40 · 28. September bis 2. Oktober 2026"), { von: "2026-09-28", bis: "2026-10-02" });
  assert.deepEqual(parseRange("12.–16.10.2026"), { von: "2026-10-12", bis: "2026-10-16" });
  assert.deepEqual(parseRange("29.12.2025 bis 02.01.2026"), { von: "2025-12-29", bis: "2026-01-02" });
  assert.equal(parseRange("ohne Datum"), null);
});

test("Ohne Zeitraum: aus der KW berechnet, mit Hinweis; ohne Titel: Warnung", () => {
  const d = parseDraft("# Titel\n*Wochenbericht KW 43 · 2026*\n\n## Das Wichtigste in drei Sätzen\nA.");
  assert.equal(d.zeitraum_von, "2026-10-19");
  assert.equal(d.zeitraum_bis, "2026-10-23");
  assert.ok(d.warnungen.some((w) => /aus der KW berechnet/.test(w)));
  assert.ok(parseDraft("Nur Text").warnungen.some((w) => /Kein Titel/.test(w)));
  assert.equal(parseDraft("Nur Text").body_md, "Nur Text");
});

test("Quellenzeile mit Gedankenstrich und Link", () => {
  assert.deepEqual(parseSourceLine("4. TSMC, Ergebnisbericht Q3 2026, Form 6-K – https://www.sec.gov/a.htm", 4), {
    nr: 4,
    titel: "TSMC, Ergebnisbericht Q3 2026, Form 6-K",
    url: "https://www.sec.gov/a.htm",
  });
});

// Die echte Vorlage liegt nur lokal (nicht im Repository); fehlt sie, wird der Test übersprungen.
const REAL = `${homedir()}/Downloads/wochenbericht-vorlage-kw42.md`;
test("Vorlage KW 42 aus Downloads (falls vorhanden)", { skip: !existsSync(REAL) }, () => {
  const d = parseDraft(readFileSync(REAL, "utf8"));
  assert.equal(d.titel, "Teure Energie, nervöse Chipmärkte, Rekordzahlen");
  assert.equal(d.kw, 42);
  assert.equal(d.zeitraum_von, "2026-10-12");
  assert.equal(d.zeitraum_bis, "2026-10-16");
  assert.match(d.drei_saetze, /^Die Energiepreise treiben/);
  assert.equal((d.body_md.match(/^## /gm) || []).length, 8);
  assert.match(d.einordnung, /^Steigende Zinsen haben/);
  assert.equal(d.quellen.length, 11);
  assert.equal(d.quellen[1].url, "https://ec.europa.eu/eurostat/en/web/products-euro-indicators/w/2-16102026-ap");
  assert.match(d.mail_kurzfassung, /^Betreff: Wochenbericht KW 42/);
  assert.match(d.ignoriert.vorspann, /Regeln für jede Ausgabe/);
  assert.deepEqual(d.warnungen, []);
});
