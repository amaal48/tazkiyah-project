// src/screening/industryRules.test.js — A1-Zuordnung über SIC-Codes (SEC-Daten)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifySic,
  classifyProfile,
  classifyIndustry,
  sicMatches,
  usesSic,
  isShellSic,
  needsGoldDealerReviewSic,
  INDUSTRY_GROUPS,
  PAYMENT_NETWORK_TICKERS,
  A1_TEXT_KEYWORDS,
} from "./industryRules.js";

test("sicMatches: Einzelcode, Bereich einschließlich der Grenzen, Text und Unsinn", () => {
  assert.equal(sicMatches(6411, [6411]), true);
  assert.equal(sicMatches("6021", [[6021, 6099]]), true);
  assert.equal(sicMatches("6099", [[6021, 6099]]), true);
  assert.equal(sicMatches("6100", [[6021, 6099]]), false);
  assert.equal(sicMatches(null, [[0, 9999]]), false);
  assert.equal(sicMatches("abc", [[0, 9999]]), false);
});

test("Einzelcode: Brauerei 2082 → Ausschluss Alkohol", () => {
  const c = classifySic("2082", { sicDescription: "MALT BEVERAGES" });
  assert.equal(c.class, "exclude");
  assert.equal(c.group.id, "alcohol");
  assert.match(c.why, /SIC 2082 MALT BEVERAGES/);
});

test("Ausnahme: 2080 Getränke (Coca-Cola) und 2086 → B3, nicht Alkohol", () => {
  for (const sic of ["2080", "2086"]) {
    const c = classifySic(sic);
    assert.equal(c.class, "b3_focus", sic);
    assert.equal(c.group.id, "consumer_realestate", sic);
  }
});

test("Bereiche: Bank, Kreditgeber, Versicherer, Tabak, Waffen → Ausschluss", () => {
  const cases = { 6021: "riba", 6141: "riba", 6331: "riba", 2111: "tobacco", 3480: "defense", 6770: null };
  for (const [sic, group] of Object.entries(cases)) {
    const c = classifySic(sic);
    if (group === null) continue;
    assert.equal(c.class, "exclude", sic);
    assert.equal(c.group.id, group, sic);
  }
});

test("Krankenversicherer 6324 und Makler 6411: Ausschluss mit Auslegungsfrage, Bank ohne", () => {
  for (const sic of ["6324", "6411"]) {
    const c = classifySic(sic);
    assert.equal(c.class, "exclude");
    assert.equal(c.interpretation, true, sic);
  }
  assert.equal(classifySic("6021").interpretation, false);
});

test("Manuelle Prüfung: Luftfahrt, Schiffbau, Militärelektronik, Fleisch, Film, 6199", () => {
  const cases = { 3721: "defense", 3730: "defense", 3812: "defense", 2011: "pork", 4841: "film_streaming_games", 7812: "film_streaming_games", 6199: "riba", 6799: "riba" };
  for (const [sic, group] of Object.entries(cases)) {
    const c = classifySic(sic);
    assert.equal(c.class, "review", sic);
    assert.equal(c.group.id, group, sic);
  }
  assert.equal(classifySic("3721").interpretation, true);
});

test("B3-Schwerpunkt: Broker, Restaurants, Hotels, REITs, Musik", () => {
  const cases = { 6211: "financial_other", 5812: "consumer_realestate", 7011: "consumer_realestate", 6798: "consumer_realestate", 3652: "music" };
  for (const [sic, group] of Object.entries(cases)) {
    const c = classifySic(sic);
    assert.equal(c.class, "b3_focus", sic);
    assert.equal(c.group.id, group, sic);
  }
});

test("Erlaubt: Pharma 2834/2836, Software 7372, allgemeine Dienste 7389", () => {
  for (const sic of ["2834", "2836", "7372", "7389"]) assert.equal(classifySic(sic).class, "allow", sic);
});

test("PAYMENT_NETWORK_TICKERS: Visa unter 7389 → financial_other (B3), Code 7389 sonst erlaubt", () => {
  assert.deepEqual(Object.keys(PAYMENT_NETWORK_TICKERS), ["V", "MA", "PYPL", "FISV", "FIS", "GPN", "CPAY", "XYZ"]);
  assert.equal(classifySic("7372", { symbol: "XYZ" }).group.id, "financial_other");
  const v = classifySic("7389", { symbol: "v" });
  assert.equal(v.class, "b3_focus");
  assert.equal(v.group.id, "financial_other");
  assert.equal(v.interpretation, true);
  assert.equal(classifySic("7389", { symbol: "ACN" }).class, "allow");
  assert.equal(classifySic("7389", { symbol: "ACN" }).interpretation, undefined);
  // Liste hebt keinen Ausschluss auf
  assert.equal(classifySic("6021", { symbol: "V" }).class, "exclude");
});

test("Fehlender SIC-Code → unknown", () => {
  assert.equal(classifySic(null).class, "unknown");
  assert.equal(classifySic("").class, "unknown");
  assert.equal(classifyProfile({ industry: "Banks - Diversified" }, "sec").class, "unknown");
});

test("C2 und A3 über SIC: 6770 Blank Check, 5094 Edelmetall-Großhandel", () => {
  assert.equal(isShellSic("6770"), true);
  assert.equal(isShellSic("6799"), false);
  assert.equal(needsGoldDealerReviewSic("5094"), true);
  assert.equal(classifySic("5094").class, "allow");
});

