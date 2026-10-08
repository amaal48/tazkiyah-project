// src/screening/explanations.js
//
// Erklärtexte in einfachen Worten für die Oberfläche: je Prüfung eine Erklärseite,
// dazu die Prüfstufen für die Hauptseite und die Texte zu den Kennzeichnungen (Flags).
//
// Regeln:
//   - Grenzwerte stehen NICHT im Text, sondern als Platzhalter {name}. Sie werden aus
//     den Parametern eingesetzt (fillParams), damit Text und Rechnung nie auseinanderlaufen.
//   - Name, Quelle und Parameterverweise je Prüfung müssen mit der Engine übereinstimmen;
//     engine.test.js prüft das.
//   - Der Standardtext wird nicht abgedruckt, sondern sinngemäß wiedergegeben und mit
//     Fundstelle genannt.
//   - Felder `todo` sind offene Punkte für die Projektinhaberin und werden nicht angezeigt.
//   - ENTWURF: Formulierungen und Fundstellen sind vor dem Veröffentlichen gegen den
//     Standardtext zu prüfen.

import { DEFAULT_PARAMETERS } from "./parameters.js";

/** Die vier Prüfstufen für die Grafik auf der Hauptseite (ETFs: eigene Stufe G). */
export const STAGES = [
  { id: "A", title: "Tätigkeit", question: "Was tut das Unternehmen?", criteria: ["A1", "A2", "A3"] },
  { id: "B", title: "Kennzahlen", question: "Wie finanziert es sich, und woher kommen die Einnahmen?", criteria: ["B1", "B2", "B3"] },
  { id: "C", title: "Vermögen", question: "Woraus besteht sein Vermögen?", criteria: ["C1", "C2", "C3"] },
  { id: "D", title: "Aktie und Produkt", question: "Welche Art von Wertpapier ist es?", criteria: ["D1", "D2", "D3", "H"] },
];

export const ETF_STAGE = { id: "G", title: "Fonds", question: "Was enthält der Fonds, und wie bildet er den Index nach?", criteria: ["G1", "G2", "G3", "G4", "H"] };

/** Anzeigetexte für das Ergebnis einer Prüfung. */
export const RESULT_LABELS = {
  pass: "bestanden",
  fail: "nicht bestanden",
  not_checked: "nicht geprüft",
  not_applicable: "gilt für dieses Wertpapier nicht",
};

/**
 * Kennzeichnungen (criterion.flags) in Klartext. `criterion` = Standard-Erklärseite für den Link;
 * erscheint die Kennzeichnung unter einer Prüfung, verlinkt die Oberfläche bevorzugt auf diese.
 */
export const FLAG_TEXTS = {
  marktkapitalisierung_aus_kurs: {
    text: "Marktkapitalisierung aus Schlusskurs und Aktienzahl gebildet",
    criterion: "B1",
  },
  datenabweichung: {
    text: "Als Aktienzahl dient der Durchschnitt der Periode, nicht der Bestand am Stichtag",
    criterion: "B1",
  },
  leasing_geschaetzt: {
    text: "Leasing im Quartal aus dem Jahresabschluss geschätzt",
    criterion: "B1",
  },
  leasing_manuell_geprueft: {
    text: "Leasing im Quartal von Hand aus dem Quartalsbericht geprüft",
    criterion: "B1",
  },
  leasing_schaetzung_entscheidend: {
    text: "Das Ergebnis hängt von der Leasing-Schätzung ab; der Quartalsbericht wird geprüft",
    criterion: "B1",
  },
  zinsertraege_aus_anhang: {
    text: "Zinserträge von Hand aus dem Anhang des Berichts übernommen, weil sie in den Finanzdaten nicht einzeln stehen",
    criterion: "B3",
  },
  zinsertraege_vorsichtig: {
    text: "Zinserträge vorsichtig vollständig gezählt: Die Angabe enthält auch Dividenden oder andere Erträge",
    criterion: "B3",
  },
  nenner_ohne_sonstige_ertraege: {
    text: "Sonstige Erträge nicht ausgewiesen, Nenner vorsichtig ohne sie (strenger). Bestanden nur unter der Grenze, sonst „nicht geprüft“",
    criterion: "B3",
  },
  sammelzeilen_nicht_mitgezaehlt: {
    text: "Sammelzeilen nicht mitgezählt (strenger): Nur eindeutig belegte reale Werte zählen. Bestanden nur ab der Grenze, sonst „nicht geprüft“",
    criterion: "C1",
  },
  posten_null_bilanzabgleich: {
    text: "Ein nicht ausgewiesener Bilanzposten zählt als 0, weil die übrigen Posten die Bilanzsumme vollständig erklären",
    criterion: "C1",
  },
  auslegungsfrage: {
    text: "Auslegungsfrage: Der Standard lässt hier Spielraum, wir folgen der vorsichtigeren Lesart",
    criterion: "A1",
  },
  b3_schwerpunkt: {
    text: "Die Branche ist nicht ausgeschlossen, enthält aber oft verbotene Umsatzanteile; sie werden bei der Prüfung der Umsatzsegmente besonders beachtet",
    criterion: "A1",
  },
  sarf: {
    text: "Betrifft den Handel mit Gold, Silber oder Währungen (Sarf-Regeln)",
    criterion: "A3",
  },
};

