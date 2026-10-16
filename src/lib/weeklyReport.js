// src/lib/weeklyReport.js
//
// Wochenbericht: reine Hilfsfunktionen ohne Netzwerk (Website, Prüfseite, Cron), getestet in weeklyReport.test.js.
// Datenbank: supabase_wochenbericht.sql (Tabelle weekly_reports). Die Datenbank prüft Lücken und Checkliste
// bei der Freigabe noch einmal selbst; die Regeln hier und dort müssen übereinstimmen.

import { readingMinutes } from "./blog.js";

/** Die 11 Punkte vor jeder Freigabe (wochenbericht-checkliste.md, Stand 16.10.2026). */
export const CHECKLIST = [
  { nr: 1, group: "Rechtliches", label: "Keine Kauf- oder Verkaufsformulierungen („kaufen“, „einsteigen“, „aussteigen“, „jetzt“, „Chance“, „lohnt sich“)" },
  { nr: 2, group: "Rechtliches", label: "Keine Kursziele, Rankings, Prognosen der Redaktion, kein „Top“" },
  { nr: 3, group: "Rechtliches", label: "Unternehmen aus den Tazkiyah 30 nur mit Fakten, keine Wertung" },
  { nr: 4, group: "Rechtliches", label: "Hinweis „Keine Anlageberatung, keine Fatwa“ vorhanden" },
  { nr: 5, group: "Fakten", label: "Jede Zahl gegen die Primärquelle geprüft" },
  { nr: 6, group: "Fakten", label: "Einheit, Währung und Zeitraum bei jeder Zahl" },
  { nr: 7, group: "Fakten", label: "Vorläufig/endgültig und bereinigt/ausgewiesen gekennzeichnet" },
  { nr: 8, group: "Quellen", label: "Jede Aussage mit Quelle, alle Links funktionieren" },
  { nr: 9, group: "Format", label: "Fließtext, nur Rückblick auf die vergangene Woche, kein Ausblick" },
  { nr: 10, group: "Format", label: "„Das Wichtigste in drei Sätzen“ und Mail-Kurzfassung passen zum Text" },
  { nr: 11, group: "Format", label: "Handy-Ansicht geprüft" },
];

export const STATUS_TEXT = {
  entwurf: "Entwurf",
  freigegeben: "Freigegeben",
  veroeffentlicht: "Veröffentlicht",
  zurueckgezogen: "Zurückgezogen",
};

/** Fester Hinweis unter jeder Ausgabe (Website und Mail). */
export const REPORT_NOTICE =
  "Dieser Bericht dient ausschließlich der Information und Bildung. Er ist keine Anlageberatung, keine Aufforderung zum Kauf oder Verkauf von Wertpapieren und keine Fatwa. Für Vollständigkeit und Richtigkeit der Angaben übernehmen wir keine Gewähr.";

// Lücke = [eckige Klammern], aber kein Markdown-Link [Text](https://…) — wie weekly_report_gap_count() in der SQL-Datei
const GAP_RE = /\[[^\]\n]*\](?!\()/g;

const GAP_FIELDS = [
  ["titel", "Titel"],
  ["drei_saetze", "Drei Sätze"],
  ["body_md", "Fließtext"],
  ["einordnung", "Einordnung"],
  ["mail_kurzfassung", "Mail-Kurzfassung"],
];

/** Alle Lücken mit Feld, Position und Text (für „Lücken im Text“ mit Sprung zur Stelle). */
export function findGaps(report) {
  const out = [];
  for (const [field, label] of GAP_FIELDS) {
    const text = String(report?.[field] || "");
    for (const m of text.matchAll(GAP_RE)) out.push({ field, label, index: m.index, length: m[0].length, text: m[0] });
  }
  (Array.isArray(report?.quellen) ? report.quellen : []).forEach((q, i) => {
    for (const part of ["titel", "url"]) {
      const text = String(q?.[part] || "");
      for (const m of text.matchAll(GAP_RE)) out.push({ field: "quellen", label: `Quelle ${q?.nr ?? i + 1}`, source: i, part, index: m.index, length: m[0].length, text: m[0] });
    }
  });
  return out;
}

export function checksDone(checkliste) {
  return CHECKLIST.every((c) => checkliste?.[String(c.nr)] === true);
}

export function checkCount(checkliste) {
  return CHECKLIST.filter((c) => checkliste?.[String(c.nr)] === true).length;
}

/** Freigabe möglich? (0 Lücken, alle 11 Punkte, Status Entwurf) */
export function canRelease(report) {
  return report?.status === "entwurf" && findGaps(report).length === 0 && checksDone(report.checkliste);
}

/** UTC-Zeitpunkt für Datum „JJJJ-MM-TT“ um hh:00 Uhr in Berlin (Sommer-/Winterzeit). */
export function berlinTime(isoDate, hour = 12) {
  for (const offset of [1, 2]) {
    const candidate = new Date(`${isoDate}T${String(hour - offset).padStart(2, "0")}:00:00Z`);
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "numeric", hourCycle: "h23" }).formatToParts(candidate);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    if (h === hour) return candidate;
  }
  return new Date(`${isoDate}T${String(hour - 1).padStart(2, "0")}:00:00Z`);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Montag nach dem Berichtszeitraum, 12:00 Uhr Berlin (wie der Trigger in der SQL-Datei). */
