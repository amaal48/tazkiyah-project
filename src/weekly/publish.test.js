// src/weekly/publish.test.js — Veröffentlichen: nur Freigegebenes mit erreichtem Termin, Mail an die Redaktion

import { test } from "node:test";
import assert from "node:assert/strict";
import { publishDueReports, reportUrl } from "./publish.js";

function fakeRepo(rows) {
  return {
    rows,
    async dueReports(nowIso) {
      return rows.filter((r) => r.status === "freigegeben" && r.erscheint_am <= nowIso);
    },
    async markPublished(id) {
      const r = rows.find((x) => x.id === id && x.status === "freigegeben");
      if (!r) return null;
      r.status = "veroeffentlicht";
      return r;
    },
  };
}

const ROWS = () => [
  { id: "a", jahr: 2026, kw: 42, titel: "Fällig", status: "freigegeben", erscheint_am: "2026-10-19T10:00:00.000Z" },
  { id: "b", jahr: 2026, kw: 43, titel: "Später", status: "freigegeben", erscheint_am: "2026-10-26T11:00:00.000Z" },
  { id: "c", jahr: 2026, kw: 41, titel: "Entwurf", status: "entwurf", erscheint_am: "2026-10-12T10:00:00.000Z" },
];

test("Nur freigegeben und Termin erreicht; Mail „ist online“ mit Link", async () => {
  const repo = fakeRepo(ROWS());
  const mails = [];
  const s = await publishDueReports({ repo, sendMail: async (m) => (mails.push(m), { ok: true }), siteUrl: "https://x.de/", now: new Date("2026-10-19T10:05:00Z") });
  assert.deepEqual(s.published, ["KW 42/2026"]);
  assert.deepEqual(repo.rows.map((r) => r.status), ["veroeffentlicht", "freigegeben", "entwurf"]);
  assert.equal(mails[0].subject, "Wochenbericht KW 42 ist online");
  assert.match(mails[0].text, /https:\/\/x\.de\/#\/berichte\/wochenbericht\/2026-kw42/);
  assert.equal(s.newsletter, "aus");
});

test("Vor 12:00 Berlin erscheint nichts (Sommerzeit 10:00 UTC)", async () => {
  const repo = fakeRepo(ROWS());
  const s = await publishDueReports({ repo, sendMail: async () => ({ ok: true }), siteUrl: "https://x.de", now: new Date("2026-10-19T09:59:00Z") });
  assert.equal(s.due, 0);
  assert.deepEqual(s.published, []);
});

test("dryRun ändert nichts", async () => {
  const repo = fakeRepo(ROWS());
  const s = await publishDueReports({ repo, sendMail: async () => ({ ok: true }), siteUrl: "https://x.de", now: new Date("2026-10-30T00:00:00Z"), dryRun: true });
  assert.deepEqual(s.wouldPublish, ["KW 42/2026", "KW 43/2026"]);
  assert.ok(repo.rows.every((r) => r.status !== "veroeffentlicht"));
});

test("Fehler beim Veröffentlichen → Mail mit Fehlermeldung, Ausgabe bleibt freigegeben", async () => {
  const repo = fakeRepo(ROWS());
  repo.markPublished = async () => {
    throw new Error("Datenbank nicht erreichbar");
  };
  const mails = [];
  const s = await publishDueReports({ repo, sendMail: async (m) => (mails.push(m), { ok: true }), siteUrl: "https://x.de", now: new Date("2026-10-19T10:05:00Z") });
  assert.equal(s.errors.length, 1);
  assert.match(mails[0].subject, /fehlgeschlagen/);
  assert.match(mails[0].text, /Datenbank nicht erreichbar/);
  assert.equal(repo.rows[0].status, "freigegeben");
});

test("Adresse der Ausgabe", () => {
  assert.equal(reportUrl("https://a.de//", { jahr: 2026, kw: 3 }), "https://a.de/#/berichte/wochenbericht/2026-kw03");
});
