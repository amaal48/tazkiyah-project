// src/data/glossar.js
//
// Glossar der Akademie: ein Datensatz für den Reiter „Glossar“ (#/lernen) und die Begriffe im Lektionstext
// ([[Begriff]] in content/lernen/*.md, src/lib/lessons.js). Ausgelagert aus App.jsx am 18.10.2026.
// Archiv Tazkiyah 30 (17.10.2026): ohne die Status-Begriffe, solange VITE_FEATURE_TAZKIYAH30 aus ist.

import { FEATURE_TAZKIYAH30 } from "../lib/features.js";

const t30 = (withList, archived) => (FEATURE_TAZKIYAH30 ? withList : archived);

export const GLOSSAR = [
  { term: "AAOIFI", def: "Accounting and Auditing Organization for Islamic Financial Institutions — das Gremium, dessen Standards Tazkiyah für das Screening zugrunde legt." },
  { term: "Aktie", def: "Ein Anteilsschein an einem Unternehmen. Hält man eine Aktie, ist man Miteigentümer und partizipiert an Gewinn und Verlust." },
  { term: "Anleihe (Bond)", def: "Ein festverzinsliches Wertpapier — der Anleger leiht dem Emittenten Geld gegen einen garantierten Zins. Klassische Anleihen gelten als Riba-basiert und damit nicht " + t30("konform", "zulässig") + "." },
  { term: "Benchmark", def: "Eine Vergleichsgröße, meist ein Index, an der die Wertentwicklung einer Anlage oder eines Portfolios gemessen wird." },
  { term: "Bilanzsumme", def: "Die Summe aller Vermögenswerte eines Unternehmens laut Bilanz — Ausgangspunkt für viele Kennzahlen, u. a. die Verschuldungsquote." },
  { term: "Blue Chip", def: "Eine große, etablierte, häufig gehandelte Aktie mit langer Historie — gilt meist als vergleichsweise stabil, " + t30("ist aber nicht automatisch Sharia-konform", "erfüllt aber nicht automatisch die Sharia-Kriterien") + "." },
  { term: "Cashflow (Free Cash Flow)", def: "Der Betrag, der einem Unternehmen nach Investitionen tatsächlich an liquiden Mitteln verbleibt — ein Indikator für finanzielle Substanz unabhängig vom bilanziellen Gewinn." },
  { term: "DJIM (Dow Jones Islamic Market Index)", def: "Einer der bekanntesten globalen Islamic-Investing-Indizes, mit eigenen Screening-Kriterien, die sich in Details von AAOIFI unterscheiden können." },
  { term: "Diversifikation", def: "Die Streuung von Investitionen über mehrere Werte, Branchen oder Regionen, um das Risiko einzelner Positionen abzufedern." },
  { term: "Dividende", def: "Ein Teil des Unternehmensgewinns, der an die Aktionäre ausgeschüttet wird. Kann einen kleinen, unzulässigen Anteil enthalten — siehe Purification." },
  { term: "Dividendenrendite", def: "Die jährliche Dividende im Verhältnis zum aktuellen Aktienkurs, meist in Prozent angegeben." },
  { term: "EPS (Gewinn je Aktie)", def: "Earnings per Share — der Unternehmensgewinn geteilt durch die Anzahl ausstehender Aktien." },
  { term: "ETF", def: "Ein Fonds, der einen Index oder Korb von Wertpapieren nachbildet und wie eine Aktie an der Börse gehandelt wird." },
  { term: "Ex-Dividende-Tag", def: "Der Stichtag, ab dem eine Aktie ohne Anspruch auf die nächste Dividendenzahlung gehandelt wird." },
  { term: "Fiqh al-Muamalat", def: "Der Teilbereich des islamischen Rechts, der wirtschaftliche und finanzielle Transaktionen regelt — die rechtliche Grundlage hinter den Sharia-Screening-Kriterien." },
  { term: "Fiskaljahr", def: "Der Zwölf-Monats-Zeitraum, den ein Unternehmen für seine Finanzberichterstattung nutzt — muss nicht mit dem Kalenderjahr übereinstimmen." },
  { term: "Fractional Shares (Teilaktien)", def: "Bruchteile einer Aktie — ermöglichen es, auch mit kleinem Budget in teure Einzeltitel zu investieren." },
  { term: "Free Float", def: "Der Anteil der Aktien eines Unternehmens, der frei an der Börse gehandelt wird, ohne fest gebundene Großaktionäre." },
  { term: "Gharar", def: "Übermäßige Unsicherheit oder Mehrdeutigkeit in einem Geschäft. Gilt neben Riba als zentrales Ausschlussprinzip im islamischen Finanzwesen." },
  { term: "Growth Stock (Wachstumsaktie)", def: "Eine Aktie, deren Wert vor allem auf erwartetem zukünftigem Wachstum beruht, oft mit wenig oder keiner Dividende." },
  {
    term: "Halal",
    def: t30(
      "Wörtlich „erlaubt“. Im Anlagekontext der Begriff für Anlagen, die nach islamischen Grundsätzen zulässig sind. Tazkiyah vergibt ihn nicht als Bewertung, sondern zeigt, ob eine Aktie die Prüfungen nach den AAOIFI-Standards besteht (konform, nicht konform, nicht geprüft). Ob eine Anlage für dich zulässig ist, entscheidest du, gegebenenfalls mit Rat eines Gelehrten.",
      "Wörtlich „erlaubt“. Im Anlagekontext der Begriff für Anlagen, die nach islamischen Grundsätzen zulässig sind. Tazkiyah vergibt ihn nicht und gibt keine Sharia-Einschätzung zu einzelnen Aktien ab. Ob eine Anlage für dich zulässig ist, entscheidest du, gegebenenfalls mit Rat eines Gelehrten."
    ),
  },
  { term: "Haram", def: "Wörtlich 'verboten'. Das Gegenstück zu Halal — bezeichnet Geschäftsfelder oder Praktiken, die nach islamischen Grundsätzen unzulässig sind." },
  { term: "IPO (Börsengang)", def: "Initial Public Offering — der erste Verkauf von Unternehmensanteilen an die Öffentlichkeit über die Börse." },
  { term: "ISIN", def: "International Securities Identification Number — eine weltweit eindeutige Kennung für ein Wertpapier, unabhängig vom Börsenplatz." },
  { term: "Ijara", def: "Eine islamische Leasing-Struktur: Der Eigentümer vermietet einen Vermögenswert gegen feste Zahlungen, statt einen verzinsten Kredit zu vergeben." },
  { term: "KGV (P/E-Ratio)", def: "Kurs-Gewinn-Verhältnis — der Aktienkurs geteilt durch den Gewinn je Aktie. Ein gängiges, aber grobes Bewertungsmaß." },
  { term: "Klumpenrisiko", def: "Die Gefahr, dass ein Portfolio zu stark auf wenige Werte, Branchen oder Regionen konzentriert ist und dadurch überdurchschnittlich schwankt." },
  FEATURE_TAZKIYAH30 && { term: "Konform", def: "Alle Prüfungen nach den AAOIFI-Standards (SS 21, 27 und 35), die Tazkiyah durchführt, sind bestanden. Das ist keine Anlageempfehlung und kein Rechtsgutachten (Fatwa)." },
  { term: "Liquidität", def: "Wie leicht sich ein Vermögenswert kurzfristig in Bargeld umwandeln lässt, ohne größere Wertverluste." },
  { term: "Marktkapitalisierung", def: "Der Gesamtwert aller ausstehenden Aktien eines Unternehmens (Aktienkurs × Anzahl Aktien). Dient als Bezugsgröße für Verschuldungs- und Cash-Quote im Screening." },
  { term: "Maysir", def: "Glücksspiel bzw. Spekulation ohne wirtschaftliche Substanz — neben Riba und Gharar ein weiteres zentrales Ausschlussprinzip im islamischen Finanzwesen." },
  { term: "Mudarabah", def: "Ein islamisches Gewinnbeteiligungsmodell: Ein Kapitalgeber stellt Geld, ein Unternehmer die Arbeit — Gewinne werden nach vereinbartem Schlüssel geteilt, Verluste trägt primär der Kapitalgeber." },
  { term: "Murabaha", def: "Ein Kostenaufschlag-Verkauf: Der Verkäufer nennt offen Einkaufspreis und Marge, statt Zinsen zu berechnen — eine gängige Struktur im islamischen Handelsfinanzwesen." },
  { term: "Musharakah", def: "Eine Partnerschaft, bei der mehrere Parteien gemeinsam Kapital einbringen und Gewinn wie Verlust anteilig tragen — Grundlage vieler islamischer Beteiligungsmodelle." },
  FEATURE_TAZKIYAH30 && { term: "Nicht geprüft", def: "Keine Prüfung ist durchgefallen, aber mindestens eine steht noch aus oder ließ sich mit den vorhandenen Daten nicht abschließen. Auf der Detailseite steht, was fehlt." },
  FEATURE_TAZKIYAH30 && { term: "Nicht konform", def: "Mindestens eine Prüfung ist nicht bestanden, zum Beispiel weil die zinstragenden Schulden über dem Grenzwert liegen. Auf der Detailseite steht, welche." },
  { term: "Nisab", def: "Der Vermögens-Schwellenwert, ab dem Zakat fällig wird. Liegt das Gesamtvermögen darunter, entfällt die Zakat-Pflicht für den Zeitraum." },
  { term: "Portfolio", def: t30("Die Gesamtheit der Anlagen einer Person, bei Tazkiyah mit dem Status je Position.", "Die Gesamtheit der Anlagen einer Person.") },
  { term: "Purification (Dividenden-Reinigung)", def: "Das Abtrennen des unzulässigen Ertragsanteils (meist Zinserträge) einer ansonsten erlaubten Dividende — traditionell durch Spende dieses Anteils." },
  { term: "Qard Hasan", def: "Ein zinsloses, wohltätiges Darlehen im islamischen Finanzwesen — der Kreditgeber erwartet ausschließlich die Rückzahlung des Nennbetrags." },
  { term: "Rebalancing", def: "Das planmäßige Zurücksetzen eines Portfolios auf eine Ziel-Gewichtung, nachdem sich die Kurse einzelner Positionen unterschiedlich entwickelt haben." },
  { term: "Riba", def: "Zins — im islamischen Finanzwesen grundsätzlich verboten, da ein garantierter Gewinn ohne unternehmerisches Risiko als ausbeuterisch gilt. Zentrales Ausschlusskriterium beim Screening." },
  { term: "Sharia-Screening", def: "Die zweistufige Prüfung einer Aktie: zuerst das Geschäftsmodell (Branche), danach die Finanzkennzahlen (u. a. Verschuldung, Cash-Quote) gegen definierte Grenzwerte." },
  { term: "Short Selling (Leerverkauf)", def: "Der Verkauf eines geliehenen Wertpapiers in der Erwartung fallender Kurse. Gilt wegen des Verkaufs nicht besessener Vermögenswerte bei den meisten Gelehrten als problematisch." },
  { term: "Sparplan", def: "Eine regelmäßige, meist monatliche Investition eines festen Betrags — unabhängig vom aktuellen Kurs." },
  { term: "Sukuk", def: "Die " + t30("islamkonforme", "islamische") + " Alternative zur klassischen Anleihe — strukturiert über reale Vermögenswerte oder Beteiligungen statt über einen garantierten Zins." },
  { term: "TER (Total Expense Ratio)", def: "Die jährliche Gesamtkostenquote eines Fonds oder ETFs, angegeben in Prozent des verwalteten Vermögens." },
  { term: "Takaful", def: "Islamische Versicherung auf Basis gegenseitiger Beistandsleistung — als Alternative zu klassischen, zinsbasierten Versicherungsmodellen." },
  { term: "Value Stock (Substanzaktie)", def: "Eine Aktie, die im Verhältnis zu ihren fundamentalen Kennzahlen (z. B. KGV) als unterbewertet gilt." },
  { term: "Verschuldungsquote", def: "Das Verhältnis von Schulden zur Marktkapitalisierung. Bei Tazkiyah/AAOIFI-Orientierung " + t30("gilt eine Aktie ab 30% in der Regel als nicht mehr konform", "erfüllt eine Aktie ab 30 % in der Regel die Kriterien nicht mehr") + "." },
  { term: "Volatilität", def: "Ein Maß für die Schwankungsbreite eines Kurses über einen bestimmten Zeitraum — höhere Volatilität bedeutet größere Kursausschläge in beide Richtungen." },
  { term: "WKN", def: "Wertpapierkennnummer — eine in Deutschland gebräuchliche, sechsstellige Kennung für ein Wertpapier, neben der international gültigen ISIN." },
  { term: "Waqf", def: "Eine islamische Stiftung — Vermögen wird dauerhaft für einen wohltätigen oder gemeinnützigen Zweck gebunden." },
  { term: "Zakat", def: "Die jährliche Pflichtabgabe auf bestimmtes Vermögen oberhalb des Nisab. Unabhängig von der Dividenden-Purification und meist einmal jährlich auf das Gesamtvermögen berechnet." },
].filter(Boolean); // Archiv: ohne die Status-Begriffe

/** Anker eines Begriffs im Glossar-Reiter (#/lernen?glossar=…). */
export function glossarId(term) {
  return "glossar-" + String(term).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Namen, unter denen ein Eintrag gefunden wird: „Anleihe (Bond)“ → „Anleihe (Bond)“, „Anleihe“, „Bond“. */
function names(term) {
  const out = [term];
  const m = term.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (m) out.push(m[1], m[2]);
  return out.map((n) => n.trim().toLowerCase());
}

/** Eintrag zu einem Begriff aus dem Lektionstext (Groß-/Kleinschreibung egal); unbekannt → null. */
export function findGlossar(term) {
  const q = String(term || "").trim().toLowerCase();
  if (!q) return null;
  return GLOSSAR.find((g) => names(g.term).includes(q)) || null;
}

/** Die ersten ein bis zwei Sätze einer Erklärung (für den Kasten im Lektionstext). */
export function shortDef(def) {
  const sentences = String(def).match(/[^.!?]+[.!?]+(\s|$)/g) || [String(def)];
  const first = sentences[0].trim();
  return first.length < 90 && sentences[1] ? `${first} ${sentences[1].trim()}` : first;
}
