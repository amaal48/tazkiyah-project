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
// Matching per Stichwort auf den kleingeschriebenen Branchennamen, damit
// yfinance-Namen („Credit Services“) und FMP-Namen („Financial - Credit
// Services“) gleichermaßen greifen.

// Gruppen für die Methodik-Seite. Reihenfolge = Prüfreihenfolge.
export const INDUSTRY_GROUPS = [
  {
    id: "alcohol",
    label: "Alkohol",
    handling: "exclude",
    basis: "Im Standard genannt",
    source: "SS 21, 2/1; SS 21, 3/2",
    rationale: "Herstellung und Vertrieb von Alkohol ist im Standard ausdrücklich als verbotene Haupttätigkeit genannt.",
    industryKeywords: ["brewer", "wineries", "distiller"],
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
  },
  {
    id: "riba",
    label: "Riba (konventionelle Banken, Versicherungen, Kreditgeber)",
    handling: "exclude",
    basis: "Im Standard genannt",
    source: "SS 21, 2/1; SS 21, 3/2",
    rationale: "Zinsbasierte Finanzgeschäfte sind im Standard ausdrücklich als verbotene Haupttätigkeit genannt.",
    industryKeywords: ["bank", "insurance", "credit services", "mortgage"],
  },
  {
    id: "gambling",
    label: "Glücksspiel",
    handling: "exclude",
    basis: "Unter „und Ähnliches“",
    source: "SS 21, 2/1; SS 21, 3/2",
    rationale: "Fällt unter die im Standard offen formulierte Liste verbotener Tätigkeiten („und Ähnliches“).",
    industryKeywords: ["gambling", "casino"],
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

export function isGoldSilverCurrencyDealer(industry) {
  return Boolean(hits(norm(industry), A3_KEYWORDS));
}

export function isShellCompany(industry) {
  return Boolean(hits(norm(industry), SHELL_KEYWORDS));
}
