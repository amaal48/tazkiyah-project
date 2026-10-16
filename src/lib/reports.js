// src/lib/reports.js
//
// Wochenberichte (Tabelle weekly_reports): reine Hilfsfunktionen ohne Netzwerk, getestet in reports.test.js.
// Laden: src/lib/reportsData.js. Es gibt keine Demo-Berichte mehr; ohne Ausgabe zeigt die Seite
// „Die erste Ausgabe erscheint in Kürze.“ Leere Einträge (ohne Kurzfassung) zählen nicht.
//
// Abschnitte richten sich nach den heutigen Spalten (tldr, makro_politik, indices, aktien_fokus, ausblick).
// Das Inhaltsverzeichnis der B2-Vorlage (sechs Teile) braucht eigene Spalten, sobald der Generator neu
// gebaut wird.

import { readingMinutes } from "./blog.js";

// Berichte bleiben 6 Monate abrufbar, danach werden sie ausgeblendet
export const REPORT_RETENTION_DAYS = 182;

/** Kalenderwoche nach ISO 8601 aus „JJJJ-MM-TT“. */
export function isoWeek(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Montag = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // Donnerstag derselben Woche
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { week, year: d.getUTCFullYear() };
}

/** Datenbankzeile → Bericht für die Seite. */
export function mapReport(r) {
  const date = String(r.report_date || "").slice(0, 10);
  const { week, year } = isoWeek(date);
  const report = {
    date,
    week,
    weekYear: year,
    title: String(r.week_label || "").trim() || `Wochenbericht KW ${week}`,
    tldr: String(r.tldr || "").trim(),
    makroPolitik: String(r.makro_politik || "").trim(),
    indices: Array.isArray(r.indices) ? r.indices : [],
    aktienFokus: String(r.aktien_fokus || "").trim(),
    ausblick: String(r.ausblick || "").trim(),
    sourceNote: String(r.source_note || "").trim(),
  };
  report.sections = reportSections(report);
  report.minutes = readingMinutes(
    [report.tldr, report.makroPolitik, report.aktienFokus, report.ausblick, ...report.indices.map((i) => `${i.name || ""} ${i.change || ""} ${i.note || ""}`)].join(" ")
  );
  return report;
}

/** Abschnitte, die in dieser Ausgabe Inhalt haben (für Inhaltsverzeichnis und Sprungmarken). */
export function reportSections(r) {
  return [
    { id: "maerkte", title: "Die Woche an den Märkten", has: r.indices.length > 0 },
    { id: "makro", title: "Makro und Politik", has: !!r.makroPolitik },
    { id: "aktien", title: "Aktien im Fokus", has: !!r.aktienFokus },
    { id: "ausblick", title: "Nächste Woche", has: !!r.ausblick },
  ].filter((s) => s.has);
}

/** Nur Ausgaben mit Inhalt und aus den letzten 6 Monaten, neueste zuerst. */
export function visibleReports(rows, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - REPORT_RETENTION_DAYS);
  const cut = cutoff.toISOString().slice(0, 10);
  return (rows || [])
    .filter((r) => String(r.tldr || "").trim() && String(r.report_date || "").slice(0, 10) >= cut)
    .map(mapReport)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
