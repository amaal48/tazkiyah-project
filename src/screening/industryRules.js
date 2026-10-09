// src/screening/industryRules.js
//
// Branchenregeln für A1 (Kerngeschäft), A3 (Gold/Silber/Währung) und
// C2 (Nur-Cash-Unternehmen). Gruppen und Behandlung von der
// Projektinhaberin festgelegt (30.09.2026).
//
// Behandlungen:
//   exclude   — A1 nicht bestanden
//   review    — A1 nur mit gültiger manueller Prüfung, sonst „nicht geprüft“
//   b3_focus  — kein Branchenausschluss, A1 bestanden; verbotene Anteile
//               werden über die (für alle Aktien verpflichtende)
//               B3-Segmentprüfung erfasst — mit Hinweis für die Prüfung
//   allow     — A1 bestanden
//
// Grenzen der Automatik (wichtig für die Methodik-Seite):
//   Schweinefleisch, Pornografie/Erwachsenenunterhaltung, Drogen/Cannabis und
//   umstrittene Waffen haben keine eigene Branchenbezeichnung in den
//   Finanzdaten. Sie werden über Stichworte in der Unternehmensbeschreibung
//   zur manuellen A1-Prüfung markiert oder über die B3-Segmentprüfung erfasst.
//   Ein Stichworttreffer schließt nie automatisch aus.
//
// SIC-Codes (für SEC-Daten, siehe classifySic unten): sicCodes gelten mit der Behandlung der Gruppe,
// reviewSicCodes immer als manuelle Prüfung, interpretationSicCodes setzen zusätzlich „Auslegungsfrage“.
//
// Matching per Stichwort auf den kleingeschriebenen Branchennamen, damit
// yfinance-Namen („Credit Services“) und FMP-Namen („Financial - Credit
// Services“) gleichermaßen greifen.