export function erscheintAm(zeitraumBis) {
  const d = new Date(`${zeitraumBis}T12:00:00Z`);
  const isoDow = ((d.getUTCDay() + 6) % 7) + 1;
  return berlinTime(addDays(zeitraumBis, 8 - isoDow), 12);
}

/** Montag und Freitag einer Kalenderwoche (ISO 8601). */
export function weekRange(jahr, kw) {
  const jan4 = new Date(Date.UTC(jahr, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (kw - 1) * 7);
  const von = monday.toISOString().slice(0, 10);
  return { von, bis: addDays(von, 4) };
}

/** Kalenderwoche nach ISO 8601 aus „JJJJ-MM-TT“. */
export function isoWeek(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { week, year: d.getUTCFullYear() };
}

/** Adresse einer Ausgabe: „2026-kw42“. */
export function reportSlug(r) {
  return `${r.jahr}-kw${String(r.kw).padStart(2, "0")}`;
}

export function parseReportSlug(slug) {
  const m = String(slug || "").match(/^(\d{4})-kw(\d{1,2})$/i);
  return m ? { jahr: Number(m[1]), kw: Number(m[2]) } : null;
}

/** Fließtext in Abschnitte (für die abschnittsweise Bearbeitung): [{ heading, text }]. */
export function splitSections(bodyMd) {
  const lines = String(bodyMd || "").replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let cur = { heading: "", lines: [] };
  for (const line of lines) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      if (cur.heading || cur.lines.join("").trim()) sections.push(cur);
      cur = { heading: h[1].trim(), lines: [] };
    } else cur.lines.push(line);
  }
  if (cur.heading || cur.lines.join("").trim()) sections.push(cur);
  return sections.map((s) => ({ heading: s.heading, text: s.lines.join("\n").trim() }));
}

export function joinSections(sections) {
  return sections
    .filter((s) => s.heading.trim() || s.text.trim())
    .map((s) => (s.heading.trim() ? `## ${s.heading.trim()}\n${s.text.trim()}` : s.text.trim()))
    .join("\n\n");
}

/** Bericht → Formularzustand (Fließtext als Liste von Abschnitten). */
export function toForm(r) {
  return {
    ...r,
    titel: r.titel || "",
    drei_saetze: r.drei_saetze || "",
    einordnung: r.einordnung || "",
    mail_kurzfassung: r.mail_kurzfassung || "",
    quellen: Array.isArray(r.quellen) ? r.quellen : [],
    sections: splitSections(r.body_md),
  };
}

/** Formularzustand → Felder für die Datenbank. */
export function fromForm(f) {
  return {
    jahr: f.jahr,
    kw: f.kw,
    zeitraum_von: f.zeitraum_von,
    zeitraum_bis: f.zeitraum_bis,
    titel: String(f.titel || "").trim(),
    drei_saetze: String(f.drei_saetze || "").trim(),
    body_md: joinSections(f.sections || []),
    einordnung: String(f.einordnung || "").trim(),
    quellen: (f.quellen || [])
      .filter((q) => String(q.titel || "").trim() || q.url)
      .map((q, i) => ({ nr: Number(q.nr) || i + 1, titel: String(q.titel || "").trim(), url: q.url ? String(q.url).trim() : null })),
    mail_kurzfassung: String(f.mail_kurzfassung || "").trim(),
  };
}

