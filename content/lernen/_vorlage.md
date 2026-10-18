---
# Vorlage für Lektionen der Akademie. Dateien, die mit „_“ beginnen, erscheinen nicht auf der Website.
# Neue Lektion: Datei kopieren und umbenennen in <slug>.md, slug laut src/data/lernpfad.js (Lektion 1.3 → 1-3.md).
# Titel und Satz der Lektion kommen aus src/data/lernpfad.js, nicht aus dieser Datei.
# Sobald die Datei im Repository ist (Commit und Deployment), ist die Lektion online.
#
# aktualisiert: Pflicht, Datum der letzten inhaltlichen Änderung (JJJJ-MM-TT)
aktualisiert: 2026-10-18
# lesezeit: Minuten, nur angeben, wenn die automatische Schätzung (200 Wörter je Minute) nicht passt
# inhalt: true zeigt „Auf dieser Seite“ auch bei kurzen Lektionen (sonst ab ca. 1.200 Wörtern)
# abschluss: nur bei der letzten Lektion einer Stufe (1.7, 2.10, 3.8): Satz im Kasten „Stufe n abgeschlossen“
# abschluss: Satz zum Abschluss der Stufe.
---
## Kurz erklärt

Zwei bis drei Sätze: Worum geht es, und was weiß man am Ende? Ein Begriff aus dem Glossar wird so markiert: [[Dividende]]. Mit anderem Text: [[Anleihe|Anleihen]].

## Erklärung

Erster Absatz der Erklärung. **Fett** und *kursiv* gehen, Links so: [Methodik](#/methodik) oder [Quelle](https://www.beispiel.de). Ein Quellenverweis springt zur Liste unten.[^1]

### Zwischenüberschrift

Weiterer Absatz. Listen gehen auch:

- erster Punkt
- zweiter Punkt

:::beispiel Rechnung
Ein kurzes Rechenbeispiel. Die Tabelle hat zwei Spalten; eine Zeile, deren erste Zelle ganz **fett** ist, ist das Ergebnis (fett, mit Linie darüber).

| Bezeichnung | 100,00 € |
| Abzug | 25,00 € |
| **Ergebnis** | **75,00 €** |
:::

## Islamischer Blick

Nur, wenn die Lektion einen islamischen Blick hat; sonst den ganzen Abschnitt weglassen.

## Häufige Fehler

- Erster typischer Fehler, in einem Satz.
- Zweiter typischer Fehler.

## Merke

1. Erster Punkt zum Mitnehmen.
2. Zweiter Punkt.
3. Dritter Punkt.

## Quiz

### Frage: Eine Frage zur Lektion?
- [ ] Antwort A
- [x] Antwort B (genau eine Antwort ist richtig, mit [x] markiert)
- [ ] Antwort C
> Erklärung: Ein bis zwei Sätze, warum B richtig ist.

## Quellen

1. Herausgeber, Titel, Datum, https://www.beispiel.de/seite
2. Herausgeber, Titel, Datum
