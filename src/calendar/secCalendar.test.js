// src/calendar/secCalendar.test.js — Termine und Berichte aus SEC EDGAR (ohne Netzwerk)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  announcedEarningsDate,
  annualMeeting,
  documentUrl,
  estimateNextEarnings,
  filingsFromSubmissions,
  latestReports,
  meetingDateFromProxy,
  reportLabel,
  upcomingEvents,
} from "./secCalendar.js";
import { calendarEntryFor, dueSecurities } from "./updateCalendar.js";

/** submissions-JSON wie bei der SEC (filings.recent als Spalten). rows: [form, filed, reportDate, items, doc] */
function submissions(rows) {
  const col = (i) => rows.map((r) => r[i] ?? "");
  return {
    filings: {
      recent: {
        accessionNumber: rows.map((_, i) => `0000000001-26-${String(i).padStart(6, "0")}`),
        form: col(0),
        filingDate: col(1),
        reportDate: col(2),
        items: col(3),
        primaryDocument: rows.map((r, i) => r[4] ?? `doc${i}.htm`),
      },
    },
  };
}

// Muster wie NVDA: Quartalszahlen Ende Feb/Mai/Aug/Nov, HV im Juni, DEF 14A mit Versammlungsdatum als reportDate
const NVDA_LIKE = submissions([
  ["8-K", "2026-09-03", "2026-09-02", "8.01"],
  ["10-Q", "2026-08-26", "2026-07-26", ""],
  ["8-K", "2026-08-26", "2026-08-26", "2.02,9.01"],
  ["8-K", "2026-06-30", "2026-06-24", "5.07"],
  ["10-Q", "2026-05-20", "2026-04-26", ""],
  ["8-K", "2026-05-20", "2026-05-20", "2.02,9.01"],
  ["DEF 14A", "2026-05-12", "2026-06-24", ""],
  ["10-K", "2026-02-25", "2026-01-25", ""],
  ["8-K", "2026-02-25", "2026-02-25", "2.02,9.01"],
  ["8-K", "2025-11-19", "2025-11-19", "2.02,9.01"],
  ["8-K", "2025-08-27", "2025-08-27", "2.02,9.01"],
  ["4", "2025-08-01", "", ""],
]);
const CIK = "0001045810";
const filings = filingsFromSubmissions(NVDA_LIKE, CIK);

test("Einreichungen: neueste zuerst, direkter Link auf das Dokument", () => {
  assert.equal(filings[0].filed, "2026-09-03");
  assert.equal(filings[0].url, "https://www.sec.gov/Archives/edgar/data/1045810/000000000126000000/doc0.htm");
  assert.equal(documentUrl(CIK, "0001045810-26-000036", null), "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000036/0001045810-26-000036-index.htm");
});

test("Berichte: nur 10-K, 10-Q, 8-K, deutsch beschriftet, höchstens 8", () => {
  const r = latestReports(filings);
  assert.equal(r.length, 8);
  assert.ok(r.every((x) => ["10-K", "10-Q", "8-K"].includes(x.form)));
  assert.equal(r[0].label, "Unternehmensmeldung · Sonstige Mitteilung");
  assert.equal(r[1].label, "Quartalsbericht");
  assert.equal(r[2].label, "Unternehmensmeldung · Quartalszahlen");
  assert.equal(r[3].label, "Unternehmensmeldung · Ergebnisse der Hauptversammlung");
  assert.equal(reportLabel({ form: "10-K" }), "Geschäftsbericht");
  assert.equal(reportLabel({ form: "10-Q/A" }), "Quartalsbericht (Berichtigung)");
  assert.equal(reportLabel({ form: "DEF 14A" }), null);
});

test("Quartalszahlen: Vorjahresquartal + 364 Tage, voraussichtlich", () => {
  const e = estimateNextEarnings(filings, "2026-10-16");
  assert.equal(e.date, "2026-11-18"); // 19.11.2025 + 364 Tage, gleicher Wochentag
  assert.equal(e.status, "voraussichtlich");
  assert.match(e.note, /19\.11\.2025/);
});

test("Quartalszahlen: schon veröffentlichtes Quartal wird übersprungen", () => {
  // Am 01.09.2026: Zahlen vom 26.08.2026 sind da (Vorjahr 27.08.2025) → nächster Termin aus November
  assert.equal(estimateNextEarnings(filings, "2026-09-01").date, "2026-11-18");
  // Ohne jede Einreichung kein Termin
  assert.equal(estimateNextEarnings([], "2026-10-16"), null);
});

test("Quartalszahlen ohne 8-K (Item 2.02): aus 10-Q/10-K abgeleitet", () => {
  const f = filingsFromSubmissions(submissions([["10-Q", "2025-11-05", "2025-09-30", ""], ["10-K", "2026-02-20", "2025-12-31", ""]]), CIK);
  const e = estimateNextEarnings(f, "2026-10-16");
  assert.equal(e.date, "2026-11-04");
  assert.match(e.note, /Quartals- bzw. Geschäftsbericht/);
});

test("Quartalszahlen ohne Vorjahr (neue Holding, Abspaltung): letzte Veröffentlichung + 91 Tage", () => {
  const f = filingsFromSubmissions(submissions([["8-K", "2026-07-31", "2026-07-31", "2.02"]]), CIK);
  const e = estimateNextEarnings(f, "2026-10-16");
  assert.equal(e.date, "2026-10-30");
  assert.match(e.note, /Quartalsrhythmus/);
});