/**
 * Erklärung je Prüfung.
 *   name, source, parameterRefs — wie in der Engine (per Test abgesichert)
 *   simple — kurze Absätze in einfachen Worten, Platzhalter {parametername}
 */
export const EXPLANATIONS = {
  A1: {
    name: "Kerngeschäft erlaubt",
    source: "SS 21, 2/1; SS 21, 3/2",
    parameterRefs: ["industryGroups"],
    simple: [
      "Das Hauptgeschäft des Unternehmens muss nach islamischen Grundsätzen erlaubt sein.",
      "Der Standard nennt als verbotene Haupttätigkeit beispielhaft Alkohol, Schweinefleisch und Zinsgeschäfte. Weitere Branchen ordnen wir unter „und Ähnliches“ ein oder schließen sie nach dem Vorsichtsprinzip aus. Das ist bei jeder Aktie gekennzeichnet.",
      "Ein Stichwort in der Unternehmensbeschreibung führt nie automatisch zum Ausschluss, sondern zu einer Prüfung von Hand.",
    ],
  },
  A2: {
    name: "Unternehmenszweck laut Satzung",
    source: "SS 21, 3/4/1",
    parameterRefs: ["articlesReview", "manualReviewExpiry"],
    simple: [
      "Der Zweck des Unternehmens laut Satzung darf nicht auf verbotene Geschäfte oder auf Zinsgeschäfte gerichtet sein.",
      "Die Satzung wird geprüft, und das Ergebnis wird mit Quelle und Datum gespeichert. Die Prüfung gilt, bis ein neuer Jahresabschluss vorliegt, danach wird sie erneut bestätigt.",
      "Solange diese Prüfung fehlt, bleibt die Aktie auf „nicht geprüft“.",
    ],
  },
  A3: {
    name: "Kein Gold-, Silber- oder Währungshändler",
    source: "SS 21, 3/19",
    parameterRefs: ["goldSilverCurrencyDealers"],
    simple: ["Unternehmen, deren Kerngeschäft der Handel mit Gold, Silber oder Währungen ist, werden ausgeschlossen."],
  },
  B1: {
    name: "Zinstragende Schulden",
    source: "SS 21, 3/4/2",
    parameterRefs: ["debtMaxPct", "marketCapBasis", "marketCapFromPrice", "leaseLiabilitiesAsDebt", "leaseQuarterEstimate", "balanceBasis"],
    simple: [
      "Die zinstragenden Schulden dürfen höchstens {debtMaxPct} % der Marktkapitalisierung betragen.",
      "Leasingverbindlichkeiten zählen mit, soweit sie als Schuld ausgewiesen sind. Weist ein Quartal sie nicht gesondert aus, übernehmen wir den Wert des letzten Jahresabschlusses und kennzeichnen das als Schätzung.",
      "Der letzte Jahresabschluss und das letzte Quartal müssen die Grenze beide einhalten.",
    ],
  },
  B2: {
    name: "Zinstragende Einlagen",
    source: "SS 21, 3/4/3",
    parameterRefs: ["depositsMaxPct", "marketCapBasis", "marketCapFromPrice", "allCashInterestBearing", "balanceBasis"],
    simple: [
      "Geld auf Konten sowie kurz- und langfristige Geldanlagen dürfen zusammen höchstens {depositsMaxPct} % der Marktkapitalisierung betragen.",
      "Wir behandeln dieses Geld grundsätzlich als zinstragend, es sei denn, die Daten belegen das Gegenteil.",
      "Der letzte Jahresabschluss und das letzte Quartal müssen die Grenze beide einhalten.",
    ],
  },
  B3: {
    name: "Verbotene Einnahmen",
    source: "SS 21, 3/4/4",
    parameterRefs: ["prohibitedIncomeMaxPct", "prohibitedIncomeBasis", "prohibitedIncomeSources", "requireSegmentReview", "prohibitedIncomeDenominator", "manualReviewExpiry"],
    simple: [
      "Einnahmen aus verbotenen Quellen dürfen höchstens {prohibitedIncomeMaxPct} % der Gesamteinnahmen ausmachen. Dazu zählen Zinserträge und Umsätze aus verbotenen Geschäftsfeldern.",
      "Gesamteinnahmen sind der Umsatz plus die sonstigen Erträge einschließlich der Zinserträge.",
      "Geprüft werden die letzten vier Quartale und der letzte Jahresabschluss. Die Umsatzsegmente werden dafür einzeln geprüft. Solange diese Prüfung fehlt, bleibt die Aktie auf „nicht geprüft“.",
    ],
  },
  C1: {
    name: "Reale Vermögenswerte",
    source: "SS 21, 3/19; Fußnote zu SS 21, 3/1",
    parameterRefs: ["realAssetsMinPct", "realAssetsValuation", "operatingReceivablesCountAsReal", "goodwillCountsAsRealAsset", "intangiblesCountAsRights", "balanceBasis"],
    simple: [
      "Mindestens {realAssetsMinPct} % der Gesamtaktiva müssen aus realen Vermögenswerten und Rechten bestehen.",
      "Nicht dazu zählen Geld, Finanzanlagen und Goodwill. Forderungen aus dem laufenden Geschäft zählen mit (SS 59, 8/1). Immaterielle Werte und Nutzungsrechte zählen als Rechte mit.",
      "Wir verwenden Buchwerte, weil Marktwerte einzelner Vermögenswerte nicht veröffentlicht werden. Das ist eine Datengrenze, die wir offen ausweisen.",
    ],
  },
  C2: {
    name: "Kein Nur-Cash-Unternehmen",
    source: "SS 21, 3/17",
    parameterRefs: [],
    simple: [
      "Das Unternehmen darf nicht nur aus Geld bestehen. Ein Unternehmen ohne Geschäftsbetrieb, zum Beispiel ein Mantelunternehmen (SPAC) vor der Übernahme, ist ausgeschlossen.",
      "Wir belegen das über die Prüfung der realen Vermögenswerte (C1).",
    ],
  },
  C3: {
    name: "Kein Nur-Forderungs-Unternehmen",
    source: "SS 21, 3/18; SS 59, 8/1 und 8/3",
    parameterRefs: [],
    simple: [
      "Das Unternehmen darf nicht ausschließlich aus Forderungen bestehen.",
      "Wir belegen das über die Prüfung der realen Vermögenswerte (C1). Forderungen aus dem laufenden Geschäft eines Unternehmens mit erlaubter Tätigkeit behandeln wir nach SS 59, 8/1 und 8/3.",
    ],
    todo: "Satz zu SS 59 gegen den Standardtext prüfen und ggf. genauer formulieren.",
  },
  D1: {
    name: "Keine Vorzugsaktie mit finanziellem Vorrang",
    source: "SS 21, 2/6",
    parameterRefs: [],
    simple: [
      "Vorzugsaktien, die bei der Gewinnverteilung oder bei der Auflösung des Unternehmens finanziellen Vorrang haben, sind ausgeschlossen.",
      "Gewöhnliche Aktien und Vorzugsaktien, die nur ein Stimmrecht betreffen, sind zulässig.",
    ],
  },
  D2: {
    name: "Keine Tamattu'-Aktie",
    source: "SS 21, 2/7",
    parameterRefs: [],
    simple: ["Aktien der Gattung Tamattu' werden nach SS 21, 2/7 ausgeschlossen."],
    todo: "Kurz erklären, was Tamattu'-Aktien sind, nach dem Standardtext.",
  },
  D3: {
    name: "Keine Anleihe",
    source: "SS 21, 4; SS 21, 5",
    parameterRefs: [],
    simple: ["Anleihen sind nach diesem Standard keine zulässige Anlage. Tazkiyah prüft Aktien und Fonds."],
  },
  H: {
    name: "Kein ausgeschlossenes Produkt",
    source: "SS 21, 3/5–3/15; SS 27, 6/1–6/3",
    parameterRefs: [],
    simple: [
      "Bestimmte Produktarten sind ausgeschlossen, zum Beispiel Wertpapiere auf Kredit, Leerverkäufe, Futures, Optionen, Swaps und gehebelte oder inverse Fonds.",
      "Wo ein Produkt nicht wörtlich im Standard steht, sondern von uns abgeleitet ist, kennzeichnen wir das.",
    ],
  },
  G1: {
    name: "Look-through: alle enthaltenen Aktien konform",
    source: "SS 21; SS 27 [Ableitung]",
    parameterRefs: ["ruleG1LookThrough"],
    simple: [
      "Bei einem ETF wird jede enthaltene Aktie einzeln nach diesen Regeln geprüft. Der ETF ist nur konform, wenn alle enthaltenen Aktien konform sind.",
      "Das ist von uns aus den Standards abgeleitet und nicht wörtlich im Standard enthalten.",
    ],
  },
  G2: {
    name: "Keine synthetische Replikation",
    source: "SS 21, 3/14; SS 27, 6/1 [Ableitung]",
    parameterRefs: ["ruleG2Synthetic", "manualReviewExpiry"],
    simple: ["Der ETF muss die Wertpapiere des Index tatsächlich halten und darf ihn nicht über Tauschgeschäfte (Swaps) nachbilden."],
  },
  G3: {
    name: "Keine Wertpapierleihe",
    source: "SS 21, 3/9; SS 21, 3/15 [Ableitung]",
    parameterRefs: ["ruleG3SecuritiesLending", "manualReviewExpiry"],
    simple: ["Der ETF darf seine Wertpapiere nicht verleihen."],
  },
  G4: {
    name: "Keine Derivate im Fonds",
    source: "SS 21, 3/12–3/14; SS 27, 6/2–6/3 [Ableitung]",
    parameterRefs: ["ruleG4Derivatives", "manualReviewExpiry"],
    simple: ["Der ETF darf keine Derivate wie Futures, Optionen oder Swaps halten."],
  },
};

/** Parameterwerte als einfache Zuordnung name → Wert (für Seiten ohne konkrete Aktie). */
export function defaultParameterValues() {
  return Object.fromEntries(Object.entries(DEFAULT_PARAMETERS).map(([k, d]) => [k, d.value]));
}

/** Setzt {parametername} ein; Zahlen mit Komma. Unbekannte Platzhalter bleiben stehen, damit Fehler auffallen. */
export function fillParams(text, parameters = defaultParameterValues()) {
  return String(text).replace(/\{(\w+)\}/g, (whole, key) => {
    const v = parameters?.[key];
    return typeof v === "number" ? String(v).replace(".", ",") : whole;
  });
}

/** Die einzelnen Fundstellen einer Quellenangabe, z. B. "SS 21, 3/4/2; SS 59, 8/1" → ["SS 21, 3/4/2", "SS 59, 8/1"]. */
export function splitSources(source) {
  return String(source || "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
}
