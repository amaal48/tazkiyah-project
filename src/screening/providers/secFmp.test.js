// src/screening/providers/secFmp.test.js — Modus sec_fmp: Profil-Rückfall auf die SEC
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSecFmpProvider } from "./secFmp.js";

const secProfile = { symbol: "X", name: "X Corp", cik: "0000000001", sic: "7372", sicDescription: "SOFTWARE", industry: null };
const sec = { getProfile: async () => secProfile, getCallCount: () => 0 };

test("FMP-Profil fehlt (z. B. 402) → SEC-Profil, Titel läuft weiter", async () => {
  const fmp = { getProfile: async () => { throw Object.assign(new Error("FMP profile 402"), { kind: "premium" }); } };
  const p = await createSecFmpProvider({ sec, fmp }).getProfile("X");
  assert.equal(p.sic, "7372");
  assert.equal(p.profileSource, "sec");
});

test("FMP-Profil null → SEC-Profil; FMP-Profil vorhanden → ergänzt um SIC", async () => {
  assert.equal((await createSecFmpProvider({ sec, fmp: { getProfile: async () => null } }).getProfile("X")).sic, "7372");
  const both = await createSecFmpProvider({ sec, fmp: { getProfile: async () => ({ symbol: "X", industry: "Software", isin: "US1" }) } }).getProfile("X");
  assert.equal(both.industry, "Software");
  assert.equal(both.sic, "7372");
});

test("FMP-Tageslimit bricht weiter ab (Titel beim nächsten Lauf erneut)", async () => {
  const fmp = { getProfile: async () => { throw Object.assign(new Error("limit"), { kind: "limit" }); } };
  await assert.rejects(createSecFmpProvider({ sec, fmp }).getProfile("X"), (e) => e.kind === "limit");
});