// Gruppen für die Methodik-Seite. Reihenfolge = Prüfreihenfolge.
// Optionales Feld `decision` { date, text }: eigene Festlegung der Projektinhaberin zur
// Abgrenzung der Gruppe. Die Methodik-Seite zeigt sie als „Unsere Festlegung“ mit Datum.
// Nur Text für die Anzeige, ändert die Prüflogik nicht.
export const INDUSTRY_GROUPS = [
  {
    id: "alcohol",
    label: "Alkohol",
    handling: "exclude",
    basis: "Im Standard genannt",
    source: "SS 21, 2/1; SS 21, 3/2",
    rationale: "Herstellung und Vertrieb von Alkohol ist im Standard ausdrücklich als verbotene Haupttätigkeit genannt.",
    industryKeywords: ["brewer", "wineries", "distiller"],
    // 2084, 2085, 5813, 5921 stehen nicht in der aktuellen SEC-Liste, können aber bei älteren Einträgen vorkommen
    sicCodes: [2082, 2084, 2085, 5180, 5813, 5921],
  },
  {
    id: "pork",
    label: "Schweinefleisch",
    handling: "exclude",
    basis: "Im Standard genannt",
    source: "SS 21, 2/1; SS 21, 3/2",
    rationale:
      "Im Standard ausdrücklich genannt. Da es dafür keine eigene Branchenbezeichnung gibt, erfolgt der Ausschluss über die manuelle Prüfung des Kerngeschäfts; Lebensmittelunternehmen mit Schweinefleischanteil werden zusätzlich über B3 erfasst.",
    industryKeywords: [],
    descriptionKeywords: ["pork", "hog production", "swine"],
    // Fleischverarbeitung: nur manuelle Prüfung (2015 = Geflügel, Schweinefleischanteil im 10-K prüfen)
    reviewSicCodes: [[2011, 2015]],
  },
  {
    id: "riba",
    label: "Riba (konventionelle Banken, Versicherungen, Kreditgeber)",
    handling: "exclude",
    basis: "Im Standard genannt",
    source: "SS 21, 2/1; SS 21, 3/2",
    rationale:
      "SS 21, 2/1 nennt Riba-Geschäfte ausdrücklich als verbotene Haupttätigkeit. Konventionelle Banken, Versicherungen und Kreditgeber werden dieser Gruppe zugeordnet; Versicherungen stehen dort nicht wörtlich, ihr Geschäftsmodell beruht aber auf zinsbasierten Anlagen und Verträgen.",
    industryKeywords: ["bank", "insurance", "credit services", "mortgage"],
    // Banken, Kreditgeber, Versicherer (inkl. 6324 Krankenversicherer), Versicherungsmakler
    sicCodes: [[6021, 6099], [6111, 6163], [6311, 6399], 6411],
    // Auslegungsfrage (Festlegung 09.10.2026): Krankenversicherer und Versicherungsmakler
    interpretationSicCodes: [6321, 6324, 6411],
    // Finanzdienstleistungen allgemein, Holdings, Investoren: je Firma prüfen
    // (Kreditgeber/Kartenaussteller → Ausschluss, sonst B3). 6719 steht nicht in der aktuellen SEC-Liste.
    reviewSicCodes: [6199, 6719, 6799],
    decision: {
      date: "2026-10-09",
      interpretation: true,
      text:
        "Krankenversicherer und Versicherungsmakler werden wie Versicherer behandelt und ausgeschlossen. Makler versichern nicht selbst, ihr Geschäft ist aber die Vermittlung konventioneller Versicherungen.",
    },
  },
  {
    id: "gambling",
    label: "Glücksspiel",
    handling: "exclude",
    basis: "Unter „und Ähnliches“",
    source: "SS 21, 2/1; SS 21, 3/2",
    rationale: "Fällt unter die im Standard offen formulierte Liste verbotener Tätigkeiten („und Ähnliches“).",
    industryKeywords: ["gambling", "casino"],
    // Nur für die 10-K-Stichwortsuche (A1-Hinweise), nicht für die Profilprüfung
    textKeywords: ["casino", "gambling", "sports betting", "sportsbook"],
  },
  {
    id: "adult",
    label: "Pornografie und Erwachsenenunterhaltung",
    handling: "exclude",
    basis: "Unter „und Ähnliches“",
    source: "SS 21, 2/1; SS 21, 3/2",
    rationale:
      "Fällt unter „und Ähnliches“. Ohne eigene Branchenbezeichnung: Stichworttreffer in der Beschreibung führen zur manuellen Prüfung, bestätigte Fälle werden ausgeschlossen.",
    industryKeywords: [],
    descriptionKeywords: ["adult entertainment", "pornograph"],
  },
  {
    id: "drugs",
    label: "Drogen inkl. Freizeit-Cannabis",
    handling: "exclude",
    basis: "Unter „und Ähnliches“",
    source: "SS 21, 2/1; SS 21, 3/2",
    rationale:
      "Fällt unter „und Ähnliches“. Cannabisunternehmen werden in den Finanzdaten oft als Pharmahersteller geführt; Stichworttreffer führen deshalb zur manuellen Prüfung, bestätigte Fälle werden ausgeschlossen. Medizinische Pharmazie ist nicht betroffen.",
    decision: {
      date: "2026-10-06",
      text:
        "Verschreibungspflichtige Arzneimittel, auch Betäubungsmittel für den medizinischen Einsatz, gelten als Arzneimittel und fallen nicht unter „Drogen“. Die Gruppe „Drogen“ meint Rauschmittel für den Freizeitgebrauch, einschließlich Freizeit-Cannabis. Gilt für alle Pharmaunternehmen.",
    },
    industryKeywords: [],
    descriptionKeywords: ["cannabis", "marijuana", "recreational drug"],
  },
  {
    id: "tobacco",
    label: "Tabak",
    handling: "exclude",
    basis: "Vorsichtsprinzip — Auslegungsfrage",
    interpretation: true,
    source: "SS 21, 2/1; SS 21, 3/2 (Auslegung)",
    rationale:
      "Nicht ausdrücklich im Standard genannt. Nach unserem Grundsatz gilt bei Spielraum die vorsichtigere Variante; als Auslegungsfrage gekennzeichnet.",
    industryKeywords: ["tobacco"],
    // 5194 (Tabak-Großhandel) steht nicht in der aktuellen SEC-Liste
    sicCodes: [[2100, 2141], 5194],
  },
  {
    id: "defense",
    label: "Rüstung (inkl. umstrittener Waffen)",
    handling: "exclude",
    basis: "Vorsichtsprinzip — Auslegungsfrage",
    interpretation: true,
    source: "SS 21, 2/1; SS 21, 3/2 (Auslegung)",
    rationale:
      "Nicht ausdrücklich im Standard genannt; vorsichtigere Variante, als Auslegungsfrage gekennzeichnet. Die Branche „Aerospace & Defense“ enthält auch zivile Luftfahrt; dort entscheidet die manuelle Prüfung des Kerngeschäfts, ob Rüstung überwiegt.",
    industryKeywords: [],
    reviewIndustryKeywords: ["defense"],
    descriptionKeywords: ["cluster munition", "anti-personnel mine", "nuclear weapon", "chemical weapon", "biological weapon"],
    // Waffen und Munition (3795 Panzer steht nicht in der aktuellen SEC-Liste)
    sicCodes: [[3480, 3489], 3795],
    // Luft- und Raumfahrt, Schiffbau, Lenkflugkörper, Militärelektronik: prüfen, ob Rüstung überwiegt
    reviewSicCodes: [[3720, 3728], [3730, 3732], [3760, 3769], 3812],
    decision: {
      date: "2026-10-09",
      interpretation: true,
      text:
        "Luft- und Raumfahrt, Schiffbau und Militärelektronik werden manuell geprüft, weil zivile und militärische Tätigkeit gemischt sind. Ausgeschlossen wird, wenn Rüstung das Kerngeschäft ist.",
    },
  },
  {
    id: "film_streaming_games",
    label: "Film, Serien, Streaming und Games",
    handling: "review",
    basis: "Manuelle Prüfung des Kerngeschäfts",
    source: "SS 21, 2/1; SS 21, 3/2",
    rationale:
      "Kein pauschaler Ausschluss, aber die Inhalte können verbotene Tätigkeiten als Kerngeschäft betreffen. Deshalb manuelle Prüfung des Kerngeschäfts; ohne Prüfung „nicht geprüft“.",
    industryKeywords: [],
    reviewIndustryKeywords: ["entertainment", "broadcasting", "electronic gaming", "multimedia"],
    sicCodes: [4833, 4841, [7812, 7841]],
    textKeywords: ["video game", "motion picture", "film production"],
  },
  {
    id: "music",
    label: "Musik",
    handling: "b3_focus",
    basis: "Vorsichtsprinzip — Auslegungsfrage",
    interpretation: true,
    source: "SS 21, 3/4/4 (Auslegung)",
    rationale:
      "Kein Branchenausschluss in A1. Musik-Einnahmen zählen in B3 nach dem Vorsichtsprinzip als verbotene Einnahmen (Auslegungsfrage). Reine Musikunternehmen fallen damit über B3 durch; bei gemischten Unternehmen zählt der Musikanteil zur 5-%-Grenze.",
    industryKeywords: [],
    b3IndustryKeywords: ["music"],
    b3DescriptionKeywords: ["music"],
    // 7929 steht nicht in der aktuellen SEC-Liste; 2741 (sonstige Verlage) ist weiter gefasst als Musik
    sicCodes: [2741, 3652, 7929],
  },
  {
    id: "financial_other",
    label: "Sonstige Finanzdienstleister (Vermögensverwaltung, Kapitalmärkte, Börsen)",
    handling: "b3_focus",
    basis: "Kein pauschaler Riba-Ausschluss",
    source: "SS 21, 3/4/4; SS 21, 3/9; SS 21, 3/12–3/14; SS 27, 6",
    rationale:
      "Das Kerngeschäft ist nicht pauschal zinsbasiert. Verbotene Anteile werden über die manuelle Segmentprüfung in B3 erfasst: Zinserträge (inkl. Margin-Kredite), Handel und Clearing von Derivaten, Wertpapierleihe sowie Verwaltungsgebühren für konventionelle Fonds (letztere als Auslegungsfrage nach dem Vorsichtsprinzip). Ohne Segmentprüfung „nicht geprüft“.",
    industryKeywords: [],
    b3IndustryKeywords: ["asset management", "capital markets", "stock exchanges", "financial conglomerates", "specialty finance"],
    // Broker, Börsen, Vermögensverwalter; Zahlungsnetzwerke über PAYMENT_NETWORK_TICKERS
    sicCodes: [[6200, 6289]],
    decision: {
      date: "2026-10-09",
      interpretation: true,
      text:
        "Zahlungsnetzwerke (z. B. Visa, Mastercard, PayPal) werden nicht pauschal ausgeschlossen. Ihr Kerngeschäft sind Transaktionsgebühren. Zinserträge und Kreditanteile werden über die Segmentprüfung (B3) erfasst.",
    },
  },
  {
    id: "consumer_realestate",
    label: "Lebensmittel, Restaurants, Hotels, Einzelhandel mit Alkoholverkauf, REITs",
    handling: "b3_focus",
    basis: "Kein Branchenausschluss",
    source: "SS 21, 3/4/4",
    rationale:
      "Das Kerngeschäft ist grundsätzlich erlaubt, einzelne Umsatzanteile können es nicht sein (Schweinefleisch, Alkohol, Glücksspiel, bei REITs die Mieterstruktur). Diese Anteile werden über die B3-Segmentprüfung erfasst und dürfen zusammen 5 % der Gesamteinnahmen nicht überschreiten.",
    industryKeywords: [],
    b3IndustryKeywords: [
      "packaged foods", "farm products", "food distribution", "confectioners",
      "restaurants", "lodging", "resorts", "grocery", "discount stores", "department stores",
      "reit", "real estate",
    ],
    // Lebensmittel und Getränke (Alkohol-Codes greifen vorher), Restaurants, Hotels (auch Casino-Hotels,
    // Casino-Umsätze über B3), Supermärkte, Kaufhäuser/Discounter, Drogerien, Immobilien, REITs
    sicCodes: [[2000, 2099], [5800, 5812], 7011, 5411, 5311, 5331, 5912, [6500, 6553], 6798],
  },
];

