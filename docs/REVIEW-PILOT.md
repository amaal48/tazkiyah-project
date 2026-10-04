# A2/B3-Pilot: KI-Vorprüfung mit Kontrolle (Stand 03.10.2026)

Ziel: Für zehn Aktien die **Satzung (A2)** und die **Umsatzsegmente (B3)** von der KI vorprüfen lassen, alles selbst kontrollieren und danach entscheiden, ob und wie wir den großen Lauf machen.

Pilot-Aktien: **NVDA, JNJ, AAPL, AMZN, GOOGL, DIS, BRK-B, MSFT, KO, HD** (einfache Fälle, Grauzonen, Medien, Mischkonzern, mehrere Aktiengattungen).

Was gebaut ist (alles in `scripts/`):

| Datei | Aufgabe |
|---|---|
| `sec-fetch.mjs` | holt das jüngste 10-K und die Satzung von der SEC, schreibt Texte und `slices.md` nach `review-work/<TICKER>/` |
| (Claude Code) | liest die Ausschnitte und schreibt `review-work/<TICKER>/draft.json` |
| `check-quotes.mjs` | prüft **unabhängig von der KI**, ob jedes Zitat wörtlich in der Quelldatei steht |
| `review-sheet.mjs` | erzeugt den Kontrollbogen `review-work/kontrollbogen.md` |
| `review-to-sql.mjs` | erzeugt aus bestätigten Entwürfen `review-work/insert-reviews.sql` für den Supabase SQL Editor |
| `lib/review.mjs`, `lib/sources.mjs`, `lib/review.test.mjs` | gemeinsame Funktionen und ihre Tests |

Der Ordner `review-work/` ist nur lokal und kommt nicht nach GitHub.

## 1. Einmal vorbereiten

1. In `.gitignore` die Zeile `review-work/` ergänzen.
2. In der **normalen Terminal-App** (nicht in Claude Code), im Projektordner:
   ```
   cd ~/Desktop/Website
   export SEC_USER_AGENT="Tazkiyah Vorname Nachname deine@mail.de"
   ```
   Die SEC verlangt in jeder Anfrage Name und E-Mail-Adresse. Das ist kein Geheimwort, aber trage deine echte Adresse ein. Die Variable gilt nur in diesem Terminal-Fenster.
3. Funktionstest mit einer Aktie:
   ```
   node scripts/sec-fetch.mjs AAPL
   ```
   Erwartet: „ok“, das Datum des 10-K und „Satzung gefunden“. In `review-work/AAPL/` liegen dann `10k.txt`, `charter.txt`, `slices.md` und `meta.json`.

Der Abruf ist von der Entwicklungsumgebung aus **nicht getestet**, weil sie die SEC-Seite nicht erreicht. Der erste Lauf kann deshalb Fehler zeigen. Schick sie mir dann einfach, wir beheben sie.

## 2. Die zehn Aktien holen

```
node scripts/sec-fetch.mjs NVDA JNJ AAPL AMZN GOOGL DIS BRK-B MSFT KO HD
```

Das dauert einige Minuten (das Skript wartet zwischen den Anfragen, wie die SEC es verlangt). Am Ende steht eine Zusammenfassung. Bei „Satzung NICHT gefunden“ wird A2 später `unclear`.

## 3. Entwürfe schreiben lassen (Claude Code)

Diese Anweisung in Claude Code geben:

```
Lies docs/REVIEW-PILOT.md (Abschnitt 3 und 4) und schreibe für die Aktien NVDA, JNJ, AAPL, AMZN, GOOGL, DIS, BRK-B, MSFT, KO und HD je einen Entwurf nach dem Format in Abschnitt 4. Arbeite pro Aktie in review-work/<TICKER>/: lies meta.json und slices.md, durchsuche bei Bedarf 10k.txt und charter.txt (mit grep und Ausschnitten, nicht komplett lesen) und schreibe draft.json. Führe kein SQL aus, ändere nichts außerhalb von review-work/ und erfinde nichts. Wenn etwas unklar ist, schreibe "unclear" mit Begründung. Am Ende: Tabelle mit Ticker, A2-Ergebnis, B3-Ergebnis, Zahl der Grenzfälle und was nicht geklappt hat.
```

### Regeln für die Vorprüfung (gelten für Claude Code)

