// src/lib/weeklyDraft.js
//
// „Entwurf einfügen“: den kompletten Entwurf aus Notion (Markdown, Aufbau wie wochenbericht-vorlage-kw42.md)
// in die Felder von weekly_reports aufteilen. Reine Funktion, getestet in weeklyDraft.test.js.
//
//   # Titel                                   → titel
//   *Wochenbericht KW 42 · 12. bis 16. Oktober 2026 · …*   → kw, jahr, zeitraum_von, zeitraum_bis
//   ## Das Wichtigste in drei Sätzen          → drei_saetze
//   ## <weitere Abschnitte>                   → body_md (mit den ##-Überschriften)
//   > **Einordnung für muslimische Anleger**  → einordnung (auch als ## Abschnitt oder :::einordnung)
//   ## Quellen  (1. … – https://…)            → quellen [{ nr, titel, url }]
//   ## Mail-Kurzfassung                       → mail_kurzfassung
//
// Alles vor dem Titel (Hinweiskasten, Regeln, Liste offener Stellen) wird nicht übernommen, aber angezeigt.
// Der Standard-Hinweis („Hinweis: Dieser Bericht …“) steht auf der Website fest und wird nicht übernommen.
// Alles, was nicht erkannt wird, bleibt im Fließtext — es wird nie etwas verworfen.

import { isoWeek, weekRange } from "./weeklyReport.js";

const MONTHS = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8,
  september: 9, oktober: 10, november: 11, dezember: 12,
};

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const valid = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** Zeitraum aus der Zeile unter dem Titel. */
export function parseRange(line) {
  const s = String(line || "");
  const word = s.match(/(\d{1,2})\.\s*(?:([A-Za-zÄÖÜäöü]+)\s*)?(?:(\d{4})\s*)?(?:bis|–|—|-)\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4})/);
  if (word) {
    const m2 = MONTHS[word[5].toLowerCase()];
    const m1 = word[2] ? MONTHS[word[2].toLowerCase()] : m2;
    const y2 = Number(word[6]);
    const y1 = word[3] ? Number(word[3]) : m1 > m2 ? y2 - 1 : y2;
    if (m1 && m2 && valid(y1, m1, +word[1]) && valid(y2, m2, +word[4])) return { von: iso(y1, m1, +word[1]), bis: iso(y2, m2, +word[4]) };
  }
  const num = s.match(/(\d{1,2})\.(?:(\d{1,2})\.)?(?:(\d{4}))?\s*(?:bis|–|—|-)\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (num) {
    const y2 = Number(num[6]);
    const m2 = Number(num[5]);
    const m1 = num[2] ? Number(num[2]) : m2;
    const y1 = num[3] ? Number(num[3]) : m1 > m2 ? y2 - 1 : y2;
    if (valid(y1, m1, +num[1]) && valid(y2, m2, +num[4])) return { von: iso(y1, m1, +num[1]), bis: iso(y2, m2, +num[4]) };
  }
  return null;
}

/** Quellenzeile „1. Titel – https://…“ → { nr, titel, url } */
export function parseSourceLine(line, fallbackNr) {
  const m = String(line).match(/^\s*(\d+)[.)]\s+(.*)$/);
  const nr = m ? Number(m[1]) : fallbackNr;
  let text = (m ? m[2] : String(line)).trim();
  const urls = text.match(/https?:\/\/[^\s)\]]+/g);
  let url = null;
  if (urls) {
    url = urls[urls.length - 1].replace(/[.,;]+$/, "");
    text = text.replace(urls[urls.length - 1], "").replace(/[\s–—,:-]+$/, "").trim();
  }
  return { nr, titel: text, url };
}

