// src/lib/blog.js
//
// Blogbeiträge als Markdown-Dateien (content/blog/<slug>.md, Vorlage: content/blog/_vorlage.md).
// Reine Funktionen ohne Abhängigkeiten, ohne HTML: Die Seite baut aus dem Ergebnis React-Elemente,
// es wird nie Text als HTML eingefügt.
//
// Kopfangaben (zwischen --- und ---): titel, untertitel, datum, aktualisiert, thema, lesezeit (optional,
// sonst aus der Wortzahl), lektion (Nummer der Lektion in der Akademie, z. B. 1.3), quellen (Liste mit „- …“).
//
// Unterstützter Text: Absätze, „## Zwischenüberschrift“, „> Zitat“, Listen („- “ und „1. “),
// **fett**, *kursiv*, [Link](https://… oder #/…), Quellenverweis [^1], Kästen
//   :::kurz Fachbegriff        (Kasten „Kurz erklärt“, optional mit Link)
//   :::einordnung              (Kasten „Einordnung für muslimische Anleger“)
//   :::

export const TOPICS = [
  { key: "maerkte", label: "Märkte & Wirtschaft" },
  { key: "islamisches-finanzwesen", label: "Islamisches Finanzwesen" },
  { key: "erklaert", label: "Erklärt" },
];

const WORDS_PER_MINUTE = 200;

/** Thema aus der Kopfangabe (Schlüssel oder Bezeichnung) → Schlüssel; unbekannt → null. */
export function normalizeTopic(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  const hit = TOPICS.find((t) => t.key === v || t.label.toLowerCase() === v || t.label.toLowerCase().replace(/ & /g, " und ") === v);
  return hit ? hit.key : null;
}

/** „JJJJ-MM-TT“ → „20. Oktober 2026“. */
export function fmtPostDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function topicLabel(key) {
  return TOPICS.find((t) => t.key === key)?.label || "";
}

