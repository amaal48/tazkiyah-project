// src/lib/reports.test.js — Wochenberichte: Kalenderwoche, Abschnitte, Aufbewahrung, leere Einträge

import { test } from "node:test";
import assert from "node:assert/strict";
import { isoWeek, mapReport, visibleReports } from "./reports.js";

test("Kalenderwoche nach ISO 8601", () => {
  assert.deepEqual(isoWeek("2026-10-19"), { week: 43, year: 2026 });
  assert.deepEqual(isoWeek("2026-01-01"), { week: 1, year: 2026 });
  assert.deepEqual(isoWeek("2027-01-01"), { week: 53, year: 2026 });
  assert.deepEqual(isoWeek("2024-12-30"), { week: 1, year: 2025 });
});

test("Bericht: Titel, Abschnitte nur mit Inhalt, Lesezeit", () => {
  const r = mapReport({ report_date: "2026-10-19", week_label: "", tldr: "Kurz.", ausblick: "Termine.", indices: [] });
  assert.equal(r.title, "Wochenbericht KW 43");
  assert.deepEqual(r.sections.map((s) => s.id), ["ausblick"]);
  assert.equal(r.minutes, 1);
});

test("Sichtbar: ohne leere Einträge, nur 6 Monate, neueste zuerst", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const rows = [
    { report_date: "2026-10-05", tldr: "" },
    { report_date: "2026-10-12", tldr: "A" },
    { report_date: "2026-10-19", tldr: "B" },
    { report_date: "2026-01-05", tldr: "alt" },
  ];
  assert.deepEqual(visibleReports(rows, now).map((r) => r.date), ["2026-10-19", "2026-10-12"]);
  assert.deepEqual(visibleReports([], now), []);
});
