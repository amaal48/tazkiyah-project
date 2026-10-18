// src/lib/lessons.js
//
// Lektionen der Akademie als Markdown-Dateien (content/lernen/<slug>.md, Vorlage content/lernen/_vorlage.md).
// Reine Funktionen ohne Abhängigkeiten von Vite oder React (getestet in lessons.test.js). Es wird nie Text als
// HTML eingefügt; Links nur https, mailto oder Seiten der Website (safeHref in blog.js).
//
// Kopfangaben: aktualisiert (Pflicht, JJJJ-MM-TT), lesezeit (optional, sonst 200 Wörter je Minute),
// inhalt (optional, true = Spalte „Auf dieser Seite“ auch bei kurzen Lektionen), abschluss (optional, Satz im
// Kasten „Stufe n abgeschlossen“, nur bei der letzten Lektion einer Stufe).
// Abschnitte über feste „## “-Überschriften (SECTION_NAMES). Im Text: „### “ Zwischenüberschrift,
// :::beispiel … ::: Kasten „Beispiel“ (mit optionaler Rechentabelle), [[Begriff]] bzw. [[Begriff|Text]] Glossar.
// Quiz: „### Frage: …“, Antworten „- [ ] …“ / „- [x] …“ (genau eine richtig), „> Erklärung: …“.

import { parseBody, parseFrontmatter, parseInline, parseSource, readingMinutes, wordCount } from "./blog.js";

/** Feste Abschnitte in dieser Reihenfolge: Schlüssel, Überschrift, weitere erlaubte Schreibweisen. */
export const SECTIONS = [
  { key: "kurz", title: "Kurz erklärt", aliases: [] },
  { key: "erklaerung", title: "Erklärung", aliases: [] },
  { key: "islamisch", title: "Islamischer Blick", aliases: [] },
  { key: "fehler", title: "Häufige Fehler", aliases: [] },
  { key: "merke", title: "Merke", aliases: [] },
  { key: "quiz", title: "Kurzes Quiz", aliases: ["quiz"] },
  { key: "quellen", title: "Quellen", aliases: [] },
];

export const REQUIRED_SECTIONS = ["kurz", "erklaerung", "merke"];

/** Ab dieser Länge erscheint „Auf dieser Seite“ (sonst nur mit inhalt: true). */
export const TOC_MIN_WORDS = 1200;

const sectionKey = (title) => {
  const t = title.trim().toLowerCase();
  return SECTIONS.find((s) => s.title.toLowerCase() === t || s.aliases.includes(t))?.key || null;
};

/** Zeile zerlegen wie im Blog, dazu [[Begriff]] und [[Begriff|angezeigter Text]] als Glossar-Verweis. */
export function parseLessonInline(text) {
  const out = [];
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...parseInline(text.slice(last, m.index)));
    out.push({ type: "glossar", term: m[1].trim(), text: (m[2] || m[1]).trim() });
    last = re.lastIndex;
  }
  if (last < text.length) out.push(...parseInline(text.slice(last)));
  return out;
}

const OPTIONS = { inline: parseLessonInline, boxes: ["beispiel"] };

/** Quiz-Abschnitt → [{ frage, antworten: [{ text, richtig }], erklaerung }] */
export function parseQuiz(text) {
  const fragen = [];
  let cur = null;
  for (const raw of String(text || "").split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    const q = t.match(/^###\s+(?:Frage:\s*)?(.+)$/);
    if (q) {
      cur = { frage: q[1].trim(), antworten: [], erklaerung: "" };
      fragen.push(cur);
      continue;
    }
    if (!cur) continue;
    const a = t.match(/^-\s+\[( |x|X)\]\s+(.+)$/);
    if (a) {
      cur.antworten.push({ text: a[2].trim(), richtig: a[1].toLowerCase() === "x" });
      continue;
    }
    const e = t.match(/^>\s?(?:Erklärung:\s*)?(.*)$/);
    if (e) cur.erklaerung = (cur.erklaerung ? cur.erklaerung + " " : "") + e[1].trim();
  }
  return fragen;
}

/** Text in die festen Abschnitte teilen. Unbekannte „## “ bleiben als Zwischenüberschrift im laufenden Abschnitt. */
function splitSections(body) {
  const parts = {};
  const unknown = [];
  let key = null;
  let buf = [];
  const flush = () => {
    if (key) parts[key] = (parts[key] ? parts[key] + "\n" : "") + buf.join("\n");
    buf = [];
  };
  for (const line of String(body || "").split("\n")) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h && !line.startsWith("###")) {
      const k = sectionKey(h[1]);
      if (k) {
        flush();
        key = k;
        continue;
      }
      unknown.push(h[1]);
      buf.push(`### ${h[1]}`);
      continue;
    }
    buf.push(line);
  }
  flush();
  return { parts, unknown };
}