function unquote(s) {
  const t = s.trim();
  return /^(["']).*\1$/.test(t) ? t.slice(1, -1) : t;
}

/** Kopfangaben und Text trennen. Einfaches Format: „schlüssel: wert“, Listen mit „- “. */
export function parseFrontmatter(source) {
  const text = String(source || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  let listKey = null;
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = line.match(/^\s+-\s+(.*)$/) || (listKey && line.match(/^-\s+(.*)$/));
    if (item && listKey) {
      meta[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([a-zA-ZäöüÄÖÜß_]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    if (kv[2].trim() === "") {
      meta[key] = [];
      listKey = key;
    } else {
      meta[key] = unquote(kv[2]);
      listKey = null;
    }
  }
  return { meta, body: m[2] };
}

/** Wörter im Text (ohne Markdown-Zeichen). */
export function wordCount(body) {
  const plain = String(body || "")
    .replace(/^:::.*$/gm, " ")
    .replace(/\[\^\d+\]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`-]/g, " ");
  return (plain.match(/[\p{L}\p{N}]+/gu) || []).length;
}

/** Lesezeit in Minuten (mindestens 1). */
export function readingMinutes(body) {
  return Math.max(1, Math.round(wordCount(body) / WORDS_PER_MINUTE));
}

/** Erlaubte Linkziele: https/http, mailto und Seiten der Website (#/…). Sonst kein Link. */
export function safeHref(href) {
  const h = String(href || "").trim();
  return /^(https?:\/\/|mailto:|#\/)/i.test(h) ? h : null;
}

/** Zeile in Teile zerlegen: text, strong, em, link, ref. */
export function parseInline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[\^(\d+)\]|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: "strong", text: m[1] });
    else if (m[2] !== undefined) out.push({ type: "em", text: m[2] });
    else if (m[3] !== undefined) out.push({ type: "ref", n: Number(m[3]) });
    else {
      const href = safeHref(m[5]);
      out.push(href ? { type: "link", text: m[4], href } : { type: "text", text: m[4] });
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

// Kästen im Blog; die Akademie (src/lib/lessons.js) nutzt stattdessen „beispiel“
const BLOG_BOXES = ["kurz", "einordnung"];

/** Tabellenzeile „| a | b |“ → Zellen; Trennzeile „|---|---|“ → null. */
function tableCells(line) {
  const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  return cells.every((c) => /^:?-{2,}:?$/.test(c)) ? null : cells;
}

/**
 * Text in Blöcke: p, h2, h3, quote, ul, ol, table, Kästen (kurz, einordnung bzw. options.boxes).
 * options.inline: eigene Zerlegung der Zeilen (Akademie: [[Begriff]]), Standard parseInline.
 * Tabelle: Zeilen „| Bezeichnung | Wert |“; eine Zeile, deren erste Zelle ganz **fett** ist, gilt als Ergebniszeile.
 */
export function parseBody(body, options = {}) {
  const inline = options.inline || parseInline;
  const boxes = options.boxes || BLOG_BOXES;
  const lines = String(body || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", inline: inline(para.join(" ").trim()) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    const box = t.match(/^:::([a-zäöü]+)\s*(.*)$/);
    if (box && boxes.includes(box[1])) {
      flush();
      const inner = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") inner.push(lines[i++]);
      blocks.push({ type: box[1], title: box[2].trim(), blocks: parseBody(inner.join("\n"), options) });
      continue;
    }
    if (!t) {
      flush();
      continue;
    }
    if (t.startsWith("### ")) {
      flush();
      blocks.push({ type: "h3", text: t.slice(4).trim() });
      continue;
    }
    if (t.startsWith("|")) {
      flush();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = tableCells(lines[i++]);
        if (cells) {
          const result = /^\*\*[^*]+\*\*$/.test(cells[0]);
          rows.push({ result, cells: cells.map((c) => inline(result ? c.replace(/^\*\*(.*)\*\*$/, "$1") : c)) });
        }
      }
      i--;
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }
    if (t.startsWith("## ")) {
      flush();
      blocks.push({ type: "h2", text: t.slice(3).trim() });
      continue;
    }
    if (t.startsWith(">")) {
      flush();
      const q = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) q.push(lines[i++].trim().replace(/^>\s?/, ""));
      i--;
      blocks.push({ type: "quote", inline: inline(q.join(" ").trim()) });
      continue;
    }
    const li = t.match(/^(-|\d+\.)\s+(.*)$/);
    if (li) {
      flush();
      const ordered = li[1] !== "-";
      const items = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^(-|\d+\.)\s+(.*)$/);
        if (!m || (m[1] !== "-") !== ordered) break;
        items.push(inline(m[2]));
        i++;
      }
      i--;
      blocks.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }
    para.push(t);
  }
  flush();
  return blocks;
}

/** Quelle als Text, die erste Webadresse darin als Link. */
export function parseSource(text) {
  const m = String(text).match(/https?:\/\/\S+/);
  if (!m) return { text: String(text), url: null };
  const url = m[0].replace(/[.,;)]+$/, "");
  return { text: String(text).replace(m[0], "").replace(/[\s,.;·–-]+$/, "").trim(), url };
}

function isoDate(v) {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Datei → Beitrag. slug aus dem Dateinamen. Gibt null zurück, wenn Pflichtangaben fehlen
 * (titel, datum) oder die Datei mit „_“ beginnt (Vorlagen, Entwürfe).
 */
export function parsePost(slug, source) {
  if (!slug || slug.startsWith("_")) return null;
  const { meta, body } = parseFrontmatter(source);
  const datum = isoDate(meta.datum);
  if (!meta.titel || !datum) return null;
  const lesezeit = Number.parseInt(meta.lesezeit, 10);
  const lektion = String(meta.lektion || "").trim();
  const blocks = parseBody(body);
  const firstP = blocks.find((b) => b.type === "p");
  return {
    slug,
    titel: meta.titel,
    untertitel: meta.untertitel || "",
    datum,
    aktualisiert: isoDate(meta.aktualisiert),
    thema: normalizeTopic(meta.thema),
    lesezeit: lesezeit > 0 ? lesezeit : readingMinutes(body),
    // Nummer einer Lektion der Akademie, z. B. „1.3“ (src/data/lernpfad.js)
    lektion: /^\d\.\d{1,2}$/.test(lektion) ? lektion : null,
    quellen: (Array.isArray(meta.quellen) ? meta.quellen : meta.quellen ? [meta.quellen] : []).map(parseSource),
    blocks,
    // Anriss für Übersichten: Untertitel, sonst der erste Absatz als Text
    anriss: meta.untertitel || (firstP ? firstP.inline.map((p) => p.text || "").join("").slice(0, 220) : ""),
  };
}

/** Dateien { pfad: inhalt } → Beiträge, neueste zuerst. */
export function postsFromFiles(files) {
  return Object.entries(files)
    .map(([path, src]) => parsePost(path.split("/").pop().replace(/\.md$/, ""), src))
    .filter(Boolean)
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : a.slug.localeCompare(b.slug)));
}
