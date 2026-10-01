// src/screening/engine.js
//
// Screening-Engine nach AAOIFI SS 21 / SS 27 / SS 35.
//
// Reine Funktion: kein Netzwerk, keine Datenbank. Bekommt normalisierte Daten
// (./providers/model.js), manuelle Prüfungen und Parameter, gibt ein
// vollständiges, nachvollziehbares Ergebnis zurück. Läuft im Cron (Server)
// und kann bei Bedarf auch im Browser genutzt werden.
//
// Reihenfolge: A → B → C → D (Aktien) bzw. G (ETFs), danach H.
// Alle Stufen werden immer berechnet, auch wenn eine frühere durchfällt,
// damit Nutzer alle Gründe sehen.
//
// Gesamtstatus (Rangfolge bestätigt):
//   1. Mindestens ein Kriterium belegt durchgefallen → nicht konform
//   2. Sonst: mindestens ein Kriterium ohne ausreichende Daten → nicht geprüft
//   3. Sonst → konform
// Fehlende Daten führen NIE zu „konform“.

import {
  DEFAULT_PARAMETERS,
  EXCLUDED_PRODUCT_TYPES,
  PARAMETERS_VERSION,
  resolveParameters,
} from "./parameters.js";
import {
  PROHIBITED_INCOME_CATEGORIES,
  classifyIndustry,
  isGoldSilverCurrencyDealer,
  isShellCompany,
} from "./industryRules.js";

export const ENGINE_VERSION = "1.1.1";

export const STATUS = {
  CONFORM: "konform",
  NON_CONFORM: "nicht_konform",
  NOT_CHECKED: "nicht_geprueft",
};

export const STATUS_LABELS = {
  konform: "konform nach AAOIFI SS 21",
  nicht_konform: "nicht konform nach AAOIFI SS 21",
  nicht_geprueft: "nicht geprüft",
};

export const RESULT = {
  PASS: "pass",
  FAIL: "fail",
  NOT_CHECKED: "not_checked",
  DISABLED: "disabled", // abgeschaltete Ableitungsregel — ohne Statuswirkung
  NOT_APPLICABLE: "not_applicable", // gilt für diese Wertpapierart nicht
};