test("FMP-Modus unverändert: classifyProfile nutzt Branche und Beschreibung, nicht den SIC-Code", () => {
  const profile = { industry: "Software - Infrastructure", description: "We sell cannabis.", sic: "2082" };
  for (const provider of ["fmp", null, undefined]) {
    assert.equal(usesSic(provider), false);
    assert.deepEqual(classifyProfile(profile, provider), classifyIndustry(profile.industry, profile.description));
  }
  assert.equal(classifyProfile(profile, "fmp").class, "review"); // Cannabis-Stichwort wie bisher
  assert.equal(classifyProfile(profile, "sec").class, "exclude"); // SIC 2082
  assert.equal(classifyProfile(profile, "sec_fmp").class, "exclude"); // sec_fmp prüft wie sec
});

test("Festlegungen 09.10.2026 an den Gruppen (decisions, Auslegungsfrage bei riba, financial_other, defense)", () => {
  for (const id of ["alcohol", "gambling", "riba", "film_streaming_games", "financial_other", "defense"]) {
    const g = INDUSTRY_GROUPS.find((x) => x.id === id);
    assert.ok(g.decisions.some((d) => d.date === "2026-10-09"), id);
  }
  for (const id of ["riba", "financial_other", "defense"]) {
    const g = INDUSTRY_GROUPS.find((x) => x.id === id);
    assert.ok(g.decisions.filter((d) => d.date === "2026-10-09").every((d) => d.interpretation), id);
  }
  const riba = INDUSTRY_GROUPS.find((x) => x.id === "riba");
  assert.ok(riba.decisions.some((d) => /gelehrte Person/.test(d.text)));
  assert.match(INDUSTRY_GROUPS.find((x) => x.id === "film_streaming_games").label, /Freizeit und Unterhaltung/);
});

test("Ticker-Listen: Alkohol unter 2080, Casinos unter 7011, Riba unter 6211/6282 → Ausschluss", () => {
  const cases = [
    ["STZ", "2080", "alcohol", "ALCOHOL_TICKERS"],
    ["BF.B", "2080", "alcohol", "ALCOHOL_TICKERS"],
    ["LVS", "7011", "gambling", "CASINO_TICKERS"],
    ["CZR", "7011", "gambling", "CASINO_TICKERS"],
    ["GS", "6211", "riba", "RIBA_TICKERS"],
    ["APO", "6282", "riba", "RIBA_TICKERS"],
  ];
  for (const [symbol, sic, group, list] of cases) {
    const c = classifySic(sic, { symbol });
    assert.equal(c.class, "exclude", symbol);
    assert.equal(c.group.id, group, symbol);
    assert.equal(c.list, list, symbol);
  }
  // ohne Liste bleibt es bei der SIC-Zuordnung
  assert.equal(classifySic("2080", { symbol: "KO" }).class, "b3_focus");
  assert.equal(classifySic("7011", { symbol: "MAR" }).class, "b3_focus");
  assert.equal(classifySic("6211", { symbol: "IBKR" }).class, "b3_focus");
  // Ausschluss-Liste greift auch ohne SIC-Code
  assert.equal(classifySic(null, { symbol: "WYNN" }).class, "exclude");
});

test("Ticker-Listen: Games und GE/HWM → manuelle Prüfung, auch ohne SIC-Code (EA)", () => {
  assert.equal(classifySic("7372", { symbol: "TTWO" }).group.id, "film_streaming_games");
  assert.equal(classifySic("7372", { symbol: "TTWO" }).class, "review");
  assert.equal(classifySic(null, { symbol: "EA" }).class, "review");
  const ge = classifySic("3600", { symbol: "GE" });
  assert.equal(ge.class, "review");
  assert.equal(ge.group.id, "defense");
  assert.equal(classifySic("3350", { symbol: "HWM" }).class, "review");
  // Prüf-Liste hebt keinen SIC-Ausschluss auf
  assert.equal(classifySic("6021", { symbol: "GE" }).class, "exclude");
});

test("Freizeit 7900–7999 → manuelle Prüfung; Live Nation zusätzlich Musik", () => {
  for (const sic of ["7900", "7948", "7990", "7999"]) {
    const c = classifySic(sic);
    assert.equal(c.class, "review", sic);
    assert.equal(c.group.id, "film_streaming_games", sic);
  }
  const lyv = classifySic("7900", { symbol: "LYV" });
  assert.equal(lyv.class, "review");
  assert.deepEqual(lyv.also.map((g) => g.id), ["music"]);
  assert.match(lyv.why, /zusätzlich Musik/);
  assert.equal(classifySic("7900", { symbol: "TKO" }).also, undefined);
});

test("Kreditauskunfteien 7320: erlaubt, aber Auslegungsfrage", () => {
  const c = classifySic("7320", { symbol: "EFX" });
  assert.equal(c.class, "allow");
  assert.equal(c.interpretation, true);
  assert.match(c.why, /gelehrte Person/);
});

test("A1-Stichworte für das 10-K enthalten Schweinefleisch, Cannabis, Casino, Games, Musik, Waffen", () => {
  const all = A1_TEXT_KEYWORDS.flatMap((g) => g.keywords);
  for (const k of ["pork", "cannabis", "casino", "video game", "music", "cluster munition", "adult entertainment"]) assert.ok(all.includes(k), k);
});