// Kategorien verbotener Einnahmen für die manuelle B3-Segmentprüfung.
// Zinserträge aus der Zinszeile der GuV zählt die Engine automatisch; hier
// nur Zinsen, die im Umsatz stecken (z. B. Margin-Kredite bei Brokern),
// damit nichts doppelt gezählt wird.
export const PROHIBITED_INCOME_CATEGORIES = {
  interest_in_revenue: { label: "Zinserträge im Umsatz (inkl. Margin-Kredite)", source: "SS 21, 3/4/4" },
  riba_other: { label: "Sonstige zinsbasierte Finanz- und Versicherungserträge", source: "SS 21, 3/4/4" },
  derivatives: { label: "Handel und Clearing von Derivaten", source: "SS 21, 3/12–3/14; SS 27, 6" },
  securities_lending: { label: "Wertpapierleihe", source: "SS 21, 3/9" },
  conventional_fund_fees: { label: "Verwaltungsgebühren für konventionelle Fonds", source: "SS 21, 3/4/4 (Auslegung)", interpretation: true },
  alcohol: { label: "Alkohol", source: "SS 21, 2/1; SS 21, 3/4/4" },
  pork: { label: "Schweinefleisch", source: "SS 21, 2/1; SS 21, 3/4/4" },
  gambling: { label: "Glücksspiel", source: "SS 21, 3/4/4" },
  adult: { label: "Pornografie und Erwachsenenunterhaltung", source: "SS 21, 3/4/4" },
  drugs: { label: "Drogen inkl. Freizeit-Cannabis", source: "SS 21, 3/4/4" },
  tobacco: { label: "Tabak", source: "SS 21, 3/4/4 (Auslegung)", interpretation: true },
  weapons: { label: "Rüstung inkl. umstrittener Waffen", source: "SS 21, 3/4/4 (Auslegung)", interpretation: true },
  music: { label: "Musik", source: "SS 21, 3/4/4 (Auslegung)", interpretation: true },
  other: { label: "Sonstige verbotene Einnahmen (in der Quelle begründen)", source: "SS 21, 3/4/4" },
};

