// src/screening/parameters.js
//
// EINZIGE Quelle für alle Grenzwerte, Auslegungsparameter und Ableitungsregeln
// des Screeners. Engine, API und Methodik-Seite lesen ausschließlich von hier.
// Früher existierte die Logik an drei Stellen (Python-Skript, App.jsx/Widget,
// api/fundamentals.js) — das entfällt damit.
//
// Grundsatz (von der Projektinhaberin festgelegt):
//   Wortlaut des AAOIFI-Standards zuerst. Wo der Text Spielraum lässt, gilt die
//   vorsichtigere Variante. Grenzwerte werden nicht strenger gemacht als im
//   Standard (30 % / 30 % / 5 %).
//
// Jeder Eintrag trägt die Felder für die Methodik-Seite:
//   value        — aktiver Wert (von der Engine genutzt)
//   method       — gewählte Methode in Klartext
//   rationale    — Begründung
//   alternative  — verworfene Alternative
//   source       — Abschnittsnummer(n)
//   derivation   — true = nicht wörtlich im Standard ([Ableitung]), abschaltbar
//   pendingConfirmation — true = Vorschlag, noch nicht von dir bestätigt
//
// Änderungen an Werten NUR nach Rücksprache (Regel 2). Jede Screening-Runde
// speichert einen Schnappschuss der Werte, damit alte Ergebnisse
// nachvollziehbar bleiben.

export const PARAMETERS_VERSION = "2026-10-02.2";

export const PRINCIPLE =
  "Wortlaut des AAOIFI-Standards zuerst. Wo der Text Spielraum lässt, gilt die vorsichtigere Variante. Grenzwerte werden nicht strenger gemacht als im Standard (30 %, 30 %, 5 %).";

