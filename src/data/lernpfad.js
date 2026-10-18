// src/data/lernpfad.js
//
// Akademie (#/lernen), Lernpfad nach dem Entwurf „Akademie – Entwurf“ (Claude Design, 18.10.2026):
// drei Stufen, 25 Lektionen. Titel und Sätze wörtlich nach Vorgabe.
// Eine Lektion ist „online“, sobald content/lernen/<slug>.md existiert (src/lib/lessonFiles.js), sonst „folgt“.
// islamisch: Lektion hat einen „Islamischen Blick“ (Markierung in der Übersicht).

export const STUFEN = [
  { nr: 1, name: "Grundlagen", untertitel: "Verstehen, worum es geht" },
  { nr: 2, name: "Einsteigen", untertitel: "Der erste Schritt" },
  { nr: 3, name: "Fortgeschritten", untertitel: "Tiefer verstehen und selbst prüfen" },
];

const L = (nr, title, text, islamisch = false) => ({
  nr,
  slug: nr.replace(".", "-"),
  stufe: Number(nr.split(".")[0]),
  title,
  text,
  islamisch,
});

export const LESSONS = [
  L("1.1", "Warum überhaupt investieren?", "Sparen, Inflation, Zuwachs über viele Jahre."),
  L("1.2", "Was sagt der Islam zum Investieren?", "Handel ist erlaubt; Riba, Gharar und Maysir verständlich erklärt.", true),
  L("1.3", "Was ist eine Aktie?", "Miteigentum an einer Firma, Kurs, Dividende; Stamm- und Vorzugsaktien.", true),
  L("1.4", "Was ist ein ETF?", "Index, Streuung, warum viele damit anfangen."),
  L("1.5", "Was ist eine Börse und wie entsteht ein Kurs?", "Angebot und Nachfrage, Handelszeiten, Handelsplätze."),
  L("1.6", "Risiko und Schwankung", "Warum Kurse fallen, Zeithorizont, Streuung, Notgroschen zuerst."),
  L("1.7", "Was gehört nicht in ein halales Depot?", "Anleihen, Zinsprodukte, Derivate, Banken und Versicherer im Überblick.", true),
  L("2.1", "Bevor du anfängst", "Notgroschen, Kredite mit Zinsen, Ziel und Zeitraum festlegen."),
  L("2.2", "Broker und Depot", "Was ein Broker ist und worauf du achtest.", true),
  L("2.3", "Depot eröffnen, Schritt für Schritt", "Konto anlegen, Identität bestätigen, Freistellungsauftrag."),
  L("2.4", "Die erste Order", "Market, Limit, Stop, Spread, Handelsplatz wählen."),
  L("2.5", "Sparplan oder Einmalanlage?", "Unterschiede, Vor- und Nachteile, mit Rechenbeispiel."),
  L("2.6", "Die Depotansicht lesen", "Position, Einstandskurs, Gewinn/Verlust, Chart und Zeiträume."),
  L("2.7", "Derivate: warum nicht?", "Optionsscheine, Knock-outs, Faktor-Zertifikate, CFDs, Hebel, Leerverkauf.", true),
  L("2.8", "Was ist ein Portfolio?", "Streuung, Gewichtung, Rebalancing."),
  L("2.9", "Steuern in Deutschland", "Abgeltungsteuer, Sparerpauschbetrag, Freistellungsauftrag, Dividenden aus den USA."),
  L("2.10", "Zinsen vermeiden und Dividenden reinigen", "Einstellungen beim Broker, was tun mit erhaltenen Zinsen.", true),
  L("3.1", "Geschäftsberichte lesen", "Bilanz, Gewinn- und Verlustrechnung, Cashflow; 10-K und 10-Q bei US-Firmen."),
  L("3.2", "Finanzkennzahlen", "Umsatz, Marge, Verschuldung, KGV, Dividendenrendite: was sie sagen und was nicht."),
  L("3.3", "Woran erkennt man eine halale Aktie?", "Die Kriterien nach AAOIFI SS 21 im Überblick.", true),
  L("3.4", "Selbst prüfen am Beispiel Muster AG", "Wo die Zahlen im 10-K/10-Q stehen, Rechnen Schritt für Schritt.", true),
  L("3.5", "Reinigung berechnen", "Den Anteil berechnen und weitergeben.", true),
  L("3.6", "Zakat auf Aktien und ETFs", "Was zählt und wie man rechnet.", true),
  L("3.7", "Halal-ETFs genauer", "Wie die Indizes prüfen, Unterschied MSCI und AAOIFI.", true),
  L("3.8", "Analystenbewertungen und Kursziele", "Woher sie kommen, wie verlässlich sie sind, Tipps aus Social Media einordnen."),
];

export function lessonBySlug(slug) {
  return LESSONS.find((l) => l.slug === slug) || null;
}

export function stufeByNr(nr) {
  return STUFEN.find((s) => s.nr === nr) || null;
}

export function lessonsOfStufe(nr) {
  return LESSONS.filter((l) => l.stufe === nr);
}