// A3: Handel mit Gold, Silber oder Währungen als Kerngeschäft (nicht Förderung).
const A3_KEYWORDS = ["currency exchange", "bullion", "precious metals trading", "foreign exchange"];

// C2: Unternehmen ohne Geschäftsbetrieb (SPACs vor Übernahme).
const SHELL_KEYWORDS = ["shell compan", "blank check"];

const norm = (s) => (s || "").toLowerCase();
const hits = (text, kws = []) => kws.find((k) => text.includes(k));

/**
 * @returns {{ class: "exclude"|"review"|"b3_focus"|"allow"|"unknown", group?: object, why?: string }}
 */
export function classifyIndustry(industry, description = "") {
  const i = norm(industry);
  const d = norm(description);
  if (!i) return { class: "unknown" };

  // 1. Automatischer Ausschluss über den Branchennamen
  for (const g of INDUSTRY_GROUPS) {
    if (g.handling === "exclude" && hits(i, g.industryKeywords)) {
      return { class: "exclude", group: g, why: `${g.label} (Branche: ${industry})` };
    }
  }
  // 2. Manuelle Prüfung über den Branchennamen
  for (const g of INDUSTRY_GROUPS) {
    const kw = hits(i, g.reviewIndustryKeywords);
    if (kw) return { class: "review", group: g, why: `${g.label}: Kerngeschäft manuell prüfen (Branche: ${industry})` };
  }
  // 3. Stichworte in der Beschreibung → nie automatisch Ausschluss, nur Prüfung
  for (const g of INDUSTRY_GROUPS) {
    const kw = hits(d, g.descriptionKeywords);
    if (kw) return { class: "review", group: g, why: `${g.label}: Stichwort „${kw}“ in der Unternehmensbeschreibung, Kerngeschäft manuell prüfen` };
  }
  // 4. Kein Ausschluss, Schwerpunkt der B3-Segmentprüfung
  for (const g of INDUSTRY_GROUPS.filter((x) => x.handling === "b3_focus")) {
    if (hits(i, g.b3IndustryKeywords)) {
      return { class: "b3_focus", group: g, why: `${g.label}: kein Branchenausschluss, verbotene Anteile über B3 prüfen (Branche: ${industry})` };
    }
  }
  for (const g of INDUSTRY_GROUPS.filter((x) => x.handling === "b3_focus")) {
    const kw = hits(d, g.b3DescriptionKeywords);
    if (kw) return { class: "b3_focus", group: g, why: `${g.label}: Stichwort „${kw}“ in der Beschreibung, Anteil über B3 prüfen` };
  }
  return { class: "allow" };
}