// ------------------------------------------------------------------ Helfer

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const round = (x, d = 2) => (isNum(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

function makeCriterion(id, name, source, extra = {}) {
  return {
    id,
    name,
    source,
    derivation: false,
    parameterRefs: [],
    result: RESULT.NOT_CHECKED,
    reason: null,
    checks: [],
    review: null,
    flags: [],
    ...extra,
  };
}

/** Kombiniert Einzelprüfungen: fail > not_checked > pass. */
function combine(checks) {
  if (checks.some((c) => c.result === RESULT.FAIL)) return RESULT.FAIL;
  if (checks.length === 0 || checks.some((c) => c.result === RESULT.NOT_CHECKED)) return RESULT.NOT_CHECKED;
  return RESULT.PASS;
}

/** Summe von Feldern; fehlt eines → null + Liste der fehlenden Felder. */
function sumFields(obj, keys) {
  const missing = keys.filter((k) => !isNum(obj?.[k]));
  if (missing.length) return { value: null, missing };
  return { value: keys.reduce((a, k) => a + obj[k], 0), missing: [] };
}

/**
 * Eine Kennzahl gegen einen Grenzwert.
 * comparator "<=" (Höchstwert) oder ">=" (Mindestwert). Verglichen wird der
 * ungerundete Wert; angezeigt wird auf 2 Nachkommastellen gerundet.
 */
function ratioCheck({ basis, periodEnd, numerator, denominator, limit, comparator, missing = [], label }) {
  const base = { basis, periodEnd: periodEnd ?? null, label, limit, comparator, value: null, distanceToLimit: null };
  if (!periodEnd) return { ...base, result: RESULT.NOT_CHECKED, reason: `Kein ${basisLabel(basis)} vorhanden` };
  if (missing.length) return { ...base, result: RESULT.NOT_CHECKED, reason: `Datenfeld fehlt: ${missing.join(", ")}` };
  if (!isNum(numerator) || !isNum(denominator) || denominator <= 0) {
    return { ...base, result: RESULT.NOT_CHECKED, reason: "Bezugsgröße fehlt oder ist nicht positiv" };
  }
  const raw = (numerator / denominator) * 100;
  const pass = comparator === "<=" ? raw <= limit : raw >= limit;
  return {
    ...base,
    value: round(raw),
    // Reine Info ohne Statuswirkung: Abstand zum Grenzwert in Prozentpunkten
    // (positiv = innerhalb, negativ = überschritten).
    distanceToLimit: round(comparator === "<=" ? limit - raw : raw - limit),
    result: pass ? RESULT.PASS : RESULT.FAIL,
    reason: null,
  };
}

function basisLabel(basis) {
  return { annual: "Jahresabschluss", quarter: "Quartalsabschluss", ttm: "Satz von vier Quartalen" }[basis] || "Abschluss";
}

/**
 * Letzte manuelle Prüfung eines Kriteriums. Gültig nur, wenn sie auf dem
 * aktuell maßgeblichen Jahresabschluss beruht (läuft bei neuem Abschluss ab).
 */
function pickReview(reviews, criterion, currentAnnualBasis) {
  const list = (reviews || [])
    .filter((r) => r.criterion === criterion)
    .sort((a, b) => new Date(b.reviewedAt) - new Date(a.reviewedAt));
  const latest = list[0] || null;
  if (!latest) return { review: null, state: "missing" };
  if (!currentAnnualBasis || latest.basisAnnualPeriodEnd !== currentAnnualBasis) {
    return { review: latest, state: "expired" };
  }
  return { review: latest, state: "valid" };
}

function reviewInfo(picked) {
  if (!picked.review) return null;
  const r = picked.review;
  return {
    state: picked.state,
    result: r.result,
    sourceUrl: r.sourceUrl ?? null,
    sourceNote: r.sourceNote ?? null,
    reviewer: r.reviewer ?? null,
    reviewedAt: r.reviewedAt ?? null,
    basisAnnualPeriodEnd: r.basisAnnualPeriodEnd ?? null,
  };
}

/** Übersetzt eine manuelle Prüfung in ein Kriteriumsergebnis. */
function applyReview(c, picked, { missingText, expiredText, failText, unclearText }) {
  c.review = reviewInfo(picked);
  if (picked.state === "missing") {
    c.result = RESULT.NOT_CHECKED;
    c.reason = missingText;
  } else if (picked.state === "expired") {
    c.result = RESULT.NOT_CHECKED;
    c.reason = expiredText || "Manuelle Prüfung abgelaufen (neuer Jahresabschluss) — erneute Bestätigung nötig";
  } else if (picked.review.result === "pass") {
    c.result = RESULT.PASS;
  } else if (picked.review.result === "fail") {
    c.result = RESULT.FAIL;
    c.reason = failText;
  } else {
    c.result = RESULT.NOT_CHECKED;
    c.reason = unclearText || "Manuelle Prüfung: unklar";
  }
  return c;
}

// ------------------------------------------------------------ Universum (9)

export function evaluateUniverse(security) {
  const reasons = [];
  if (!security?.isin) reasons.push("ISIN fehlt");
  if (security?.assetType === "etf") {
    if (security.isUcits !== true) reasons.push("Kein UCITS-ETF (oder nicht belegt)");
    if (security.hasKid !== true) reasons.push("Kein Basisinformationsblatt (oder nicht belegt)");
  } else if (!Array.isArray(security?.germanVenues) || security.germanVenues.length === 0) {
    reasons.push("Kein deutscher Handelsplatz belegt");
  }
  return {
    included: reasons.length === 0,
    reasons,
    isin: security?.isin ?? null,
    germanVenues: security?.germanVenues ?? [],
    checkedAt: security?.universeCheckedAt ?? null,
  };
}

// ---------------------------------------------------------- Stufe A

function stageA({ profile, reviews, annualBasis, p }) {
  const industry = profile?.industry ?? null;
  const cls = classifyIndustry(industry, profile?.description ?? "");

  // A1 Kerngeschäft
  const a1 = makeCriterion("A1", "Kerngeschäft erlaubt", "SS 21, 2/1; SS 21, 3/2", {
    parameterRefs: ["industryGroups"],
  });
  a1.checks.push({ label: "Branche", value: industry, classification: cls.class, group: cls.group?.id ?? null });
  if (cls.group?.interpretation) a1.flags.push("auslegungsfrage");
  if (cls.class === "exclude") {
    a1.result = RESULT.FAIL;
    a1.reason = `Verbotene Haupttätigkeit: ${cls.why}`;
    a1.review = reviewInfo(pickReview(reviews, "A1", annualBasis));
  } else if (cls.class === "review") {
    applyReview(a1, pickReview(reviews, "A1", annualBasis), {
      missingText: cls.why,
      failText: `Manuelle Prüfung: verbotene Haupttätigkeit (${cls.group?.label ?? "siehe Quelle"})`,
    });
  } else if (cls.class === "unknown") {
    a1.result = RESULT.NOT_CHECKED;
    a1.reason = "Branche unbekannt";
  } else {
    // allow und b3_focus: kein Branchenausschluss
    a1.result = RESULT.PASS;
    a1.reason = cls.class === "b3_focus" ? cls.why : `Branche zulässig: ${industry}`;
    if (cls.class === "b3_focus") a1.flags.push("b3_schwerpunkt");
  }

  // A2 Unternehmenszweck laut Satzung (manuell)
  const a2 = makeCriterion("A2", "Unternehmenszweck laut Satzung", "SS 21, 3/4/1", {
    parameterRefs: ["articlesReview", "manualReviewExpiry"],
  });
  applyReview(a2, pickReview(reviews, "A2", annualBasis), {
    missingText: "Unternehmenszweck noch nicht manuell geprüft",
    failText: "Satzung nennt Zinsgeschäfte oder verbotene Waren als Unternehmensziel",
  });

  // A3 Gold-, Silber- oder Währungshandel
  const a3 = makeCriterion("A3", "Kein Gold-, Silber- oder Währungshändler", "SS 21, 3/19", {
    parameterRefs: ["goldSilverCurrencyDealers"],
  });
  const a3Review = pickReview(reviews, "A3", annualBasis);
  const dealerByIndustry = isGoldSilverCurrencyDealer(industry);
  const dealerByReview = a3Review.state === "valid" && a3Review.review.result === "fail";
  a3.review = reviewInfo(a3Review);
  if (!industry && a3Review.state !== "valid") {
    a3.result = RESULT.NOT_CHECKED;
    a3.reason = "Branche unbekannt";
  } else if (dealerByIndustry || dealerByReview) {
    a3.flags.push("sarf");
    if (p.goldSilverCurrencyDealers === "exclude") {
      a3.result = RESULT.FAIL;
      a3.reason = "Kerngeschäft ist Handel mit Gold, Silber oder Währungen (Sarf-Regeln)";
    } else {
      a3.result = RESULT.PASS;
      a3.reason = "Markiert: Handel mit Gold, Silber oder Währungen (Sarf-Regeln)";
    }
  } else {
    a3.result = RESULT.PASS;
  }

  return [a1, a2, a3];
}

// ---------------------------------------------------------- Stufe B

function debtCheck(s, basis, p) {
  const b = s?.balance || {};
  const keys = ["interestBearingDebtExLeases", ...(p.leaseLiabilitiesAsDebt ? ["leaseLiabilities"] : [])];
  const { value, missing } = sumFields(b, keys);
  if (!isNum(s?.marketCapAtPeriodEnd)) missing.push("marketCapAtPeriodEnd");
  return ratioCheck({
    basis,
    periodEnd: s?.periodEnd,
    numerator: value,
    denominator: s?.marketCapAtPeriodEnd,
    limit: p.debtMaxPct,
    comparator: "<=",
    missing,
    label: "Zinstragende Schulden / Marktkapitalisierung",
  });
}

function depositsCheck(s, basis, p) {
  const b = s?.balance || {};
  let value;
  let missing;
  if (p.allCashInterestBearing) {
    ({ value, missing } = sumFields(b, ["cash", "shortTermInvestments", "longTermInvestments"]));
    // „außer die Daten belegen das Gegenteil“
    if (value !== null && isNum(b.nonInterestBearingCashConfirmed)) {
      value = Math.max(0, value - b.nonInterestBearingCashConfirmed);
    }
  } else {
    // Alternative: nur ausdrücklich als verzinslich ausgewiesene Posten
    ({ value, missing } = sumFields(b, ["explicitInterestBearingDeposits"]));
  }
  if (!isNum(s?.marketCapAtPeriodEnd)) missing.push("marketCapAtPeriodEnd");
  return ratioCheck({
    basis,
    periodEnd: s?.periodEnd,
    numerator: value,
    denominator: s?.marketCapAtPeriodEnd,
    limit: p.depositsMaxPct,
    comparator: "<=",
    missing,
    label: "Zinstragende Einlagen und Wertpapiere / Marktkapitalisierung",
  });
}

/**
 * Verbotene Segmentumsätze einer Periode aus der Prüfung B3_SEGMENTS.
 * details.prohibitedRevenueByPeriod["annual:JJJJ-MM-TT" | "quarter:JJJJ-MM-TT"]
 *   = Zahl (Summe) oder Objekt nach Kategorie, z. B. { music: 120, derivatives: 40 }.
 * Kategorien siehe PROHIBITED_INCOME_CATEGORIES. Schlüssel mit Periodenart,
 * weil Q4 und Geschäftsjahr oft dasselbe Enddatum haben.
 */
function segmentAmount(review, s) {
  const key = `${s.periodType}:${s.periodEnd}`;
  const raw = review.details?.prohibitedRevenueByPeriod?.[key];
  if (isNum(raw)) return { value: raw, categories: [], missing: [] };
  if (raw && typeof raw === "object") {
    const unknown = Object.keys(raw).filter((k) => !PROHIBITED_INCOME_CATEGORIES[k]);
    const invalid = Object.entries(raw).filter(([, v]) => !isNum(v)).map(([k]) => k);
    if (unknown.length) return { value: null, categories: [], missing: [`unbekannte Einnahmekategorie: ${unknown.join(", ")} (${key})`] };
    if (invalid.length) return { value: null, categories: [], missing: [`Betrag fehlt: ${invalid.join(", ")} (${key})`] };
    const categories = Object.entries(raw).filter(([, v]) => v > 0).map(([k]) => k);
    return { value: Object.values(raw).reduce((a, v) => a + v, 0), categories, missing: [] };
  }
  return { value: null, categories: [], missing: [`verbotener Segmentumsatz für ${key}`] };
}

/**
 * Verbotene Einnahmen einer Periode = Zinserträge (GuV-Zeile) + verbotene
 * Segmentumsätze aus der manuellen Prüfung B3_SEGMENTS:
 *   pass    → keine verbotenen Segmente (0)
 *   fail    → Beträge je Periode müssen vorliegen (siehe segmentAmount)
 *   unclear → nicht geprüft
 */
function prohibitedIncomeFor(s, segmentReview, p) {
  if (!s) return { value: null, missing: ["Abschluss"], categories: [] };
  const missing = [];
  let categories = [];
  const interest = s.income?.interestIncome;
  if (!isNum(interest)) missing.push("interestIncome");

  let segment = 0;
  if (p.requireSegmentReview) {
    if (segmentReview.state !== "valid") {
      missing.push(segmentReview.state === "expired" ? "Segmentprüfung (abgelaufen)" : "Segmentprüfung");
    } else if (segmentReview.review.result === "pass") {
      segment = 0;
    } else if (segmentReview.review.result === "fail") {
      const seg = segmentAmount(segmentReview.review, s);
      if (seg.value === null) missing.push(...seg.missing);
      else {
        segment = seg.value;
        categories = seg.categories;
      }
    } else {
      missing.push("Segmentprüfung: unklar");
    }
  }
  return missing.length
    ? { value: null, missing, categories }
    : { value: interest + segment, missing: [], categories };
}

/**
 * Nenner für B3. "total_income" = Umsatz + Zinserträge + sonstige Erträge
 * (Wortlaut „total income“, SS 21, 3/4/4); "revenue" = nur Umsatz.
 */
function incomeDenominator(s, p) {
  const keys = p.prohibitedIncomeDenominator === "total_income" ? ["revenue", "interestIncome", "otherIncome"] : ["revenue"];
  return sumFields(s?.income || {}, keys);
}

function stageB({ annual, quarters, reviews, annualBasis, p }) {
  const latestQ = quarters[0] || null;

  // B1
  const b1 = makeCriterion("B1", "Zinstragende Schulden", "SS 21, 3/4/2", {
    parameterRefs: ["debtMaxPct", "marketCapBasis", "leaseLiabilitiesAsDebt", "balanceBasis"],
  });
  b1.checks = [debtCheck(annual, "annual", p), debtCheck(latestQ, "quarter", p)];
  b1.result = combine(b1.checks);

  // B2
  const b2 = makeCriterion("B2", "Zinstragende Einlagen", "SS 21, 3/4/3", {
    parameterRefs: ["depositsMaxPct", "marketCapBasis", "allCashInterestBearing", "balanceBasis"],
  });
  b2.checks = [depositsCheck(annual, "annual", p), depositsCheck(latestQ, "quarter", p)];
  b2.result = combine(b2.checks);

  // B3 (inkl. B5 alle Quellen, B6 unklar → nicht geprüft)
  const b3 = makeCriterion("B3", "Verbotene Einnahmen", "SS 21, 3/4/4", {
    parameterRefs: [
      "prohibitedIncomeMaxPct",
      "prohibitedIncomeBasis",
      "prohibitedIncomeSources",
      "requireSegmentReview",
      "prohibitedIncomeDenominator",
      "manualReviewExpiry",
    ],
  });
  const segReview = pickReview(reviews, "B3_SEGMENTS", annualBasis);
  b3.review = reviewInfo(segReview);

  // Jahresabschluss
  const annualProhibited = prohibitedIncomeFor(annual, segReview, p);
  const annualDen = incomeDenominator(annual, p);
  b3.checks.push(
    ratioCheck({
      basis: "annual",
      periodEnd: annual?.periodEnd,
      numerator: annualProhibited.value,
      denominator: annualDen.value,
      limit: p.prohibitedIncomeMaxPct,
      comparator: "<=",
      missing: [...annualProhibited.missing, ...annualDen.missing],
      label: "Verbotene Einnahmen / Gesamteinnahmen (Jahr)",
    })
  );

  // Letzte vier Quartale zusammen
  let ttmNum = 0;
  let ttmDen = 0;
  const ttmMissing = [];
  if (quarters.length < 4) ttmMissing.push(`nur ${quarters.length} von 4 Quartalen vorhanden`);
  for (const q of quarters.slice(0, 4)) {
    const pi = prohibitedIncomeFor(q, segReview, p);
    if (pi.value === null) ttmMissing.push(...pi.missing.map((m) => `${m} (${q.periodEnd})`));
    else ttmNum += pi.value;
    const den = incomeDenominator(q, p);
    if (den.value !== null) ttmDen += den.value;
    else ttmMissing.push(...den.missing.map((m) => `${m} (${q.periodEnd})`));
  }
  b3.checks.push(
    ratioCheck({
      basis: "ttm",
      periodEnd: latestQ?.periodEnd,
      numerator: ttmNum,
      denominator: ttmDen,
      limit: p.prohibitedIncomeMaxPct,
      comparator: "<=",
      missing: [...new Set(ttmMissing)],
      label: "Verbotene Einnahmen / Gesamteinnahmen (letzte 4 Quartale)",
    })
  );
  b3.result = combine(b3.checks);

  // Welche Kategorien verbotener Einnahmen wurden erfasst? Auslegungsfragen kennzeichnen.
  const cats = new Set(annualProhibited.categories);
  for (const q of quarters.slice(0, 4)) prohibitedIncomeFor(q, segReview, p).categories.forEach((c) => cats.add(c));
  b3.categories = [...cats].map((id) => ({ id, ...PROHIBITED_INCOME_CATEGORIES[id] }));
  if (b3.categories.some((c) => c.interpretation)) b3.flags.push("auslegungsfrage");

  if (b3.result === RESULT.NOT_CHECKED && !b3.reason) {
    b3.reason = "Mindestens eine Einnahmequelle nicht klar ausgewiesen oder nicht geprüft (SS 21, 3/4/4)";
  }

  return [b1, b2, b3];
}

// ---------------------------------------------------------- Stufe C

function realAssetsCheck(s, basis, p) {
  const b = s?.balance || {};
  // Forderungen aus dem laufenden Geschäft zählen nach SS 59, 8/1 nicht dagegen
  const deductReceivables = !p.operatingReceivablesCountAsReal;
  const needed = ["totalAssets", "cash", "shortTermInvestments", "longTermInvestments"];
  if (deductReceivables) needed.push("netReceivables");
  if (!p.goodwillCountsAsRealAsset) needed.push("goodwill");
  if (!p.intangiblesCountAsRights) needed.push("intangiblesExGoodwill");
  const missing = needed.filter((k) => !isNum(b[k]));
  let real = null;
  if (!missing.length) {
    real = b.totalAssets - b.cash - b.shortTermInvestments - b.longTermInvestments;
    if (deductReceivables) real -= b.netReceivables;
    if (!p.goodwillCountsAsRealAsset) real -= b.goodwill;
    if (!p.intangiblesCountAsRights) real -= b.intangiblesExGoodwill;
  }
  return ratioCheck({
    basis,
    periodEnd: s?.periodEnd,
    numerator: real,
    denominator: b.totalAssets,
    limit: p.realAssetsMinPct,
    comparator: ">=",
    missing,
    label: "Reale Vermögenswerte und Rechte / Gesamtaktiva",
  });
}

function stageC({ annual, quarters, profile, p }) {
  const latestQ = quarters[0] || null;

  const c1 = makeCriterion("C1", "Reale Vermögenswerte", "SS 21, 3/19; Fußnote zu SS 21, 3/1", {
    parameterRefs: ["realAssetsMinPct", "realAssetsValuation", "operatingReceivablesCountAsReal", "goodwillCountsAsRealAsset", "intangiblesCountAsRights", "balanceBasis"],
  });
  c1.checks = [realAssetsCheck(annual, "annual", p), realAssetsCheck(latestQ, "quarter", p)];
  c1.result = combine(c1.checks);

  // C2 / C3: ohne eigenen neuen Grenzwert. Belegt durch C1 (reale Werte
  // vorhanden) oder ausgeschlossen, wenn Branche = Shell Company (SPAC).
  const shell = isShellCompany(profile?.industry);
  const c2 = makeCriterion("C2", "Kein Nur-Cash-Unternehmen", "SS 21, 3/17");
  const c3 = makeCriterion("C3", "Kein Nur-Forderungs-Unternehmen", "SS 21, 3/18; SS 59, 8/1 und 8/3");
  if (shell) {
    c2.result = RESULT.FAIL;
    c2.reason = "Unternehmen ohne Geschäftsbetrieb (z. B. SPAC vor Übernahme) — Handel nur zum Nennwert zulässig";
  } else if (c1.result === RESULT.PASS) {
    c2.result = RESULT.PASS;
    c2.reason = "Reale Vermögenswerte nach C1 vorhanden";
  } else {
    c2.result = RESULT.NOT_CHECKED;
    c2.reason = "Nicht belegbar, da C1 nicht bestanden oder nicht geprüft";
  }
  if (c1.result === RESULT.PASS) {
    c3.result = RESULT.PASS;
    c3.reason = "Reale Vermögenswerte nach C1 vorhanden";
  } else {
    c3.result = RESULT.NOT_CHECKED;
    c3.reason = "Nicht belegbar, da C1 nicht bestanden oder nicht geprüft";
  }

  return [c1, c2, c3];
}

// ---------------------------------------------------------- Stufe D

function stageD({ security }) {
  const sc = security?.shareClass ?? null;

  const d1 = makeCriterion("D1", "Keine Vorzugsaktie mit finanziellem Vorrang", "SS 21, 2/6");
  if (!sc) {
    d1.result = RESULT.NOT_CHECKED;
    d1.reason = "Aktiengattung nicht erfasst";
  } else if (sc === "preferred_financial_priority") {
    d1.result = RESULT.FAIL;
    d1.reason = "Vorzugsaktie mit Vorrang bei Gewinn oder Liquidation";
  } else {
    d1.result = RESULT.PASS;
  }

  const d2 = makeCriterion("D2", "Keine Tamattu'-Aktie", "SS 21, 2/7");
  if (!sc) {
    d2.result = RESULT.NOT_CHECKED;
    d2.reason = "Aktiengattung nicht erfasst";
  } else if (sc === "tamattu") {
    d2.result = RESULT.FAIL;
    d2.reason = "Tamattu'-Aktie";
  } else {
    d2.result = RESULT.PASS;
  }

  const d3 = makeCriterion("D3", "Keine Anleihe", "SS 21, 4; SS 21, 5");
  if (security?.productType === "bond") {
    d3.result = RESULT.FAIL;
    d3.reason = "Anleihe — Alternative: Sukuk (SS 21, 6)";
  } else {
    d3.result = RESULT.PASS;
  }

  return [d1, d2, d3];
}

// ---------------------------------------------------------- Stufe G (ETFs)

function stageG({ security, holdings, reviews, p }) {
  const fundBasis = security?.fundAnnualReportDate ?? null;
  const out = [];

  // G1 Look-through
  const g1 = makeCriterion("G1", "Look-through: alle enthaltenen Aktien konform", "SS 21; SS 27 [Ableitung]", {
    derivation: true,
    parameterRefs: ["ruleG1LookThrough"],
  });
  if (!p.ruleG1LookThrough) {
    g1.result = RESULT.DISABLED;
  } else if (!Array.isArray(holdings) || holdings.length === 0) {
    g1.result = RESULT.NOT_CHECKED;
    g1.reason = "Keine Holdings-Daten";
  } else {
    const totalWeight = holdings.reduce((a, h) => a + (isNum(h.weight) ? h.weight : 0), 0);
    const failed = holdings.filter((h) => h.status === STATUS.NON_CONFORM);
    const unchecked = holdings.filter((h) => h.status !== STATUS.NON_CONFORM && h.status !== STATUS.CONFORM);
    const conformWeight = holdings.filter((h) => h.status === STATUS.CONFORM).reduce((a, h) => a + (h.weight || 0), 0);
    g1.checks.push({
      label: "Abdeckung",
      holdingsCount: holdings.length,
      totalWeight: round(totalWeight),
      conformWeight: round(conformWeight),
      failedCount: failed.length,
      uncheckedCount: unchecked.length,
      asOf: holdings[0]?.asOf ?? null,
    });
    if (failed.length) {
      g1.result = RESULT.FAIL;
      g1.reason = `${failed.length} enthaltene Aktie(n) nicht konform`;
    } else if (unchecked.length) {
      g1.result = RESULT.NOT_CHECKED;
      g1.reason = `${unchecked.length} enthaltene Aktie(n) nicht geprüft`;
    } else {
      g1.result = RESULT.PASS;
    }
  }
  out.push(g1);

  // G2–G4: manuell aus Prospekt / KID / Jahresbericht, unabhängig vom Look-through
  const manual = [
    ["G2", "Keine synthetische Replikation", "SS 21, 3/14; SS 27, 6/1 [Ableitung]", "ruleG2Synthetic", "Replikationsmethode noch nicht geprüft", "Synthetische Replikation über Swaps"],
    ["G3", "Keine Wertpapierleihe", "SS 21, 3/9; SS 21, 3/15 [Ableitung]", "ruleG3SecuritiesLending", "Wertpapierleihe noch nicht geprüft", "Fonds verleiht Wertpapiere"],
    ["G4", "Keine Derivate im Fonds", "SS 21, 3/12–3/14; SS 27, 6/2–6/3 [Ableitung]", "ruleG4Derivatives", "Derivateeinsatz noch nicht geprüft", "Fonds setzt Derivate ein"],
  ];
  for (const [id, name, source, param, missingText, failText] of manual) {
    const c = makeCriterion(id, name, source, { derivation: true, parameterRefs: [param, "manualReviewExpiry"] });
    if (!p[param]) {
      c.result = RESULT.DISABLED;
      c.review = reviewInfo(pickReview(reviews, id, fundBasis));
    } else {
      applyReview(c, pickReview(reviews, id, fundBasis), {
        missingText,
        failText,
        expiredText: "Manuelle Prüfung abgelaufen (neuer Fonds-Jahresbericht) — erneute Bestätigung nötig",
      });
    }
    out.push(c);
  }

  return out;
}

// ---------------------------------------------------------- Stufe H

function stageH({ security }) {
  const h = makeCriterion("H", "Kein ausgeschlossenes Produkt", "SS 21, 3/5–3/15; SS 27, 6/1–6/3");
  const type = security?.productType ?? null;
  if (!type) {
    h.result = RESULT.NOT_CHECKED;
    h.reason = "Produkttyp nicht erfasst";
  } else if (EXCLUDED_PRODUCT_TYPES[type]) {
    h.result = RESULT.FAIL;
    h.reason = `Ausgeschlossenes Produkt (${type}), ${EXCLUDED_PRODUCT_TYPES[type]}`;
    if (EXCLUDED_PRODUCT_TYPES[type].includes("[Ableitung]")) h.derivation = true;
  } else {
    h.result = RESULT.PASS;
  }
  return [h];
}

// ---------------------------------------------------------- F Purification

function purification({ quarters, reviews, annualBasis, p }) {
  const segReview = pickReview(reviews, "B3_SEGMENTS", annualBasis);
  const periods = quarters.slice(0, 4).map((q) => {
    const pi = prohibitedIncomeFor(q, segReview, p);
    const shares = q.sharesOutstanding;
    const entry = {
      periodEnd: q.periodEnd, // Stichtag (F2)
      currency: q.currency,
      prohibitedIncome: pi.value,
      sharesOutstanding: isNum(shares) ? shares : null,
      sharesBasis: q.sharesBasis,
      amountPerShare: null,
      amountPerShareEur: null,
      ratePctOfPrice: null, // Grundlage für G5 bei ETFs
      calculable: false,
      reason: null,
    };
    if (pi.value === null) {
      entry.reason = `Nicht berechenbar: ${pi.missing.join(", ")}`;
    } else if (!isNum(shares) || shares <= 0) {
      entry.reason = "Nicht berechenbar: Anzahl Aktien fehlt";
    } else {
      entry.calculable = true;
      entry.amountPerShare = round(pi.value / shares, 6);
      if (isNum(q.fxToEurAtPeriodEnd)) entry.amountPerShareEur = round((pi.value / shares) * q.fxToEurAtPeriodEnd, 6);
      if (isNum(q.priceAtPeriodEnd) && q.priceAtPeriodEnd > 0) {
        entry.ratePctOfPrice = round(((pi.value / shares) / q.priceAtPeriodEnd) * 100, 6);
      }
    }
    return entry;
  });
  return {
    method: p.purificationFrequency,
    source: "SS 21, 3/4/6/1–3/4/6/6",
    parameterRefs: ["purificationFrequency", "prohibitedIncomeSources"],
    // F3: bewusst unabhängig von Dividende, Gewinn oder Verlust berechnet.
    independentOfDividend: true,
    periods,
  };
}

/**
 * G5: Reinigungsquote eines ETFs in % des Kurswerts, ausgegeben je 1.000 €.
 *   Quote = Σ (Gewicht × Reinigungsquote der Aktie)  [Hochrechnung bei Lücken]
 *         + fondseigene Zinserträge in % des Fondsvermögens
 * Fondseigene Zinserträge kommen aus der manuellen Prüfung G5_FUND_INCOME
 * (details.interestIncomePctOfAssets, aus dem Fonds-Jahresbericht).
 */
function etfPurification({ security, holdings, reviews, p }) {
  const res = {
    method: p.ruleG5Purification ? "weighted_rate" : "disabled",
    derivation: true,
    source: "SS 21, 3/4/6/4 [Ableitung]",
    parameterRefs: ["ruleG5Purification", "etfFundInterestIncome", "etfPurificationMinCoveragePct", "etfPurificationUncovered"],
    status: "nicht_geprueft",
    coveragePct: null,
    minCoveragePct: p.etfPurificationMinCoveragePct,
    holdingsRatePct: null,
    fundInterestRatePct: null,
    fundInterestReview: null,
    ratePctOfValue: null,
    amountPer1000Eur: null,
    reason: null,
  };
  if (!p.ruleG5Purification) {
    res.status = "deaktiviert";
    return res;
  }
  if (!Array.isArray(holdings) || !holdings.length) {
    res.reason = "Keine Holdings-Daten";
    return res;
  }

  const totalWeight = holdings.reduce((a, h) => a + (isNum(h.weight) ? h.weight : 0), 0);
  const covered = holdings.filter((h) => isNum(h.weight) && isNum(h.purificationRate));
  const coveredWeight = covered.reduce((a, h) => a + h.weight, 0);
  res.coveragePct = totalWeight > 0 ? round((coveredWeight / totalWeight) * 100) : 0;

  const reasons = [];
  if (res.coveragePct < p.etfPurificationMinCoveragePct) {
    reasons.push(`Abdeckung ${res.coveragePct} % unter Mindestabdeckung ${p.etfPurificationMinCoveragePct} %`);
  } else {
    const weighted = covered.reduce((a, h) => a + (h.weight / 100) * h.purificationRate, 0);
    const scale = p.etfPurificationUncovered === "extrapolate" && coveredWeight > 0 ? totalWeight / coveredWeight : 1;
    res.holdingsRatePct = round(weighted * scale, 6);
  }

  if (p.etfFundInterestIncome) {
    const picked = pickReview(reviews, "G5_FUND_INCOME", security?.fundAnnualReportDate ?? null);
    res.fundInterestReview = reviewInfo(picked);
    const v = picked.review?.details?.interestIncomePctOfAssets;
    if (picked.state !== "valid") {
      reasons.push(picked.state === "expired" ? "Fondseigene Zinserträge: Prüfung abgelaufen" : "Fondseigene Zinserträge noch nicht erfasst");
    } else if (!isNum(v)) {
      reasons.push("Fondseigene Zinserträge: Wert fehlt in der Prüfung");
    } else {
      res.fundInterestRatePct = v;
    }
  } else {
    res.fundInterestRatePct = 0;
  }

  if (reasons.length) {
    res.reason = reasons.join("; ");
    return res;
  }
  const rate = res.holdingsRatePct + res.fundInterestRatePct;
  res.ratePctOfValue = round(rate, 6);
  res.amountPer1000Eur = round(rate * 10, 4); // rate % von 1.000 €
  res.status = "berechnet";
  return res;
}

// ---------------------------------------------------------- I Zakat

function zakat({ annual, quarters, p }) {
  // Basis: jüngster verfügbarer Abschluss
  const s = quarters[0] || annual || null;
  const out = {
    source: "SS 35, 4/2/4; SS 35, 5/3/4/13",
    parameterRefs: ["zakatDeductLiabilities", "zakatReceivablesField", "zakatFallback", "zakatCalculator"],
    periodEnd: s?.periodEnd ?? null,
    currency: s?.currency ?? null,
    longTerm: {
      perShare: null,
      perShareWithLiabilitiesDeducted: null, // nur Info
      fallbackUsed: false,
      calculable: false,
      reason: null,
    },
    // I2: Handelsbasis = Marktwert je Aktie am Fälligkeitstag des Nutzers.
    // Wird im Rechner mit dem Kurs dieses Tages ermittelt; hier nur der
    // Kurs zum Bilanzstichtag als Referenz.
    trading: { basis: "market_value_on_due_date", priceAtPeriodEnd: s?.priceAtPeriodEnd ?? null },
    // I4: keine Abzüge für Kursverluste — es gibt bewusst keinen solchen Parameter.
    calculator: p.zakatCalculator,
  };
  if (!s) {
    out.longTerm.reason = "Kein Abschluss vorhanden";
    return out;
  }
  const b = s.balance || {};
  const shares = s.sharesOutstanding;
  if (!isNum(shares) || shares <= 0) {
    out.longTerm.reason = "Anzahl Aktien fehlt";
    return out;
  }
  const { value: zakatable, missing } = sumFields(b, ["cash", "netReceivables", "inventory"]);
  if (zakatable === null) {
    out.longTerm.reason = `Datenfeld fehlt: ${missing.join(", ")}`;
    return out;
  }
  if (zakatable > 0) {
    const base = p.zakatDeductLiabilities && isNum(b.currentLiabilities) ? zakatable - b.currentLiabilities : zakatable;
    out.longTerm.perShare = round(base / shares, 6);
    out.longTerm.calculable = true;
    if (isNum(b.currentLiabilities)) {
      out.longTerm.perShareWithLiabilitiesDeducted = round(Math.max(0, zakatable - b.currentLiabilities) / shares, 6);
    }
    return out;
  }
  // I3 Fallback: Nettogewinn der Periode minus Ausschüttungen der Periode
  const ni = s.income?.netIncome;
  const dist = s.income?.distributions;
  out.longTerm.fallbackUsed = true;
  if (!isNum(ni) || !isNum(dist)) {
    out.longTerm.reason = "Fallback nicht berechenbar: Nettogewinn oder Ausschüttungen fehlen";
    return out;
  }
  out.longTerm.perShare = round(Math.max(0, ni - dist) / shares, 6);
  out.longTerm.calculable = true;
  return out;
}

// ---------------------------------------------------------- Hauptfunktion

/**
 * @param {Object} input
 * @param {Object} input.security       Stammdaten (ticker, isin, assetType, productType, shareClass,
 *                                      isUcits, hasKid, germanVenues, universeCheckedAt, fundAnnualReportDate)
 * @param {Object|null} input.profile   neutrales Profil (Branche)
 * @param {Object|null} input.annual    neutraler Jahresabschluss
 * @param {Object[]} input.quarters     neutrale Quartale, neuestes zuerst
 * @param {Object[]} input.manualReviews
 * @param {Object[]} [input.holdings]   nur ETFs: { isin, weight, status, purificationRate, asOf }
 * @param {string}  [input.dataProvider]
 * @param {Object}  [input.parameters]  Überschreibungen { key: value }
 * @param {Date}    [input.now]
 */
export function screenSecurity(input) {
  const {
    security = {},
    profile = null,
    annual = null,
    quarters = [],
    manualReviews = [],
    holdings = [],
    dataProvider = null,
    parameters = {},
    now = new Date(),
  } = input;

  const p = resolveParameters(parameters);
  const qs = [...(quarters || [])].sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
  const isEtf = security.assetType === "etf";
  const annualBasis = annual?.periodEnd ?? null;

  let criteria;
  if (isEtf) {
    criteria = [...stageG({ security, holdings, reviews: manualReviews, p }), ...stageH({ security })];
  } else {
    criteria = [
      ...stageA({ profile, reviews: manualReviews, annualBasis, p }),
      ...stageB({ annual, quarters: qs, reviews: manualReviews, annualBasis, p }),
      ...stageC({ annual, quarters: qs, profile, p }),
      ...stageD({ security }),
      ...stageH({ security }),
    ];
  }

  const relevant = criteria.filter((c) => [RESULT.PASS, RESULT.FAIL, RESULT.NOT_CHECKED].includes(c.result));
  const failed = relevant.filter((c) => c.result === RESULT.FAIL).map((c) => c.id);
  const notChecked = relevant.filter((c) => c.result === RESULT.NOT_CHECKED).map((c) => c.id);
  const status = failed.length ? STATUS.NON_CONFORM : notChecked.length ? STATUS.NOT_CHECKED : STATUS.CONFORM;

  return {
    engineVersion: ENGINE_VERSION,
    parametersVersion: PARAMETERS_VERSION,
    screenedAt: now.toISOString(),
    ticker: security.ticker ?? null,
    isin: security.isin ?? null,
    assetType: isEtf ? "etf" : "stock",
    status,
    statusLabel: STATUS_LABELS[status],
    summary: { failed, notChecked },
    universe: evaluateUniverse(security),
    dataBasis: {
      provider: dataProvider,
      annualPeriodEnd: annual?.periodEnd ?? null,
      annualFilingDate: annual?.filingDate ?? null,
      annualAudited: annual?.audited ?? null,
      quarterPeriodEnd: qs[0]?.periodEnd ?? null,
      quarterFilingDate: qs[0]?.filingDate ?? null,
      quartersUsed: qs.slice(0, 4).map((q) => q.periodEnd),
      fundAnnualReportDate: isEtf ? security.fundAnnualReportDate ?? null : undefined,
    },
    criteria,
    purification: isEtf ? etfPurification({ security, holdings, reviews: manualReviews, p }) : purification({ quarters: qs, reviews: manualReviews, annualBasis, p }),
    zakat: isEtf ? { reason: "Zakat bei ETFs folgt den enthaltenen Werten (SS 35, 5/1/4/3) — Berechnung über Look-through folgt" } : zakat({ annual, quarters: qs, p }),
    parameters: p,
  };
}

export { DEFAULT_PARAMETERS };