function isoDate(v) {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Datei → Lektion (Inhalt). null für Dateien mit „_“ (Vorlage) oder ohne Slug. */
export function parseLesson(slug, source, { includeDrafts = false } = {}) {
  if (!slug || (slug.startsWith("_") && !includeDrafts)) return null;
  const { meta, body } = parseFrontmatter(source);
  const { parts, unknown } = splitSections(body);
  const blocks = (k) => (parts[k] !== undefined && parts[k].trim() ? parseBody(parts[k], OPTIONS) : null);
  const listItems = (k) => (blocks(k) || []).flatMap((b) => (b.type === "ol" || b.type === "ul" ? b.items : [b.inline]).filter(Boolean));
  const lesezeit = Number.parseInt(meta.lesezeit, 10);
  const words = wordCount(body);
  return {
    slug,
    aktualisiert: isoDate(meta.aktualisiert),
    lesezeit: lesezeit > 0 ? lesezeit : readingMinutes(body),
    words,
    toc: String(meta.inhalt).trim() === "true" || words >= TOC_MIN_WORDS,
    abschluss: meta.abschluss || "",
    kurz: blocks("kurz"),
    erklaerung: blocks("erklaerung"),
    islamisch: blocks("islamisch"),
    fehler: blocks("fehler"),
    merke: parts.merke !== undefined && parts.merke.trim() ? listItems("merke") : null,
    quiz: parts.quiz !== undefined && parts.quiz.trim() ? parseQuiz(parts.quiz) : null,
    quellen:
      parts.quellen !== undefined && parts.quellen.trim()
        ? String(parts.quellen)
            .split("\n")
            .map((l) => l.trim().match(/^(?:-|\d+\.)\s+(.+)$/))
            .filter(Boolean)
            .map((m) => parseSource(m[1]))
        : null,
    unknownHeadings: unknown,
  };
}

/** Prüfung einer Lektionsdatei: Liste der Fehler (leer = in Ordnung). */
export function validateLesson(lesson) {
  const errors = [];
  if (!lesson) return ["Datei nicht lesbar"];
  if (!lesson.aktualisiert) errors.push("Kopfangabe „aktualisiert“ fehlt oder ist kein Datum (JJJJ-MM-TT)");
  for (const k of REQUIRED_SECTIONS) if (!lesson[k] || (Array.isArray(lesson[k]) && !lesson[k].length)) errors.push(`Abschnitt „${SECTIONS.find((s) => s.key === k).title}“ fehlt`);
  if (!lesson.quiz || !lesson.quiz.length) errors.push("Abschnitt „Quiz“ fehlt oder hat keine Frage");
  for (const [i, f] of (lesson.quiz || []).entries()) {
    const n = f.antworten.filter((a) => a.richtig).length;
    if (f.antworten.length < 2 || f.antworten.length > 4) errors.push(`Quiz, Frage ${i + 1}: 2 bis 4 Antworten nötig (${f.antworten.length})`);
    if (n !== 1) errors.push(`Quiz, Frage ${i + 1}: genau eine richtige Antwort [x] nötig (${n})`);
  }
  for (const h of lesson.unknownHeadings) errors.push(`Unbekannte Überschrift „## ${h}“ (erlaubt: ${SECTIONS.map((s) => s.title).join(", ")}; im Text „### “)`);
  return errors;
}

/** Alle Glossar-Begriffe ([[…]]) einer Lektion. */
export function glossaryTerms(lesson) {
  const terms = [];
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if (v.type === "glossar") terms.push(v.term);
      else Object.values(v).forEach(walk);
    }
  };
  walk(lesson);
  return terms;
}

/** Dateien { pfad: inhalt } → Map slug → Lektion (ohne „_“-Dateien). */
export function lessonsFromFiles(files) {
  const map = new Map();
  for (const [path, src] of Object.entries(files)) {
    const slug = path.split("/").pop().replace(/\.md$/, "");
    const lesson = parseLesson(slug, src);
    if (lesson) map.set(slug, lesson);
  }
  return map;
}