// ------------------------------------------------------------------ SIC-Zuordnung (SEC-Daten)
//
// Gilt nur, wenn die Daten von der SEC kommen (Anbieter "sec" oder "sec_fmp"). Die SEC liefert je Firma
// einen SIC-Code, aber keine Unternehmensbeschreibung. Deshalb laufen die Stichworte (descriptionKeywords)
// dort nicht über das Profil, sondern im 10-K mit (scripts/keyword-scan.mjs, Abschnitt „A1-Hinweise“).
// Reihenfolge: Ausschluss → Zahlungsnetzwerke → manuelle Prüfung → B3-Schwerpunkt → erlaubt.
// Alle übrigen Codes sind erlaubt, ausdrücklich auch 2834/2836 Pharma (Festlegung 06.10.2026).

/**
 * Stichworte für die A1-Hinweise im 10-K (scripts/keyword-scan.mjs): Beschreibungs-Stichworte der Gruppen
 * plus textKeywords. Bei SEC-Daten gibt es keine Unternehmensbeschreibung, deshalb laufen sie dort mit.
 */
export const A1_TEXT_KEYWORDS = INDUSTRY_GROUPS.map((g) => ({
  id: g.id,
  label: g.label,
  keywords: [...new Set([...(g.descriptionKeywords || []), ...(g.b3DescriptionKeywords || []), ...(g.textKeywords || [])])],
})).filter((g) => g.keywords.length);

/** Anbieter, bei denen A1 über den SIC-Code geprüft wird. */
export const SIC_PROVIDERS = ["sec", "sec_fmp"];

// Zahlungsnetzwerke und Zahlungsdienstleister. Sie stehen bei der SEC unter 7389 (allgemeine
// Dienstleistungen) oder 7374 (Datenverarbeitung). Nicht den ganzen Code umstufen, sondern nur diese Titel:
// Kerngeschäft sind Transaktionsgebühren, kein eigenes Kreditgeschäft; Zinserträge und Kreditanteile
// erfasst die B3-Segmentprüfung (Festlegung 09.10.2026, Gruppe financial_other).
export const PAYMENT_NETWORK_TICKERS = {
  V: "Visa",
  MA: "Mastercard",
  PYPL: "PayPal",
  FISV: "Fiserv",
  FIS: "Fidelity National Information Services",
  GPN: "Global Payments",
  CPAY: "Corpay",
};