export const DEFAULT_PARAMETERS = {
  // ---------------------------------------------------------------- Grenzwerte
  debtMaxPct: {
    value: 30,
    method: "Zinstragende Schulden höchstens 30 % der Marktkapitalisierung.",
    rationale: "Wortlaut des Standards.",
    alternative: "Ein Drittel (33,3 %), wie von anderen Screening-Anbietern genutzt.",
    source: "SS 21, 3/4/2",
  },
  depositsMaxPct: {
    value: 30,
    method: "Zinstragende Einlagen und Wertpapiere höchstens 30 % der Marktkapitalisierung.",
    rationale: "Wortlaut des Standards.",
    alternative: "Ein Drittel (33,3 %).",
    source: "SS 21, 3/4/3",
  },
  prohibitedIncomeMaxPct: {
    value: 5,
    method: "Einnahmen aus verbotenen Quellen höchstens 5 % der Gesamteinnahmen.",
    rationale: "Wortlaut des Standards.",
    alternative: "Keine — der Standard nennt nur diesen Wert.",
    source: "SS 21, 3/4/4",
  },
  realAssetsMinPct: {
    value: 33.3,
    method: "Reale Vermögenswerte, Nutzungsrechte und Rechte mindestens ein Drittel (33,3 %) der Gesamtaktiva.",
    rationale:
      "Haupttext (3/19) nennt 30 %, die Fußnote zu 3/1 ein Drittel. Der Text lässt damit Spielraum; nach unserem Grundsatz gilt die vorsichtigere Variante.",
    alternative: "30 % laut Haupttext 3/19.",
    source: "SS 21, 3/19; Fußnote zu SS 21, 3/1",
  },

  // ------------------------------------------------------------ Datengrundlage
  balanceBasis: {
    value: "annual_and_latest_quarter",
    method: "Der letzte Jahresabschluss UND das letzte Quartal müssen die Grenzen jeweils einhalten (gilt für B1, B2, C1).",
    rationale:
      "SS 21, 3/4/5 lässt den letzten Abschluss oder die geprüfte Bilanz zu. Wir verlangen beides, weil nach unserem Grundsatz bei Spielraum die vorsichtigere Variante gilt.",
    alternative: "Nur der letzte Abschluss oder nur die geprüfte Bilanz.",
    source: "SS 21, 3/4/5",
  },
  marketCapBasis: {
    value: "period_end",
    method: "Marktkapitalisierung zum jeweiligen Bilanzstichtag (historischer Kurs).",
    rationale:
      "Der Standard nennt keinen Durchschnitt. Der Wert zum Bilanzstichtag passt zeitlich zu den Bilanzposten, mit denen er ins Verhältnis gesetzt wird.",
    alternative: "Aktueller Wert oder Durchschnitt über mehrere Monate.",
    source: "SS 21, 3/4/2; SS 21, 3/4/3",
  },
  marketCapFromPrice: {
    value: "price_times_shares",
    method:
      "Die Marktkapitalisierung zum Bilanzstichtag wird aus dem Schlusskurs am Stichtag (bei Wochenende oder Feiertag der letzte Handelstag davor, höchstens 7 Tage) mal der Aktienzahl gebildet. Als Aktienzahl dient der Bestand am Periodenende, sobald die Datenquelle ihn liefert; bis dahin der Durchschnitt der Periode, und das ist als Datenabweichung gekennzeichnet. Hat ein Unternehmen mehrere Aktiengattungen, müssen alle Gattungen zusammengezählt werden. Ist das mit den Daten nicht möglich, bleiben B1 und B2 „nicht geprüft“. Liefert die Datenquelle die Marktkapitalisierung selbst, hat sie Vorrang.",
    rationale:
      "Der Standard verlangt die Marktkapitalisierung, nicht ihre Herkunft. Historische Marktkapitalisierungen zu Bilanzstichtagen gibt es nicht in jeder Datenquelle, Schlusskurse schon. Der Durchschnitt der Periode liegt bei Unternehmen mit Aktienrückkäufen etwas über dem Bestand; die Marktkapitalisierung ist dann leicht zu hoch und die Schuldenquote leicht zu niedrig. Diese Datengrenze wird offen ausgewiesen. Sobald die Datenquelle die Marktkapitalisierung selbst liefert, ersetzt sie die Näherung.",
    alternative: "Aktienzahl vom Deckblatt des Jahresberichts (nicht automatisierbar).",
    source: "SS 21, 3/4/2; SS 21, 3/4/3",
  },
  leaseLiabilitiesAsDebt: {
    value: true,
    method: "Leasingverbindlichkeiten zählen zu den zinstragenden Schulden.",
    rationale: "Der Text lässt Spielraum; die vorsichtigere Variante zählt sie mit.",
    alternative: "Leasingverbindlichkeiten ausklammern.",
    source: "SS 21, 3/4/2",
  },
  leaseQuarterEstimate: {
    value: true,
    method:
      "Weist ein Quartalsabschluss Leasingverbindlichkeiten nicht gesondert aus, wird der Leasingwert des letzten Jahresabschlusses übernommen und das Ergebnis als „Schätzung aus Jahresabschluss“ gekennzeichnet. Ist Leasing bereits in den Schuldenposten enthalten, wird nichts ergänzt. Würde die Schätzung das Ergebnis ändern (B1 mit Leasing über 30 %, ohne Leasing darunter), lautet der Status „nicht geprüft“, und der Quartalsbericht (10-Q) wird von Hand geprüft.",
    rationale:
      "Zinstragende Schulden nach SS 21, 3/4/2 umfassen auch Leasing, soweit es als Schuld ausgewiesen ist. Viele Unternehmen weisen es im Quartal nicht gesondert aus; es wegzulassen würde die Quote zu niedrig zeigen. Der Jahreswert ist die beste belegte Näherung. Entscheidet er über das Ergebnis, ersetzt die Prüfung des Quartalsberichts die Schätzung.",
    alternative:
      "Quartal ohne Leasing rechnen (Quote zu niedrig) oder jedes Quartal ohne gesonderten Ausweis als „nicht geprüft“ werten (strenger, würde sehr viele Unternehmen betreffen).",
    source: "SS 21, 3/4/2",
    derivation: true,
  },
  allCashInterestBearing: {
    value: true,
    method: "Alles Cash und alle Anlagen gelten als zinstragend, außer die Daten belegen das Gegenteil.",
    rationale:
      "Die Finanzdaten trennen verzinste und unverzinste Guthaben in der Regel nicht. Die vorsichtigere Variante zählt alles, solange nichts anderes belegt ist.",
    alternative: "Nur ausdrücklich als verzinslich ausgewiesene Posten zählen.",
    source: "SS 21, 3/4/3",
  },
  prohibitedIncomeBasis: {
    value: "ttm_and_annual",
    method: "Die letzten vier Quartale zusammen UND der letzte Jahresabschluss müssen jeweils ≤ 5 % sein.",
    rationale:
      "Vier Quartale zusammen verhindern, dass ein einzelnes Quartal mit Sondereffekten das Bild verzerrt; der Jahresabschluss erfüllt 3/4/5. Beides zu verlangen ist die vorsichtigere Variante.",
    alternative: "Nur Jahresabschluss oder nur einzelnes Quartal.",
    source: "SS 21, 3/4/4; SS 21, 3/4/5",
  },
  prohibitedIncomeSources: {
    value: "all_incl_interest",
    method:
      "Alle verbotenen Quellen zählen: verbotene Tätigkeit, verbotene Vermögenswerte und sonstige Quellen inkl. Zinserträge. Gemischte oder unklare Segmente → „nicht geprüft“.",
    rationale: "Wortlaut 3/4/4 (alle Quellen) und Pflicht zur Nachforschung bei unklarer Offenlegung.",
    alternative: "Anteile gemischter Segmente schätzen.",
    source: "SS 21, 3/4/4",
  },
  requireSegmentReview: {
    value: true,
    method: "Für jede Aktie ist eine manuelle Segmentprüfung (B3) nötig; ohne gültige Prüfung → „nicht geprüft“.",
    rationale:
      "Die Finanzdaten liefern nur Zinserträge, keine verbotenen Umsatzanteile. Ohne Prüfung ist die Einnahmequelle nicht klar ausgewiesen (3/4/4).",
    alternative: "Nur Zinserträge prüfen und Segmente ignorieren.",
    source: "SS 21, 3/4/4",
  },
  prohibitedIncomeDenominator: {
    value: "total_income",
    method: "Nenner für B3 sind die Gesamteinnahmen: Umsatz plus sonstige Erträge einschließlich Zinserträge.",
    rationale:
      "SS 21, 3/4/4 spricht von „total income“; nach unserem Grundsatz geht der Wortlaut vor, die Vorsicht gilt nur bei Spielraum. Zinserträge stehen im Zähler, deshalb müssen Zähler und Nenner auf derselben Basis stehen. Durch die Basis aus vier Quartalen gleichen sich Sondererträge aus.",
    alternative: "Nur der Umsatz (kleinerer Nenner, strengere Quote).",
    source: "SS 21, 3/4/4",
  },
  realAssetsValuation: {
    value: "book_value",
    method: "Reale Vermögenswerte, Nutzungsrechte und Rechte werden mit ihren Buchwerten aus der Bilanz angesetzt.",
    rationale:
      "SS 21, 3/19 spricht vom Marktwert dieser Vermögenswerte. Marktwerte einzelner Vermögenswerte werden von Unternehmen nicht veröffentlicht und stehen in keiner Finanzdatenquelle; die Buchwerte sind die einzige verfügbare, geprüfte Näherung. Diese Datengrenze wird offen ausgewiesen.",
    alternative: "Marktwerte laut Wortlaut von 3/19 (nicht verfügbar).",
    source: "SS 21, 3/19",
  },
  goodwillCountsAsRealAsset: {
    value: false,
    method: "Goodwill zählt NICHT zu den realen Vermögenswerten.",
    rationale: "Goodwill ist weder ein realer Vermögenswert noch ein einzeln verwertbares Recht; die vorsichtigere Variante lässt ihn weg.",
    alternative: "Goodwill als Recht mitzählen.",
    source: "SS 21, 3/19",
  },
  operatingReceivablesCountAsReal: {
    value: true,
    method:
      "Forderungen aus dem laufenden Geschäft werden bei den realen Vermögenswerten nicht abgezogen. Angesetzt werden die Forderungen nach Wertberichtigung aus der Bilanz. Cash, Finanzanlagen und Goodwill werden weiterhin abgezogen.",
    rationale:
      "SS 59, 8/1 (2018): Bei einem laufenden Unternehmen mit erlaubter Tätigkeit spielt der Anteil der Forderungen keine Rolle, solange sie aus dem Geschäft entstehen und das Unternehmen nicht nur aus Forderungen besteht (Zugehörigkeit, tabaʿiyya). Laut den Supervisory Instructions Nr. 1 ändert SS 59 widersprechende Regeln früherer Standards ab. Wortlaut zuerst.",
    alternative: "Forderungen wie in SS 21, 3/19 abziehen (strenger als der geltende Text).",
    source: "SS 59, 8/1; SS 59, Supervisory Instructions Nr. 1; SS 21, 3/19",
  },
  intangiblesCountAsRights: {
    value: true,
    method: "Immaterielle Werte (ohne Goodwill) und Nutzungsrechte zählen als „Rechte“ mit.",
    rationale: "Der Text nennt Nutzungsrechte und Rechte ausdrücklich.",
    alternative: "Nur physische Vermögenswerte zählen.",
    source: "SS 21, 3/19",
  },

  // -------------------------------------------------------------- Tätigkeit
  articlesReview: {
    value: "manual",
    method: "Der Unternehmenszweck laut Satzung wird manuell geprüft. Unklar oder ungeprüft → „nicht geprüft“.",
    rationale: "Für die Satzung gibt es keine automatisierbare Datenquelle; eigener Prüfpunkt getrennt von A1.",
    alternative: "Nur einen Hinweis anzeigen, ohne Statuswirkung.",
    source: "SS 21, 3/4/1",
  },
  goldSilverCurrencyDealers: {
    value: "exclude",
    method: "Unternehmen, deren Kerngeschäft der Handel mit Gold, Silber oder Währungen ist, werden ausgeschlossen.",
    rationale: "Für sie gelten die Sarf-Regeln, die ein börslicher Handel nicht erfüllt; die vorsichtigere Variante schließt aus.",
    alternative: "Nur markieren.",
    source: "SS 21, 3/19",
  },
  manualReviewExpiry: {
    value: "on_new_annual_report",
    method: "Manuelle Prüfungen laufen ab, sobald ein neuer Jahresabschluss vorliegt, und müssen erneut bestätigt werden.",
    rationale: "Satzung und Segmente können sich mit jedem Geschäftsjahr ändern; Re-Screening nach jedem Abschluss (3/4/8).",
    alternative: "Feste Gültigkeitsdauer (z. B. 12 Monate).",
    source: "SS 21, 3/4/8",
  },

  // ------------------------------------------------------------- Purification
  purificationFrequency: {
    value: "quarterly",
    method: "Reinigungsbetrag pro Aktie quartalsweise; Stichtag jeweils Quartalsende.",
    rationale:
      "SS 21, 3/4/6/1 nennt ausdrücklich quartalsweise, jährliche oder andere Perioden. Die Quartale ordnen die Reinigung genauer zu, wenn eine Aktie nur einen Teil des Jahres gehalten wird.",
    alternative: "Jährlich zum Geschäftsjahresende.",
    source: "SS 21, 3/4/6/1; SS 21, 3/4/6/4",
  },

  // -------------------------------------------------------------------- Zakat
  zakatDeductLiabilities: {
    value: false,
    method: "Zakatpflichtiges Vermögen pro Aktie ohne Abzug von Verbindlichkeiten; der Wert mit Abzug wird zusätzlich als Info angezeigt.",
    rationale: "Wortlaut 4/2/4 nennt keinen Abzug; ohne Abzug ist die vorsichtigere Variante.",
    alternative: "Nettovermögensmethode mit Abzug kurzfristiger Verbindlichkeiten (SS 35, 2/1/1).",
    source: "SS 35, 4/2/4; SS 35, 2/1/1",
  },
  zakatReceivablesField: {
    value: "netReceivables",
    method: "Einbringbare Forderungen = Forderungen nach Wertberichtigung (netReceivables).",
    rationale: "Der bilanzielle Nettowert zieht voraussichtlich uneinbringliche Forderungen bereits ab.",
    alternative: "Bruttoforderungen.",
    source: "SS 35, 4/2/4",
  },
  zakatFallback: {
    value: "net_income_minus_distributions",
    method: "Fallback ohne zakatpflichtiges Vermögen: Nettogewinn der Periode minus Ausschüttungen der Periode, pro Aktie.",
    rationale: "Entspricht dem „unverbrauchten Teil des Nettogewinns“ für genau die Periode.",
    alternative: "Gewinnrücklagen (kumuliert über alle Jahre).",
    source: "SS 35, 4/2/4",
  },
  zakatCalculator: {
    value: { nisabGoldGrams: 85, rateLunarPct: 2.5, rateSolarPct: 2.577 },
    method: "Nisab = Wert von 85 g Gold am Stichtag; Satz 2,5 % (Mondjahr) bzw. 2,577 % (Sonnenjahr); Kurse und Wechselkurse am Fälligkeitstag.",
    rationale: "Wortlaut des Standards.",
    alternative: "Keine.",
    source: "SS 35, 3/2/2; SS 35, 3/2/4; SS 35, 3/3; SS 35, 5/1/1; SS 35, 5/2/2",
  },

  // --------------------------------------------------- Ableitungen (abschaltbar)
  ruleG1LookThrough: {
    value: true,
    method: "Jede im ETF enthaltene Aktie muss die Stufen A bis D bestehen.",
    rationale: "Abgeleitet aus SS 21 und SS 27.",
    alternative: "Konformität aus der Indexmethodik übernehmen.",
    source: "SS 21; SS 27; SS 35, 5/1/4/3",
    derivation: true,
  },
  ruleG2Synthetic: {
    value: true,
    method: "Synthetische ETFs (Nachbildung über Swaps) sind nicht konform.",
    rationale: "Swaps verstoßen gegen SS 21, 3/14; kommt SS 27, 6/1 nahe.",
    alternative: "Nur markieren.",
    source: "SS 21, 3/14; SS 27, 6/1",
    derivation: true,
  },
  ruleG3SecuritiesLending: {
    value: true,
    method: "Verleiht der Fonds Wertpapiere, ist er nicht konform.",
    rationale:
      "SS 21, 3/9 verbietet das Verleihen von Aktien, 3/15 die Vermietung von Aktien, wie sie an Börsen üblich ist. Die Wertpapierleihe eines Fonds gegen Gebühr entspricht dem. Das unentgeltliche Verleihen zur Verpfändung nach 3/16 ist davon nicht betroffen.",
    alternative: "Nur markieren.",
    source: "SS 21, 3/9; SS 21, 3/15",
    derivation: true,
  },
  ruleG4Derivatives: {
    value: true,
    method: "Setzt der Fonds Futures, Optionen oder Swaps ein, ist er nicht konform.",
    rationale: "Derivate sind nach SS 21, 3/12–3/14 und SS 27, 6/2–6/3 unzulässig.",
    alternative: "Nur markieren.",
    source: "SS 21, 3/12–3/14; SS 27, 6/2; SS 27, 6/3",
    derivation: true,
  },
  ruleG5Purification: {
    value: true,
    method:
      "Purification für ETFs als gewichtete Summe der Reinigungsquoten der enthaltenen Aktien (Reinigungsbetrag je Aktie ÷ Kurs am Stichtag), ausgegeben je 1.000 € Anlagebetrag.",
    rationale:
      "Beträge je Aktie verschiedener Unternehmen lassen sich nicht direkt addieren; über die Quote je Kurswert wird die Gewichtung rechnerisch sinnvoll.",
    alternative: "Summe der Beträge je Aktie × Stückzahl je Fondsanteil (braucht Stückzahlen statt Gewichte).",
    source: "SS 21, 3/4/6/4 [Ableitung]",
    derivation: true,
  },
  etfFundInterestIncome: {
    value: true,
    method: "Fondseigene Zinserträge (z. B. auf das Cash des ETFs) werden zusätzlich in die Reinigungsquote eingerechnet.",
    rationale: "Auch der Fonds selbst kann verbotene Einnahmen erzielen; sie fallen anteilig auf jeden Fondsanteil.",
    alternative: "Nur die Reinigungsquoten der enthaltenen Aktien.",
    source: "SS 21, 3/4/4; SS 21, 3/4/6/4 [Ableitung]",
    derivation: true,
  },
  etfPurificationMinCoveragePct: {
    value: 95,
    method: "Die Reinigungsquote eines ETFs wird nur berechnet, wenn für mindestens 95 % des Fondsgewichts Reinigungsquoten vorliegen; darunter „nicht geprüft“.",
    rationale: "Ein Wert, der auf zu wenigen Bestandteilen beruht, wäre nicht aussagekräftig. Die Abdeckung wird immer in Prozent angezeigt.",
    alternative: "Nur bei vollständiger Abdeckung (100 %) berechnen.",
    source: "SS 21, 3/4/6/4 [Ableitung]",
    derivation: true,
  },
  etfPurificationUncovered: {
    value: "extrapolate",
    method:
      "Der fehlende Teil (bis zu 5 % des Gewichts) wird mit der nach Gewicht gewichteten Durchschnittsquote der abgedeckten Titel hochgerechnet.",
    rationale:
      "Ein Ansatz mit 0 würde unterstellen, dass nicht geprüfte Titel keine verbotenen Einnahmen haben. Das widerspricht B6: Unklare Einnahmen gelten nie automatisch als unbedenklich.",
    alternative: "Fehlenden Teil mit 0 ansetzen.",
    source: "SS 21, 3/4/4; SS 21, 3/4/6/4 [Ableitung]",
    derivation: true,
  },
};