- **Jedes `pass` und `fail` braucht ein wörtliches Zitat**, kurz (höchstens 450 Zeichen), **aus der Quelldatei kopiert**. Das Zitat muss **vollständig** sein und mit einem Satzzeichen enden, nicht mitten im Satz abbrechen. Muss es gekürzt werden, bei einem Satzende schneiden. Prüfe jedes Zitat mit `grep -F` gegen `charter.txt` bzw. `10k.txt`. Wird es nicht gefunden, darf es nicht im Entwurf stehen und das Ergebnis ist `unclear`.
- **Ein falsches „konform“ ist der teure Fehler.** Im Zweifel `unclear`.
- **A2:**
  - **Auslegungsregel (Stand 04.10.2026):** A2 prüft, ob die Satzung verbotene Geschäfte ausdrücklich zum Zweck macht (z. B. Bank-, Versicherungs-, Glücksspiel- oder Alkoholgeschäft als genannter Unternehmenszweck). Eine allgemeine Zweckklausel („jede rechtmäßige Tätigkeit“) oder eine Aufzählung allgemeiner Befugnisse (z. B. Wertpapiere halten, Schuldtitel ausgeben, Herstellungsverben wie „destillieren“ in einer allgemeinen Warenliste) gilt als pass. Ob das Geschäft selbst erlaubt ist, prüfen die anderen Kriterien.
  - `pass` nur bei eindeutiger Zweckklausel (z. B. „jede rechtmäßige Tätigkeit“ oder gleichwertig).
  - `fail`, wenn der Zweck verbotene Geschäfte oder Zinsgeschäfte nennt.
  - Satzung nicht gefunden, nur Änderungsurkunde ohne Zweckklausel oder nur per Verweis ohne Text: `unclear`.
  - **Weitere Satzungsdokumente** (`charter-weitere-N.txt`, in `slices.md` unter „Weitere Satzungsdokumente“): Prüfe, ob sie den Zweck-Artikel ändern. Ändern sie ihn nicht (z. B. nur Aktienzahl oder Aktiensplit), schreibe das in `reasoning`. Kannst du es nicht beurteilen, setze `needsHumanReview: true`.
  - Prüfe in `meta.json` (`charterDocs`), ob `charter.txt` die vollständige Satzung ist (nicht nur eine Änderungsurkunde), und nenne die Zeichenzahl in `reasoning`.
- **B3 (Pilot):**
  - `pass` nur, wenn aus den ausgewiesenen Segmenten und Produktlinien kein verbotener Anteil erkennbar ist. Alle Segmente in `segments` auflisten (Name, `dimension`, Umsatz, Währung, `category` = `null`). Geografische Segmente, Produktkategorien und Endmärkte sind verschiedene Aufteilungen derselben Umsätze: Gib bei jedem die `dimension` an und zähle nie verschiedene Dimensionen zusammen.
  - Sieht ein Segment nach einer verbotenen Kategorie aus oder ist gemischt oder nicht aufgeschlüsselt (Beispiel Apple: Musik steckt in den Dienstleistungen): **`unclear`** mit `reasonForReview` und der vermuteten Kategorie. **Im Pilot kein B3 `fail`**, denn dafür bräuchte es Beträge für den Jahresabschluss und vier Quartale, und die klären wir bei den Grenzfällen gemeinsam.
  - Zinserträge nicht prüfen, die zählt die Engine selbst.
- Kategorien verbotener Einnahmen: `interest_in_revenue`, `riba_other`, `derivatives`, `securities_lending`, `conventional_fund_fees`, `alcohol`, `pork`, `gambling`, `adult`, `drugs`, `tobacco`, `weapons`, `music`, `other` (siehe `src/screening/industryRules.js`).
- Den Standardtext der AAOIFI nicht abdrucken. Zitate nur aus den Unternehmensunterlagen.
- `confirmed` bleibt `false` oder fehlt. Das setze ich nach meiner Kontrolle selbst (oder bitte Claude Code darum).

## 4. Format von `draft.json`

```json
{
  "ticker": "AAPL",
  "cik": "0000320193",
  "annualPeriodEnd": "2025-09-27",
  "filing": { "form": "10-K", "url": "…", "filed": "2025-10-31" },
  "A2": {
    "result": "pass | fail | unclear",
    "quote": "wörtliches Zitat, kurz",
    "sourceUrl": "Link zur Satzung",
    "sourceNote": "z. B. Certificate of Incorporation, Art. III",
    "reasoning": "ein bis zwei Sätze",
    "confidence": "high | medium | low",
    "needsHumanReview": false,
    "reasonForReview": null,
    "confirmed": false
  },
  "B3": {
    "result": "pass | unclear",
    "segments": [ { "name": "…", "dimension": "Berichtssegment | geografisch | Produkt | Endmarkt", "revenue": 0, "currency": "USD", "category": null, "note": "" } ],
    "quote": "wörtliche Stelle zur Segmentbeschreibung",
    "sourceUrl": "Link zum 10-K",
    "sourceNote": "z. B. 10-K FY2025, Note 13, S. 52",
    "reasoning": "…",
    "confidence": "high | medium | low",
    "needsHumanReview": true,
    "reasonForReview": "z. B. Dienstleistungen enthalten Musik, nicht getrennt ausgewiesen",
    "confirmed": false
  }
}
```