test("Hauptversammlung: Datum aus dem reportDate der DEF 14A, vorbei → vergangen, Link auf das Proxy Statement", () => {
  const m = annualMeeting(filings, "2026-10-16");
  assert.equal(m.date, "2026-06-24");
  assert.equal(m.status, "vergangen");
  assert.equal(m.url, filings.find((f) => f.form === "DEF 14A").url);
  // Vor der Versammlung: kommend
  const before = annualMeeting(filings.filter((f) => f.filed <= "2026-05-31"), "2026-05-31");
  assert.equal(before.date, "2026-06-24");
  assert.equal(before.status, "kommend");
});

test("Hauptversammlung: Datum aus dem Text, wenn reportDate nur das Einreichungsdatum ist (wie JNJ)", () => {
  const text = "<p>NOTICE OF 2026 ANNUAL MEETING OF SHAREHOLDERS</p><p>Date: Thursday, April 23, 2026 at 10:00 a.m.</p>";
  assert.equal(meetingDateFromProxy(text, "2026-03-11"), "2026-04-23");
  // Datum vor der Einreichung (z. B. Vorjahr) zählt nicht
  assert.equal(meetingDateFromProxy("Annual Meeting held on April 24, 2025", "2026-03-11"), null);
  const f = filingsFromSubmissions(submissions([["DEF 14A", "2026-03-11", "2026-03-11", ""]]), CIK);
  const m = annualMeeting(f, "2026-03-20", text);
  assert.equal(m.date, "2026-04-23");
  assert.equal(m.status, "kommend");
  assert.equal(annualMeeting(f, "2026-03-20", null).date, null);
});

test("Ankündigung der Quartalszahlen in einer 8-K", () => {
  const text = "Acme Corp. will report financial results for the third quarter on Tuesday, October 27, 2026, after market close.";
  assert.equal(announcedEarningsDate(text, "2026-10-01"), "2026-10-27");
  assert.equal(announcedEarningsDate("The company announced a dividend payable on October 27, 2026.", "2026-10-01"), null);
});

test("Abruf eines Titels: bestätigter Termin aus Ankündigung, geprüfte 8-K werden gemerkt", async () => {
  const sub = submissions([
    ["8-K", "2026-10-05", "2026-10-05", "7.01,9.01", "ann.htm"],
    ["8-K", "2026-07-30", "2026-07-30", "2.02,9.01"],
    ["8-K", "2025-10-30", "2025-10-30", "2.02,9.01"],
    ["DEF 14A", "2026-01-08", "2026-02-24", ""],
  ]);
  const texts = { "ann.htm": "Acme will release its fourth quarter results on October 29, 2026." };
  const calls = [];
  const sec = {
    getJson: async (url) => (calls.push(url), sub),
    getText: async (url) => (calls.push(url), texts[url.split("/").pop()] ?? ""),
  };
  const row = await calendarEntryFor({ security: { id: "x", ticker: "ACME" }, cik: CIK, sec, today: "2026-10-16" });
  assert.equal(row.next_earnings_date, "2026-10-29");
  assert.equal(row.next_earnings_status, "bestaetigt");
  assert.match(row.next_earnings_url, /ann\.htm$/);
  assert.equal(row.hv_date, "2026-02-24");
  assert.equal(row.hv_status, "vergangen");
  assert.equal(row.checked_accessions.length, 1);
  assert.ok(row.filings.length > 0);
  // Zweiter Lauf: die 8-K wird nicht erneut gelesen, der Termin bleibt bestätigt
  calls.length = 0;
  const again = await calendarEntryFor({ security: { id: "x", ticker: "ACME" }, cik: CIK, sec, prev: row, today: "2026-10-16" });
  assert.equal(calls.length, 1);
  assert.equal(again.next_earnings_status, "bestaetigt");
});

test("Reihenfolge: Tazkiyah 30 zuerst, dann die am längsten nicht abgerufenen, ETFs nie", () => {
  const now = new Date("2026-10-16T04:00:00Z");
  const sec = [
    { id: "1", ticker: "AAA", asset_type: "stock" },
    { id: "2", ticker: "NVDA", asset_type: "stock" },
    { id: "3", ticker: "BBB", asset_type: "stock" },
    { id: "4", ticker: "ISWD", asset_type: "etf" },
    { id: "5", ticker: "CCC", asset_type: "stock", active: false },
  ];
  const cal = new Map([
    ["1", { fetched_at: "2026-10-10T04:00:00Z" }],
    ["3", { fetched_at: "2026-10-15T23:00:00Z" }], // jünger als 20 Stunden
  ]);
  assert.deepEqual(dueSecurities(sec, cal, ["NVDA"], now).map((s) => s.ticker), ["NVDA", "AAA"]);
  assert.deepEqual(dueSecurities(sec, cal, ["NVDA"], now, { tickers: ["BBB"] }).map((s) => s.ticker), ["BBB"]);
  // force (--all): auch kürzlich abgerufene
  assert.deepEqual(dueSecurities(sec, cal, ["NVDA"], now, { force: true }).map((s) => s.ticker), ["NVDA", "AAA", "BBB"]);
});

test("Kalender: Termine im Zeitraum, nach Datum sortiert, Zahlen und HV getrennt", () => {
  const rows = [
    { ticker: "B", next_earnings_date: "2026-10-29", next_earnings_status: "voraussichtlich", hv_date: "2026-04-01" },
    { ticker: "A", next_earnings_date: "2026-10-29", next_earnings_status: "bestaetigt", hv_date: "2026-11-04", hv_url: "u" },
    { ticker: "C", next_earnings_date: "2027-01-20", hv_date: null },
  ];
  const ev = upcomingEvents(rows, "2026-10-16", "2026-11-15");
  assert.deepEqual(ev.map((e) => `${e.date} ${e.ticker} ${e.kind}`), ["2026-10-29 A zahlen", "2026-10-29 B zahlen", "2026-11-04 A hv"]);
  assert.equal(ev[0].status, "bestaetigt");
});
