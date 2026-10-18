// src/lib/lessons.test.js — Akademie: Lernpfad-Daten, Lektionsdateien (content/lernen), Quiz, Glossar,
// Reihenfolge (akademie.js) und Fortschritt im Browser (akademieProgress.js)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { LESSONS, STUFEN, lessonsOfStufe } from "../data/lernpfad.js";
import { findGlossar } from "../data/glossar.js";
import { glossaryTerms, parseLesson, parseLessonInline, parseQuiz, validateLesson } from "./lessons.js";
import { entryTarget, firstOfStufe, isLastOfStufe, nextLesson, prevLesson, resumeLesson, stufeProgress } from "./akademie.js";
import { LAST_KEY, READ_KEY, markRead, readProgress, setLast } from "./akademieProgress.js";

const DIR = new URL("../../content/lernen/", import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
const read = (f) => readFileSync(new URL(f, DIR), "utf8");

test("Lernpfad: drei Stufen, 25 Lektionen, Nummern und slugs passen", () => {
  assert.deepEqual(STUFEN.map((s) => s.name), ["Grundlagen", "Einsteigen", "Fortgeschritten"]);
  assert.equal(LESSONS.length, 25);
  assert.deepEqual([1, 2, 3].map((n) => lessonsOfStufe(n).length), [7, 10, 8]);
  assert.equal(new Set(LESSONS.map((l) => l.slug)).size, 25);
  for (const l of LESSONS) {
    assert.match(l.nr, /^[1-3]\.\d{1,2}$/);
    assert.equal(l.slug, l.nr.replace(".", "-"));
    assert.equal(l.stufe, Number(l.nr[0]));
    assert.ok(l.title && l.text, l.nr);
  }
  assert.equal(LESSONS.find((l) => l.nr === "2.10").slug, "2-10");
  assert.deepEqual(LESSONS.filter((l) => l.islamisch).map((l) => l.nr), ["1.2", "1.3", "1.7", "2.2", "2.7", "2.10", "3.3", "3.4", "3.5", "3.6", "3.7"]);
});

const SAMPLE = `---
aktualisiert: 2026-10-18
abschluss: Geschafft.
---
## Kurz erklärt

Eine [[Aktie]] ist ein Anteil. Mit Text: [[Anleihe|Anleihen]].

## Erklärung

Absatz.[^1]

### Teil

:::beispiel Rechnung
| Kurs | 100 € |
| **Summe** | **100 €** |
:::

## Islamischer Blick

Text.

## Häufige Fehler

- Fehler eins

## Merke

1. eins
2. zwei
3. drei

## Quiz

### Frage: Was ist richtig?
- [ ] A
- [x] B
- [ ] C
> Erklärung: Weil B.

### Frage: Zweite?
- [x] Ja
- [ ] Nein

## Quellen

1. SEC, Form 10-K, https://www.sec.gov/x
`;

test("Lektion: Abschnitte, Beispielkasten, Merke, Quiz, Quellen", () => {
  const l = parseLesson("1-3", SAMPLE);
  assert.equal(l.aktualisiert, "2026-10-18");
  assert.equal(l.abschluss, "Geschafft.");
  assert.ok(l.kurz && l.erklaerung && l.islamisch && l.fehler);
  assert.deepEqual(l.erklaerung.map((b) => b.type), ["p", "h3", "beispiel"]);
  assert.equal(l.erklaerung[2].title, "Rechnung");
  assert.equal(l.erklaerung[2].blocks[0].type, "table");
  assert.equal(l.erklaerung[2].blocks[0].rows[1].result, true);
  assert.equal(l.merke.length, 3);
  assert.equal(l.quiz.length, 2);
  assert.deepEqual(l.quiz[0].antworten.map((a) => a.richtig), [false, true, false]);
  assert.equal(l.quiz[0].erklaerung, "Weil B.");
  assert.deepEqual(l.quellen[0], { text: "SEC, Form 10-K", url: "https://www.sec.gov/x" });
  assert.deepEqual(validateLesson(l), []);
  assert.equal(l.toc, false);
});

test("Glossar-Verweise [[Begriff]] und [[Begriff|Text]]", () => {
  assert.deepEqual(parseLessonInline("Eine [[Aktie]] und **fett**"), [
    { type: "text", text: "Eine " },
    { type: "glossar", term: "Aktie", text: "Aktie" },
    { type: "text", text: " und " },
    { type: "strong", text: "fett" },
  ]);
  assert.deepEqual(parseLessonInline("[[Anleihe|Anleihen]]")[0], { type: "glossar", term: "Anleihe", text: "Anleihen" });
  assert.deepEqual(glossaryTerms(parseLesson("x", SAMPLE)), ["Aktie", "Anleihe"]);
  assert.equal(findGlossar("anleihe").term, "Anleihe (Bond)");
  assert.equal(findGlossar("Gibt es nicht"), null);
});

test("Prüfung: fehlende Pflichtabschnitte und ungültiges Quiz fallen auf", () => {
  const bad = parseLesson("x", "---\naktualisiert: 2026-10-18\n---\n## Erklärung\n\nText\n\n## Quiz\n\n### Frage: ?\n- [x] A\n- [x] B\n\n## Ausblick\n\nx");
  const errors = validateLesson(bad);
  assert.ok(errors.some((e) => e.includes("Kurz erklärt")));
  assert.ok(errors.some((e) => e.includes("Merke")));
  assert.ok(errors.some((e) => e.includes("genau eine richtige")));
  assert.ok(errors.some((e) => e.includes("## Ausblick")));
  assert.ok(validateLesson(parseLesson("x", "## Kurz erklärt\n\nx")).some((e) => e.includes("aktualisiert")));
});

test("Quiz-Syntax: Frage ohne „Frage:“, mehrzeilige Erklärung", () => {
  const q = parseQuiz("### Wie viel?\n- [ ] 1\n- [X] 2\n> Erklärung: Erste Zeile\n> zweite Zeile");
  assert.equal(q[0].frage, "Wie viel?");
  assert.equal(q[0].antworten[1].richtig, true);
  assert.equal(q[0].erklaerung, "Erste Zeile zweite Zeile");
});

test("Vorlage _vorlage.md ist vollständig und erscheint nicht", () => {
  const src = read("_vorlage.md");
  assert.equal(parseLesson("_vorlage", src), null);
  const l = parseLesson("_vorlage", src, { includeDrafts: true });
  assert.deepEqual(validateLesson(l), []);
  assert.ok(l.islamisch && l.fehler && l.quellen);
  assert.ok(l.erklaerung.some((b) => b.type === "beispiel"));
  for (const t of glossaryTerms(l)) assert.ok(findGlossar(t), `Glossar-Begriff unbekannt: ${t}`);
});

test("Jede Lektionsdatei: gültiger Name, Pflichtabschnitte, Quiz mit genau einer [x]", (t) => {
  const lessons = files.filter((f) => !f.startsWith("_"));
  if (!lessons.length) t.diagnostic("Noch keine Lektionsdatei in content/lernen/ (alle Lektionen „folgt“).");
  for (const f of lessons) {
    const slug = f.replace(/\.md$/, "");
    assert.ok(LESSONS.some((l) => l.slug === slug), `${f}: keine Lektion mit diesem slug in src/data/lernpfad.js`);
    const errors = validateLesson(parseLesson(slug, read(f)));
    assert.deepEqual(errors, [], `${f}: ${errors.join("; ")}`);
    // Unbekannte Glossar-Begriffe: Warnung, kein Fehler (erscheinen als normaler Text)
    for (const term of glossaryTerms(parseLesson(slug, read(f)))) if (!findGlossar(term)) t.diagnostic(`Warnung ${f}: Glossar-Begriff „${term}“ unbekannt, erscheint als normaler Text`);
  }
});

const only = (...slugs) => (s) => slugs.includes(s);

test("Reihenfolge: nächste und vorherige Lektion über Stufengrenzen", () => {
  const all = () => true;
  assert.equal(nextLesson("1-7", all).slug, "2-1");
  assert.equal(prevLesson("2-1", all).slug, "1-7");
  assert.equal(nextLesson("2-10", all).slug, "3-1");
  assert.equal(nextLesson("3-8", all), null);
  assert.equal(prevLesson("1-1", all), null);
  assert.equal(nextLesson("1-3", only("1-3", "2-2")).slug, "2-2");
  assert.equal(prevLesson("2-2", only("1-3", "2-2")).slug, "1-3");
  assert.equal(firstOfStufe(2, only("2-3")).slug, "2-3");
  assert.ok(isLastOfStufe(LESSONS.find((l) => l.slug === "1-7")));
  assert.ok(!isLastOfStufe(LESSONS.find((l) => l.slug === "2-9")));
  assert.deepEqual(stufeProgress(1, new Set(["1-1", "1-2", "2-1"])), { read: 2, total: 7 });
});

test("Weiter, wo du warst und „Wo stehst du?“", () => {
  const open = only("1-1", "1-3", "1-7", "2-1");
  assert.equal(resumeLesson({ read: new Set(), last: null }, open), null);
  assert.equal(resumeLesson({ read: new Set(), last: "1-3" }, open).slug, "1-3");
  assert.equal(resumeLesson({ read: new Set(["1-3"]), last: "1-3" }, open).slug, "1-7");
  assert.equal(resumeLesson({ read: new Set(["1-1", "1-3", "1-7", "2-1"]), last: "2-1" }, open), null);
  assert.equal(resumeLesson({ read: new Set(["1-3", "1-7", "2-1"]), last: "2-1" }, open).slug, "1-1");
  assert.equal(entryTarget("1-1", open).lesson.slug, "1-1");
  assert.deepEqual(entryTarget("3-3", open), { stufe: 3 });
});

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test("Fortschritt: speichern, lesen, ungültige Werte und gesperrter Speicher", () => {
  const s = memoryStore();
  markRead("1-3", s);
  markRead("1-3", s);
  setLast("1-7", s);
  assert.deepEqual([...readProgress(s).read], ["1-3"]);
  assert.equal(readProgress(s).last, "1-7");
  assert.equal(s.m.get(READ_KEY), '["1-3"]');
  assert.equal(s.m.get(LAST_KEY), "1-7");

  s.setItem(READ_KEY, "kein json");
  assert.equal(readProgress(s).read.size, 0);
  s.setItem(READ_KEY, '["1-1", 5, "<script>"]');
  assert.deepEqual([...readProgress(s).read], ["1-1"]);

  const locked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } };
  assert.deepEqual(readProgress(locked), { read: new Set(), last: null });
  assert.doesNotThrow(() => markRead("1-1", locked));
  assert.doesNotThrow(() => setLast("1-1", locked));
});
