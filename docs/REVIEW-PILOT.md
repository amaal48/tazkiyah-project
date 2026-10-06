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
  - `pass`, wenn die Satzung kein verbotenes Geschäft ausdrücklich zum Unternehmenszweck macht. Das gilt für eine allgemeine Zweckklausel („jede rechtmäßige Tätigkeit“ oder gleichwertig) ebenso wie für eine Aufzählung von Zwecken und allgemeinen Befugnissen (siehe Auslegungsregel).
  - `fail`, wenn die Satzung ein verbotenes Geschäft (z. B. Bank-, Versicherungs-, Zins-, Glücksspiel- oder Alkoholgeschäft) ausdrücklich als Unternehmenszweck nennt.
  - `unclear` nur, wenn die Satzung nicht gefunden wurde, nur eine Änderungsurkunde ohne Zweckklausel oder nur ein Verweis ohne Text vorliegt, oder wenn sich nicht erkennen lässt, ob ein verbotenes Geschäft als Unternehmenszweck oder nur als allgemeine Befugnis genannt ist. Für A2 ist das der Zweifelsfall im Sinne von „Im Zweifel `unclear`“.
  - **Weitere Satzungsdokumente** (`charter-weitere-N.txt`, in `slices.md` unter „Weitere Satzungsdokumente“): Prüfe, ob sie den Zweck-Artikel ändern. Ändern sie ihn nicht (z. B. nur Aktienzahl oder Aktiensplit), schreibe das in `reasoning`. Kannst du es nicht beurteilen, setze `needsHumanReview: true`.
  - Prüfe in `meta.json` (`charterDocs`), ob `charter.txt` die vollständige Satzung ist (nicht nur eine Änderungsurkunde), und nenne die Zeichenzahl in `reasoning`.
- **B3 (Pilot):**
  - **Stichwort-Treffer (Stand 04.10.2026):** Behaupte nie, etwas stehe nicht im 10-K, ohne es mit keyword-hits.md oder grep geprüft zu haben. Jeder Treffer in keyword-hits.md ist vor einem B3 pass zu bewerten; betrifft er ein eigenes Geschäft des Unternehmens, ist das Ergebnis unclear (oder fail, wenn die Beträge vorliegen). Fund aus dem Pilot: Der KO-Entwurf behauptete fälschlich, Alkohol werde im 10-K nicht erwähnt.
  - `pass` nur, wenn aus den ausgewiesenen Segmenten und Produktlinien kein verbotener Anteil erkennbar ist. Alle Segmente in `segments` auflisten (Name, `dimension`, Umsatz, Währung, `category` = `null`). Geografische Segmente, Produktkategorien und Endmärkte sind verschiedene Aufteilungen derselben Umsätze: Gib bei jedem die `dimension` an und zähle nie verschiedene Dimensionen zusammen.
  - Sieht ein Segment nach einer verbotenen Kategorie aus oder ist gemischt oder nicht aufgeschlüsselt (Beispiel Apple: Musik steckt in den Dienstleistungen): **`unclear`** mit `reasonForReview` und der vermuteten Kategorie. **Im Pilot kein B3 `fail`**, denn dafür bräuchte es Beträge für den Jahresabschluss und vier Quartale, und die klären wir bei den Grenzfällen gemeinsam.
  - Zinserträge nicht prüfen, die zählt die Engine selbst.
- Kategorien verbotener Einnahmen: `interest_in_revenue`, `riba_other`, `derivatives`, `securities_lending`, `conventional_fund_fees`, `alcohol`, `pork`, `gambling`, `adult`, `drugs`, `tobacco`, `weapons`, `music`, `other` (siehe `src/screening/industryRules.js`).
- Den Standardtext der AAOIFI nicht abdrucken. Zitate nur aus den Unternehmensunterlagen.
- `confirmed` bleibt `false` oder fehlt. Das setze ich nach meiner Kontrolle selbst (oder bitte Claude Code darum).

