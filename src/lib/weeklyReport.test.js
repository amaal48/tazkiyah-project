// src/lib/weeklyReport.test.js — Lücken, Checkliste, Freigabe, Erscheinungstermin, Abschnitte, Mails

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECKLIST, berlinTime, buildNewsletterMail, buildOnlineNotice, canRelease, checkCount, erscheintAm, findGaps,
  fmtErscheint, fmtRange, isoWeek, joinSections, parseReportSlug, reportSlug, splitSections, weekRange,
} from "./weeklyReport.js";

const ALL = Object.fromEntries(CHECKLIST.map((c) => [String(c.nr), true]));

test("Checkliste hat die 11 Punkte in 4 Gruppen", () => {
  assert.equal(CHECKLIST.length, 11);
  assert.deepEqual([...new Set(CHECKLIST.map((c) => c.group))], ["Rechtliches", "Fakten", "Quellen", "Format"]);
});

test("Lücken: eckige Klammern, aber keine Markdown-Links", () => {
  const r = { titel: "T", body_md: "Text [Lücke] und [Link](https://x.de).", quellen: [{ nr: 3, titel: "IWF [Links ergänzen]", url: null }] };
  const gaps = findGaps(r);
  assert.deepEqual(gaps.map((g) => [g.label, g.text]), [["Fließtext", "[Lücke]"], ["Quelle 3", "[Links ergänzen]"]]);
  assert.equal(gaps[0].index, 5);
});

test("Freigabe nur bei 0 Lücken und allen 11 Punkten, nur aus dem Entwurf", () => {
  const base = { status: "entwurf", titel: "T", body_md: "ok", quellen: [], checkliste: ALL };
  assert.equal(canRelease(base), true);
  assert.equal(canRelease({ ...base, body_md: "[x]" }), false);
  assert.equal(canRelease({ ...base, checkliste: { ...ALL, 11: false } }), false);
  assert.equal(canRelease({ ...base, status: "freigegeben" }), false);
  assert.equal(checkCount({ 1: true, 2: true }), 2);
});

test("Erscheint Montag nach dem Zeitraum um 12:00 Berlin (Sommer- und Winterzeit)", () => {
  assert.equal(erscheintAm("2026-10-16").toISOString(), "2026-10-19T10:00:00.000Z");
  assert.equal(erscheintAm("2026-11-06").toISOString(), "2026-11-09T11:00:00.000Z");
  assert.equal(erscheintAm("2026-10-25").toISOString(), "2026-10-26T11:00:00.000Z"); // Sonntag der Zeitumstellung
  assert.equal(berlinTime("2026-03-30").toISOString(), "2026-03-30T10:00:00.000Z");
  assert.equal(fmtErscheint("2026-10-19T10:00:00Z"), "Montag, 19.10., 12:00");
});

test("Kalenderwoche und Zeitraum", () => {
  assert.deepEqual(weekRange(2026, 42), { von: "2026-10-12", bis: "2026-10-16" });
  assert.deepEqual(weekRange(2026, 1), { von: "2025-12-29", bis: "2026-01-02" });
  assert.deepEqual(isoWeek("2026-10-12"), { week: 42, year: 2026 });
  assert.equal(fmtRange("2026-10-12", "2026-10-16"), "12. bis 16. Oktober 2026");
  assert.equal(fmtRange("2026-09-28", "2026-10-02"), "28. September bis 2. Oktober 2026");
});

test("Adresse je Ausgabe", () => {
  assert.equal(reportSlug({ jahr: 2026, kw: 42 }), "2026-kw42");
  assert.equal(reportSlug({ jahr: 2026, kw: 3 }), "2026-kw03");
  assert.deepEqual(parseReportSlug("2026-kw42"), { jahr: 2026, kw: 42 });
  assert.equal(parseReportSlug("2026-10-19"), null);
});

test("Abschnitte zerlegen und wieder zusammensetzen", () => {
  const md = "Vorweg.\n\n## A\nText A\n\n## B\nText B";
  const s = splitSections(md);
  assert.deepEqual(s, [{ heading: "", text: "Vorweg." }, { heading: "A", text: "Text A" }, { heading: "B", text: "Text B" }]);
  assert.equal(joinSections(s), md);
});

test("Mails: Abonnenten (vorbereitet) und Redaktion", () => {
  const r = { kw: 42, titel: "Teure Energie", drei_saetze: "Drei.", mail_kurzfassung: "" };
  const m = buildNewsletterMail(r, "https://x/#/berichte/wochenbericht/2026-kw42");
  assert.equal(m.subject, "Wochenbericht KW 42: Teure Energie");
  assert.match(m.text, /^Drei\./);
  assert.match(m.text, /keine Fatwa/);
  assert.equal(buildOnlineNotice(r, "u").subject, "Wochenbericht KW 42 ist online");
  const b = buildNewsletterMail({ ...r, mail_kurzfassung: "Betreff: Eigener Betreff\n\nKurztext." }, "u");
  assert.equal(b.subject, "Eigener Betreff");
  assert.equal(b.intro, "Kurztext.");
});

test("Formular: Abschnitte als Liste, Lücken je Abschnitt, zurück in Felder", async () => {
  const { toForm, fromForm, findFormGaps } = await import("./weeklyReport.js");
  const f = toForm({ titel: "T", body_md: "## A\nText [x]\n\n## B\nOk", quellen: [{ nr: 1, titel: "Q [Link]", url: null }, { nr: 2, titel: "", url: null }] });
  assert.equal(f.sections.length, 2);
  assert.deepEqual(findFormGaps(f).map((g) => [g.field, g.section ?? null, g.text]), [["body", 0, "[x]"], ["quellen", null, "[Link]"]]);
  const back = fromForm({ ...f, sections: [...f.sections, { heading: "C", text: "Neu " }] });
  assert.equal(back.body_md, "## A\nText [x]\n\n## B\nOk\n\n## C\nNeu");
  assert.equal(back.quellen.length, 1);
});
