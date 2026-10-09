// src/screening/providers/secFmp.test.js — Modus sec_fmp: Profil-Rückfall auf die SEC
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSecFmpProvider, createSecOnlyFallback, PRICE_PENDING_NOTE } from "./secFmp.js";

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

test("Ersatz ohne FMP-Budget: nur SEC, keine FMP-Abrufe, Perioden mit priceStatus pending und Vermerk", async () => {
  const snap = () => ({ periodEnd: "2025-12-31", balance: {}, income: {} });
  const secFull = { ...sec, getFinancialPeriods: async () => ({ annual: snap(), quarters: [snap()], notes: [] }) };
  const fmp = { getProfile: async () => { throw new Error("darf nicht aufgerufen werden"); } };
  const fb = createSecFmpProvider({ sec: secFull, fmp }).withoutBudget();
  assert.equal(fb.id, "sec_fmp");
  assert.equal(fb.callsPerTitle, 0);
  assert.equal((await fb.getProfile("X")).profileSource, "sec");
  const p = await fb.getFinancialPeriods("X");
  assert.ok([p.annual, ...p.quarters].every((s) => s.priceStatus === "pending"));
  assert.ok(p.notes.includes(PRICE_PENDING_NOTE));
  assert.equal(typeof createSecOnlyFallback, "function");
});