const isHeading = (l) => /^##\s+/.test(l);
const headingText = (l) => l.replace(/^##\s+/, "").trim();
const KIND = [
  ["drei", /^das wichtigste in drei sätzen/i],
  ["einordnung", /^einordnung für muslimische anleger/i],
  ["quellen", /^quellen\b/i],
  ["mail", /^mail-?kurzfassung/i],
  ["hinweis", /^hinweis\b/i],
];
const kindOf = (h) => KIND.find(([, re]) => re.test(h))?.[0] || "body";
const isNotice = (para) => /^[*_\s]*hinweis:/i.test(para.trim());
const trimLines = (arr) => arr.join("\n").replace(/^\s+|\s+$/g, "");

/** Absätze einer Zeilenliste (durch Leerzeilen getrennt), Zeilen bleiben erhalten. */
function paragraphs(lines) {
  const out = [];
  let cur = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Einordnung als Zitatblock („> **Einordnung für muslimische Anleger**“) oder :::einordnung aus Zeilen lösen. */
function extractEinordnung(lines) {
  const rest = [];
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^>\s*\**\s*einordnung für muslimische anleger/i.test(l)) {
      const q = [];
      i++;
      while (i < lines.length && /^>/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      i--;
      found.push(trimLines(q));
      continue;
    }
    if (/^:::einordnung\b/i.test(l.trim())) {
      const q = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") q.push(lines[i++]);
      found.push(trimLines(q));
      continue;
    }
    rest.push(l);
  }
  return { rest, einordnung: found.filter(Boolean).join("\n\n") };
}

export function parseDraft(markdown) {
  const lines = String(markdown || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const warnungen = [];

  // Titel: die erste „# …“-Zeile, unter der eine Zeile mit „KW“ steht; sonst die letzte „# …“-Zeile
  const h1 = lines.map((l, i) => (/^#\s+/.test(l) ? i : -1)).filter((i) => i >= 0);
  const nextText = (i) => {
    for (let k = i + 1; k < lines.length; k++) if (lines[k].trim()) return k;
    return -1;
  };
  let titleIdx = h1.find((i) => {
    const k = nextText(i);
    return k >= 0 && /\bKW\s*\d{1,2}\b/i.test(lines[k]);
  });
  if (titleIdx === undefined) titleIdx = h1.length ? h1[h1.length - 1] : -1;
  if (titleIdx < 0) warnungen.push("Kein Titel (# …) gefunden.");

  const vorspann = titleIdx > 0 ? trimLines(lines.slice(0, titleIdx)) : "";
  const titel = titleIdx >= 0 ? lines[titleIdx].replace(/^#\s+/, "").trim() : "";

  // Zeile unter dem Titel: KW und Zeitraum
  let start = titleIdx + 1;
  let kw = null;
  let range = null;
  let metaLine = "";
  const k = titleIdx >= 0 ? nextText(titleIdx) : -1;
  if (k >= 0 && !isHeading(lines[k]) && /\bKW\s*\d{1,2}\b|\d{1,2}\.\s*(?:bis|–|-)/i.test(lines[k])) {
    metaLine = lines[k];
    start = k + 1;
    const kwm = metaLine.match(/\bKW\s*(\d{1,2})\b/i);
    if (kwm) kw = Number(kwm[1]);
    range = parseRange(metaLine);
  }
  let jahr = range ? Number(range.bis.slice(0, 4)) : Number(metaLine.match(/\b(20\d{2})\b/)?.[1]) || null;
  if (range && !kw) kw = isoWeek(range.von).week;
  if (range && kw && isoWeek(range.von).week !== kw) warnungen.push(`KW ${kw} passt nicht zum Zeitraum (laut Datum KW ${isoWeek(range.von).week}).`);
  if (range) jahr = isoWeek(range.von).year;
  if (!range && kw && jahr) {
    const r = weekRange(jahr, kw);
    range = { von: r.von, bis: r.bis };
    warnungen.push("Zeitraum nicht erkannt, aus der KW berechnet (Montag bis Freitag).");
  }
  if (!kw) warnungen.push("Kalenderwoche nicht erkannt.");

  // Abschnitte
  const sections = [];
  let cur = { heading: null, lines: [] };
  for (const l of lines.slice(start)) {
    if (/^#\s+/.test(l)) {
      // weitere „# …“-Zeilen nach dem Titel: als Text behalten (nie verwerfen)
      cur.lines.push(l.replace(/^#\s+/, "## "));
      continue;
    }
    if (isHeading(l)) {
      sections.push(cur);
      cur = { heading: headingText(l), lines: [] };
    } else if (l.trim() === "---") {
      continue; // Trennlinie
    } else cur.lines.push(l);
  }
  sections.push(cur);

  let drei = [];
  let einordnung = [];
  const quellen = [];
  let mail = [];
  const hinweis = [];
  const body = [];

  for (const s of sections) {
    const kind = s.heading === null ? "body" : kindOf(s.heading);
    if (kind === "drei") drei.push(trimLines(s.lines));
    else if (kind === "einordnung") einordnung.push(trimLines(s.lines.map((l) => l.replace(/^>\s?/, ""))));
    else if (kind === "mail") mail.push(trimLines(s.lines));
    else if (kind === "hinweis") hinweis.push(trimLines(s.lines));
    else if (kind === "quellen") {
      const extra = [];
      for (const para of paragraphs(s.lines)) {
        const text = para.join("\n");
        if (isNotice(text)) {
          hinweis.push(text.trim());
          continue;
        }
        const numbered = para.filter((l) => /^\s*\d+[.)]\s+/.test(l));
        if (numbered.length === 0) {
          extra.push(text);
          continue;
        }
        for (const l of para) {
          if (/^\s*\d+[.)]\s+/.test(l)) quellen.push(parseSourceLine(l, quellen.length + 1));
          else if (quellen.length) {
            const add = parseSourceLine(l, quellen.length);
            const last = quellen[quellen.length - 1];
            last.titel = `${last.titel} ${add.titel}`.trim();
            if (!last.url && add.url) last.url = add.url;
          } else extra.push(l);
        }
      }
      if (extra.length) body.push({ heading: null, lines: extra.join("\n\n").split("\n") });
    } else {
      const { rest, einordnung: e } = extractEinordnung(s.lines);
      if (e) einordnung.push(e);
      // Standard-Hinweis im Fließtext erkennen
      const kept = [];
      for (const para of paragraphs(rest)) {
        const text = para.join("\n");
        if (isNotice(text)) hinweis.push(text.trim());
        else kept.push(text);
      }
      if (s.heading !== null || kept.length) body.push({ heading: s.heading, lines: kept.join("\n\n").split("\n") });
    }
  }

  const body_md = body
    .map((b) => (b.heading ? `## ${b.heading}\n${trimLines(b.lines)}` : trimLines(b.lines)))
    .filter((t) => t.trim())
    .join("\n\n");

  if (!drei.join("").trim()) warnungen.push("„Das Wichtigste in drei Sätzen“ nicht gefunden.");
  if (!einordnung.join("").trim()) warnungen.push("„Einordnung für muslimische Anleger“ nicht gefunden.");
  if (!quellen.length) warnungen.push("Keine nummerierten Quellen gefunden.");

  return {
    titel,
    jahr,
    kw,
    zeitraum_von: range?.von || null,
    zeitraum_bis: range?.bis || null,
    drei_saetze: drei.filter(Boolean).join("\n\n"),
    body_md,
    einordnung: einordnung.filter(Boolean).join("\n\n"),
    quellen: quellen.map((q, i) => ({ nr: q.nr || i + 1, titel: q.titel, url: q.url })),
    mail_kurzfassung: mail.filter(Boolean).join("\n\n"),
    ignoriert: { vorspann, zeile: metaLine.trim(), hinweis: hinweis.join("\n\n") },
    warnungen,
  };
}