// C2: Blank Checks (SPACs vor Übernahme)
const SHELL_SIC = [6770];
// A3: Großhandel mit Schmuck, Uhren, Edelsteinen und Edelmetallen → manuelle A3-Prüfung
const GOLD_DEALER_REVIEW_SIC = [5094];

const sicNumber = (sic) => {
  const n = Number.parseInt(String(sic ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Liegt der Code in der Liste? Einträge sind Einzelcodes oder Bereiche [von, bis] (jeweils einschließlich). */
export function sicMatches(sic, list = []) {
  const n = sicNumber(sic);
  if (n === null) return false;
  return list.some((e) => (Array.isArray(e) ? n >= e[0] && n <= e[1] : n === e));
}

/** A1 über SIC für diese Datenquelle? Im FMP-Modus nein (bisherige Prüfung über Branche und Beschreibung). */
export function usesSic(dataProvider) {
  return SIC_PROVIDERS.includes(dataProvider);
}

/**
 * A1-Zuordnung über den SIC-Code der SEC.
 * @returns {{ class: "exclude"|"review"|"b3_focus"|"allow"|"unknown", group?: object, why?: string, interpretation?: boolean }}
 */
export function classifySic(sic, { symbol = null, sicDescription = null } = {}) {
  const n = sicNumber(sic);
  if (n === null) return { class: "unknown" };
  const label = `SIC ${n}${sicDescription ? ` ${sicDescription}` : ""}`;
  const result = (cls, g, why) => ({
    class: cls,
    group: g,
    why,
    interpretation: Boolean(g.interpretation || sicMatches(n, g.interpretationSicCodes)),
  });

  for (const g of INDUSTRY_GROUPS) {
    if (g.handling === "exclude" && sicMatches(n, g.sicCodes)) return result("exclude", g, `${g.label} (${label})`);
  }
  const sym = String(symbol || "").toUpperCase();
  if (Object.hasOwn(PAYMENT_NETWORK_TICKERS, sym)) {
    const g = INDUSTRY_GROUPS.find((x) => x.id === "financial_other");
    return {
      class: "b3_focus",
      group: g,
      why: `Zahlungsnetzwerk: kein Branchenausschluss, Zinserträge und Kreditanteile über B3 prüfen (${label})`,
      interpretation: true,
    };
  }
  for (const g of INDUSTRY_GROUPS) {
    const review = (g.handling === "review" && sicMatches(n, g.sicCodes)) || sicMatches(n, g.reviewSicCodes);
    if (review) return result("review", g, `${g.label}: Kerngeschäft manuell prüfen (${label})`);
  }
  for (const g of INDUSTRY_GROUPS.filter((x) => x.handling === "b3_focus")) {
    if (sicMatches(n, g.sicCodes)) {
      return result("b3_focus", g, `${g.label}: kein Branchenausschluss, verbotene Anteile über B3 prüfen (${label})`);
    }
  }
  return { class: "allow" };
}

/** A1-Zuordnung je nach Datenquelle: SEC-Modi über SIC, sonst über Branche und Beschreibung (FMP). */
export function classifyProfile(profile, dataProvider, { symbol = null } = {}) {
  if (usesSic(dataProvider)) {
    return classifySic(profile?.sic, { symbol: profile?.symbol ?? symbol, sicDescription: profile?.sicDescription ?? null });
  }
  return classifyIndustry(profile?.industry ?? null, profile?.description ?? "");
}

export function isShellSic(sic) {
  return sicMatches(sic, SHELL_SIC);
}

/** A3 über SIC: Edelmetall-Großhandel muss manuell geprüft werden. */
export function needsGoldDealerReviewSic(sic) {
  return sicMatches(sic, GOLD_DEALER_REVIEW_SIC);
}

export function isGoldSilverCurrencyDealer(industry) {
  return Boolean(hits(norm(industry), A3_KEYWORDS));
}

export function isShellCompany(industry) {
  return Boolean(hits(norm(industry), SHELL_KEYWORDS));
}