Optional `quoteIsPartial: true` bei einer Prüfung, wenn ein Zitat bewusst nicht mit einem Satzende schließt.

`annualPeriodEnd` ist das Ende des Berichtsjahres des 10-K (`meta.json` → `tenK.reportDate`). In der Datenbank gilt später das Datum aus dem letzten Ergebnis der Aktie; das Skript nimmt dieses automatisch und das Datum aus dem Entwurf nur als Ersatz.

## 5. Kontrollieren

1. Zitate automatisch prüfen: `node scripts/check-quotes.mjs`. Jede Zeile muss mit `OK` beginnen. Bei `FEHLT` steht das Zitat nicht wörtlich in der Quelldatei, dann darf dieses Ergebnis nicht übernommen werden. Das ist eine zweite, unabhängige Prüfung neben der der KI. Zeilenumbrüche, Leerraum und typografische Anführungszeichen spielen dabei keine Rolle, der Wortlaut schon.
2. Kontrollbogen erzeugen: `node scripts/review-sheet.mjs`
3. `review-work/kontrollbogen.md` öffnen. Je Aktie und Prüfung:
   - Link öffnen, das Zitat im Dokument suchen (Strg+F bzw. Cmd+F).
   - Passt das Ergebnis zum Zitat? Bei B3: stimmen die Segmente mit dem Anhang des 10-K überein?
   - Grenzfälle stehen unten in einer eigenen Liste.
4. Notiere pro Aktie die **Zeit**, die du gebraucht hast, und **jeden Fehler**, den du findest (siehe Abschnitt 7).
5. Was du bestätigst, bekommt in `draft.json` bei der jeweiligen Prüfung `"confirmed": true`. Korrigierst du das Ergebnis, ändere `result` und notiere den Grund. Du kannst Claude Code bitten, das für dich einzutragen („Setze confirmed auf true für A2 bei NVDA, JNJ, KO“).

## 6. In die Datenbank übernehmen

1. SQL-Datei erzeugen (Namen einsetzen):
   ```
   node scripts/review-to-sql.mjs --reviewer "KI-Entwurf (Claude), kontrolliert von Vorname Nachname"
   ```
   Übernommen wird nur Bestätigtes mit `pass` oder `fail`, dessen Zitat wörtlich in der Quelldatei steht (dieselbe Prüfung wie `check-quotes`). Unklares und Unbelegtes bleibt draußen, die Ausgabe nennt jeden übersprungenen Eintrag.
2. `review-work/insert-reviews.sql` öffnen, den Inhalt in den **Supabase SQL Editor** einfügen und ausführen. Ein zweites Ausführen fügt nichts doppelt ein.
3. Die Kontrollabfrage am Ende der Datei zeigt, welche Zeilen wirklich gelandet sind. Fehlt eine Aktie, gibt es ihren Ticker in `securities` nicht (z. B. `BRK-B` gegen `BRK.B`).
4. Status neu rechnen lassen, ohne FMP-Abrufe (im Terminal, mit dem Geheimwort aus `read -s CRON_SECRET`):
   ```
   curl -s -H "Authorization: Bearer $CRON_SECRET" "https://tazkiyah-project-kohl.vercel.app/api/run-screening?limit=0"
   ```
   Danach zeigt die Detailseite die Prüfung mit Prüfer, Quelle und Datum.

Gilt eine Prüfung als „abgelaufen“, passt das Datum nicht: Der Cron hat für die Aktie einen anderen Jahresabschluss gespeichert. Dann das SQL noch einmal erzeugen und ausführen, es nimmt das Datum der Aktie automatisch.

## 7. Auswertung des Pilots

Pro Aktie festhalten und mir schicken:

| Ticker | A2 | B3 | Grenzfall? | Fehler der KI | Zeit (Min.) |
|---|---|---|---|---|---|

Daraus entscheiden wir:
- **Zeit pro Aktie** und damit der Aufwand für den großen Lauf.
- **Anteil der Grenzfälle** (`unclear`).
- **Gefundene Fehler** (falsches Zitat, falsches Ergebnis, falsche Segmente). Ein einziges falsches „bestanden“ ist ein ernstes Signal: Dann ändern wir Regeln oder Methode, bevor es weitergeht.
- Ob der große Lauf in Claude Code reicht oder ein API-Zugang sinnvoll ist.