### B3-Linie: strenge Auslegung (Stand 04.10.2026)
- Entscheidung von Amaal Ibrahim. Auslegung, keine Fatwa.
- Regel: Betreibt ein Unternehmen laut 10-K ein eigenes Geschäft, das verbotene Erträge enthalten kann (Kundenkredit, Finanzierungs- oder Kartenprogramme, Alkohol, Musik usw.), und werden diese Erträge nicht ausgewiesen, ist B3 unclear. Eigene Zinserträge aus Geldanlagen zählt die Engine selbst, sie führen nicht zu unclear.
- Nicht eingeführt: eine Obergrenzen-Regel (Abschätzung aus ausgewiesenem Bestand mal Zinssatz). Sie bleibt als Option für die Gegenlesung durch eine fachkundige Person.
- Folge im Pilot: HD, MSFT, KO, AAPL, AMZN, GOOGL und DIS stehen bei B3 auf unclear.

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
    "confirmed": false,
    "verification": "full | sample (setzt die Nutzerin beim Bestätigen)"
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
    "confirmed": false,
    "verification": "full | sample (setzt die Nutzerin beim Bestätigen)"
  }
}
```

Optional `quoteIsPartial: true` bei einer Prüfung, wenn ein Zitat bewusst nicht mit einem Satzende schließt.

`annualPeriodEnd` ist das Ende des Berichtsjahres des 10-K (`meta.json` → `tenK.reportDate`). In die Datenbank wird immer dieses Datum aus dem Entwurf eingetragen; weicht das Datum der Aktie in `screening_current` ab, wird der Eintrag übersprungen (seit 06.10.2026, siehe Abschnitt 6).

`sourceNote` nennt die **genaue Fundstelle**: Dokument (z. B. „10-K GJ 2025“, „Restated Certificate of Incorporation“), Abschnitt (Item, Note, Artikel) und die Seite, wenn das Dokument Seitenzahlen hat. Eine Seitenangabe ist keine Pflicht (Entscheidung 06.10.2026); die Methodik-Seite sagt „Jede Auswertung nennt die genaue Fundstelle.“

`verification` (seit 06.10.2026) hält fest, wie gründlich die Nutzerin gegengeprüft hat: `full` = alle zitierten Stellen vollständig nachgeprüft, `sample` = Stichprobe. Die KI setzt das Feld nie selbst.

## 5. Kontrollieren

**Regel zur Gegenprüfung (06.10.2026):** Jedes Ergebnis, das zu „konform“ führen kann (`pass`), wird vor der Freigabe vollständig gegengeprüft. Ergebnisse, die zu „nicht konform“ führen, dürfen per Stichprobe gegengeprüft werden. Festgehalten in `manual_reviews.verification`. Die Fundstelle (`sourceNote`) wird auf der Website wörtlich als „Quelle“ angezeigt und wird bei der Gegenprüfung mitgelesen (Dokument, Artikel/Item/Note, ggf. Seite).

1. Zitate automatisch prüfen: `node scripts/check-quotes.mjs`. Jede Zeile muss mit `OK` beginnen. Bei `FEHLT` steht das Zitat nicht wörtlich in der Quelldatei, dann darf dieses Ergebnis nicht übernommen werden. Das ist eine zweite, unabhängige Prüfung neben der der KI. Zeilenumbrüche, Leerraum und typografische Anführungszeichen spielen dabei keine Rolle, der Wortlaut schon.
2. Kontrollbogen erzeugen: `node scripts/review-sheet.mjs`
3. `review-work/kontrollbogen.md` öffnen. Je Aktie und Prüfung:
   - Link öffnen, das Zitat im Dokument suchen (Strg+F bzw. Cmd+F).
   - Passt das Ergebnis zum Zitat? Bei B3: stimmen die Segmente mit dem Anhang des 10-K überein?
   - Grenzfälle stehen unten in einer eigenen Liste.
4. Notiere pro Aktie die **Zeit**, die du gebraucht hast, und **jeden Fehler**, den du findest (siehe Abschnitt 7).
5. Was du bestätigst, bekommt in `draft.json` bei der jeweiligen Prüfung `"confirmed": true` und `"verification"`: `"full"`, wenn du alle zitierten Stellen vollständig nachgeprüft hast, sonst `"sample"`. Ein `pass` braucht immer `"full"`. Korrigierst du das Ergebnis, ändere `result` und notiere den Grund. Du kannst Claude Code bitten, das für dich einzutragen („Setze confirmed auf true und verification auf full für A2 bei NVDA, JNJ, KO“).

## 6. In die Datenbank übernehmen

1. SQL-Datei erzeugen (Kürzel der prüfenden Person einsetzen, im Projektordner):
   ```
   node --env-file=.env.local scripts/review-to-sql.mjs --reviewer AMI
   ```
   Übernommen wird nur Bestätigtes mit `pass` oder `fail`, dessen Zitat wörtlich in der Quelldatei steht (dieselbe Prüfung wie `check-quotes`). Unklares und Unbelegtes bleibt draußen, die Ausgabe nennt jeden übersprungenen Eintrag.

   **Prüfer-Angabe (seit 06.10.2026):** `--reviewer` ist das Kürzel der prüfenden Person (2–5 Großbuchstaben, z. B. `AMI`); ein langer Text wie früher wird abgelehnt. Das Skript setzt `ai_draft = true` für alle Einträge, weil in `review-work/` immer ein KI-Entwurf zugrunde liegt. `reviewer` und `ai_draft` sind nur intern. Öffentlich zeigt die Detailseite an jedem Ergebnis nur „Geprüft von der Tazkiyah-Redaktion · vollständig geprüft“ bzw. „· stichprobenartig geprüft“ (aus `verification`, entfällt ohne) „· Quelle: <Fundstelle>“ (aus `source_note`, verlinkt mit `source_url`) „· geprüft im <Monat Jahr>“ (aus `reviewed_at`, am Ende der Zeile). Die KI-Unterstützung wird einmal auf der Methodik-Seite erklärt, nicht an den Ergebnissen.

   **Gegenprüfung (seit 06.10.2026):** Jedes Ergebnis, das zu „konform“ führen kann (`pass`), wird vor der Freigabe vollständig gegengeprüft. Ergebnisse, die zu „nicht konform“ führen, dürfen per Stichprobe gegengeprüft werden. Festgehalten in `manual_reviews.verification`. Das Skript übernimmt `verification` in die Spalte. Ein `pass` ohne `"full"` wird übersprungen („pass ohne vollständige Gegenprüfung“), ein `fail` darf `"full"` oder `"sample"` haben. Fehlt `verification`, wird der Eintrag übersprungen. Voraussetzung: `supabase_manual_reviews_verification.sql` wurde einmal im SQL Editor ausgeführt (legt `verification` und `ai_draft` an und trägt bei den sieben Pilot-Einträgen vom 04.10. `AMI`, `ai_draft = true` und `full` nach).

   **Jahresabschluss (seit 06.10.2026):** Das Skript liest für jede Aktie `annual_period_end` aus `screening_current` (nur lesen, mit dem öffentlichen Schlüssel aus `.env.local`). Klappt das Lesen nicht, bricht es ab und schreibt nichts. Eingetragen wird immer das Datum aus dem Entwurf (`annualPeriodEnd`):
   - **gleiches Datum:** Eintrag wird erzeugt.
   - **anderes Datum:** Eintrag wird übersprungen und gemeldet („Jahresabschluss im Entwurf …, in screening_current …“). Meist gibt es einen neueren Jahresabschluss; dann muss der Entwurf neu gemacht werden.
   - **noch kein Ergebnis** in `screening_current`: Eintrag mit dem Entwurfsdatum, die Aktie wird als „Hinweis“ gemeldet. Die Prüfung gilt dann erst, wenn der Cron für die Aktie genau diesen Jahresabschluss speichert.

   Zusätzlich fügt die SQL nur ein, wenn `screening_current` beim Ausführen noch passt (`sc.annual_period_end is null or sc.annual_period_end = '<Entwurfsdatum>'`). Hat sich das Datum seit dem Erzeugen geändert, fehlt die Zeile in der Kontrollabfrage.
2. `review-work/insert-reviews.sql` öffnen, den Inhalt in den **Supabase SQL Editor** einfügen und ausführen. Ein zweites Ausführen fügt nichts doppelt ein.
3. Die Kontrollabfrage am Ende der Datei zeigt, welche Zeilen wirklich gelandet sind. Fehlt eine Aktie, gibt es ihren Ticker in `securities` nicht (z. B. `BRK-B` gegen `BRK.B`).
4. Status neu rechnen lassen, ohne FMP-Abrufe (im Terminal, mit dem Geheimwort aus `read -s CRON_SECRET`):
   ```
   curl -s -H "Authorization: Bearer $CRON_SECRET" "https://tazkiyah-project-kohl.vercel.app/api/run-screening?limit=0"
   ```
   Danach zeigt die Detailseite die Prüfung mit Prüfer, Quelle und Datum.

Gilt eine Prüfung als „abgelaufen“, passt das Datum nicht: Der Cron hat für die Aktie einen anderen Jahresabschluss gespeichert. Das SQL übernimmt dieses Datum seit 06.10.2026 nicht mehr automatisch, weil die Prüfung sonst ungeprüft für einen anderen Jahresabschluss gelten würde. Stattdessen die Unterlagen neu holen (`sec-fetch.mjs`), den Entwurf für den neuen Jahresabschluss neu prüfen lassen und erst dann das SQL erzeugen.

## 7. Auswertung des Pilots

Pro Aktie festhalten und mir schicken:

| Ticker | A2 | B3 | Grenzfall? | Fehler der KI | Zeit (Min.) |
|---|---|---|---|---|---|

**Ergebnis (Stand 04.10.2026):** Pilot (10 Aktien, 20 Prüfungen): A2 ohne inhaltlichen Fehler, eine veraltete Quelle (HD, Satzung von 2026). B3: zwei falsche pass (KO: Alkoholgeschäft, HD: Kredit an Kunden), beide erst durch die Stichwort-Suche gefunden, auch die Zweitlesung hatte sie übersehen. Folge: Stichwort-Suche und Summenprüfung sind Pflicht vor jedem B3 pass. Stand nach der B3-Linie: Nur NVDA und JNJ sind bei A2 und B3 gelöst (je pass). Bei MSFT wurde das eigene Finanzierungsprogramm erst durch die Stichwort-Suche v3.4 sichtbar.

Daraus entscheiden wir:
- **Zeit pro Aktie** und damit der Aufwand für den großen Lauf.
- **Anteil der Grenzfälle** (`unclear`).
- **Gefundene Fehler** (falsches Zitat, falsches Ergebnis, falsche Segmente). Ein einziges falsches „bestanden“ ist ein ernstes Signal: Dann ändern wir Regeln oder Methode, bevor es weitergeht.
- Ob der große Lauf in Claude Code reicht oder ein API-Zugang sinnvoll ist.