// Produktausschlüsse (H) — werden nie als konform ausgewiesen.
export const EXCLUDED_PRODUCT_TYPES = {
  margin: "SS 21, 3/5",
  short_sale: "SS 21, 3/6",
  securities_lending: "SS 21, 3/9; SS 21, 3/15",
  future: "SS 21, 3/12",
  option: "SS 21, 3/13",
  swap: "SS 21, 3/14",
  salam: "SS 21, 3/11",
  index_trading: "SS 27, 6/1",
  index_option: "SS 27, 6/2",
  index_multiplier: "SS 27, 6/3",
  cfd: "SS 27, 6/1–6/3 [Ableitung]",
  knockout: "SS 27, 6/1–6/3 [Ableitung]",
  turbo: "SS 27, 6/1–6/3 [Ableitung]",
  factor_certificate: "SS 27, 6/1–6/3 [Ableitung]",
  index_warrant: "SS 27, 6/1–6/3 [Ableitung]",
  index_certificate: "SS 21, 4 und 5 [Ableitung]",
  leveraged_etf: "SS 21, 3/12–3/14 [Ableitung]",
  inverse_etf: "SS 21, 3/12–3/14 [Ableitung]",
  bond: "SS 21, 4 und 5",
};

// Pflichthinweise für die Oberfläche (F4, F5).
export const USER_NOTICES = {
  purificationMechanism:
    "Reinigung (Purification): Auch konforme Unternehmen haben oft einen kleinen Anteil verbotener Einnahmen, z. B. Zinserträge. Der auf deine Aktien entfallende Anteil wird gespendet. Maßgeblich ist, wer die Aktie am Ende der jeweiligen Periode hält; wer vorher verkauft, muss für diese Periode nicht reinigen. Der Betrag hängt nicht davon ab, ob eine Dividende gezahlt wurde oder ob du Gewinn oder Verlust gemacht hast.",
  purificationUse:
    "Der Reinigungsbetrag darf in keiner Form selbst genutzt werden, auch nicht zur Zahlung von Steuern.",
  noFatwa:
    "Tazkiyah gibt Prüfergebnisse nach den AAOIFI-Standards aus, keine religiösen Urteile.",
};

/** Löst Parameter auf: Standardwerte + optionale Überschreibungen { key: value }. */
export function resolveParameters(overrides = {}) {
  const resolved = {};
  for (const [key, def] of Object.entries(DEFAULT_PARAMETERS)) {
    resolved[key] = Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : def.value;
  }
  for (const key of Object.keys(overrides)) {
    if (!(key in DEFAULT_PARAMETERS)) throw new Error(`Unbekannter Screening-Parameter: ${key}`);
  }
  return resolved;
}