/** Lücken im Formular, im Fließtext mit Abschnitt (für den Sprung zur Stelle). */
export function findFormGaps(f) {
  const base = findGaps({ ...f, body_md: "" });
  const body = [];
  (f.sections || []).forEach((s, i) => {
    for (const m of String(s.text || "").matchAll(GAP_RE)) body.push({ field: "body", section: i, label: s.heading || `Abschnitt ${i + 1}`, index: m.index, length: m[0].length, text: m[0] });
    for (const m of String(s.heading || "").matchAll(GAP_RE)) body.push({ field: "bodyHeading", section: i, label: `Überschrift ${i + 1}`, index: m.index, length: m[0].length, text: m[0] });
  });
  const order = ["titel", "drei_saetze", "body", "bodyHeading", "einordnung", "quellen", "mail_kurzfassung"];
  return [...base, ...body].sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field) || (a.section ?? 0) - (b.section ?? 0) || a.index - b.index);
}

/** Lesezeit des ganzen Berichts. */
export function reportMinutes(r) {
  return readingMinutes([r.drei_saetze, r.body_md, r.einordnung].join("\n"));
}

/** „12. bis 16. Oktober 2026“ */
export function fmtRange(von, bis) {
  const a = new Date(`${von}T12:00:00Z`);
  const b = new Date(`${bis}T12:00:00Z`);
  const opt = { timeZone: "UTC" };
  const day = (d) => d.toLocaleDateString("de-DE", { ...opt, day: "numeric" });
  const month = (d) => d.toLocaleDateString("de-DE", { ...opt, month: "long" });
  const year = (d) => d.getUTCFullYear();
  if (year(a) !== year(b)) return `${day(a)}. ${month(a)} ${year(a)} bis ${day(b)}. ${month(b)} ${year(b)}`;
  if (month(a) !== month(b)) return `${day(a)}. ${month(a)} bis ${day(b)}. ${month(b)} ${year(b)}`;
  return `${day(a)}. bis ${day(b)}. ${month(b)} ${year(b)}`;
}

/** „Montag, 19.10., 12:00“ (Berliner Zeit) */
export function fmtErscheint(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const f = (o) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", ...o }).format(d);
  return `${f({ weekday: "long" })}, ${f({ day: "2-digit", month: "2-digit" })}, ${f({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`;
}

/** Datum mit Uhrzeit in Berliner Zeit: „19.10.2026, 12:00“ */
export function fmtBerlin(ts) {
  if (!ts) return "";
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ts));
}

/** Mail an Abonnenten (vorbereitet, Versand nur mit NEWSLETTER_ENABLED). */
export function buildNewsletterMail(r, url) {
  // Eine Zeile „Betreff: …“ am Anfang der Mail-Kurzfassung ist der Betreff, der Rest der Text
  let kurz = String(r.mail_kurzfassung || "").trim();
  let subject = `Wochenbericht KW ${r.kw}: ${r.titel}`;
  const m = kurz.match(/^betreff:\s*(.+)$/im);
  if (m && kurz.indexOf(m[0]) === 0) {
    subject = m[1].trim();
    kurz = kurz.slice(m[0].length).trim();
  }
  const intro = kurz || String(r.drei_saetze || "").trim();
  const text = [intro, "", `Ganzen Bericht lesen: ${url}`, "", REPORT_NOTICE, "", "Abmelden: Der Abmeldelink folgt mit dem Start des Newsletters."].join("\n");
  return { subject, intro, text };
}

/** Kurze Mail an die Redaktion nach dem Veröffentlichen. */
export function buildOnlineNotice(r, url) {
  return { subject: `Wochenbericht KW ${r.kw} ist online`, text: `Der Wochenbericht KW ${r.kw} („${r.titel}“) ist veröffentlicht.\n\n${url}` };
}
