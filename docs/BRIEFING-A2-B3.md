# Briefing für den neuen Chat: A2- und B3-Prüfung

Stand: 02.10.2026, abends. Zum Einfügen in einen neuen Claude-Chat (im Projekt „Tazkiyah“). Zusätzlich `PROJECT-CONTEXT.md` hochladen. Alles ab der nächsten Überschrift ist an Claude gerichtet.

---

## Hallo Claude, wir machen heute mit der A2/B3-Prüfung weiter

Ich baue **Tazkiyah**, eine Web-App, die Aktien und ETFs nach den AAOIFI-Standards (SS 21, 27, 35) prüft. Ich bin keine Entwicklerin und arbeite ca. 20 Stunden pro Woche daran. Bitte erkläre alles in einfachen Worten, mit nummerierten Schritten und kopierfertigen Anweisungen für Claude Code in Codeblöcken. Lies zuerst `PROJECT-CONTEXT.md` (Abschnitt 0 und Abschnitt 4).

### 1. Wo wir stehen

- Die Screening-Engine, der tägliche Cron und die Oberfläche stehen. Status: **konform / nicht konform / nicht geprüft**, kein Score.
- Fast jede Aktie steht auf „nicht geprüft“, weil zwei Handprüfungen fehlen: **A2** (Unternehmenszweck laut Satzung) und **B3** (Umsatzsegmente, verbotene Einnahmen ≤ 5 %).
- Das ist heute unser Ziel. Gestern haben wir entschieden, dass **die KI vorprüft** und ich per **Stichprobe kontrolliere**, statt alles von Hand zu machen.

### 2. Ziel für heute: das Pilot-Paket

Ein Pilot mit **zehn Aktien**: NVDA, JNJ, AAPL, AMZN, GOOGL, DIS, BRK-B, MSFT, KO, HD (einfache Fälle, Grauzonen, Medien, Mischkonzern, mehrere Aktiengattungen). Ich kontrolliere alle zehn Ergebnisse. Danach wissen wir, wie viel Zeit pro Aktie draufgeht, wie viele Grenzfälle entstehen und ob die Methode trägt. Erst dann der große Lauf.

Bitte liefere mir heute:
1. das **Tabellenformat** für Entwürfe (Vorschlag in Abschnitt 6, bitte prüfen und verbessern),
2. ein **Skript**, das für eine Aktie die Satzung und die Segmentangaben von der SEC-Datenbank (EDGAR) holt und die relevanten Textstellen in eine Datei schreibt,
3. eine **Anweisung für Claude Code**, die diese Textstellen liest und den Entwurf mit wörtlichem Zitat und Link schreibt,
4. ein **Skript**, das aus den von mir bestätigten Entwürfen eine **SQL-Datei** erzeugt (Einfügen in `manual_reviews`), die ich im Supabase SQL Editor ausführe.

Keine Kontrollseite und keine API-Anbindung heute. Beides erst nach dem Pilot.

### 3. Was die Datenbank von uns erwartet

Tabelle `public.manual_reviews`:

| Spalte | Inhalt |
|---|---|
| `security_id` | die Aktie (aus `public.securities`, Ticker eindeutig) |
| `criterion` | `A2` oder `B3_SEGMENTS` |
| `result` | `pass`, `fail` oder `unclear` |
| `details` | jsonb, siehe unten |
| `source_url`, `source_note` | mindestens eins ist Pflicht, z. B. Link zum Dokument und „10-K FY2025, Note 13, S. 52“ |
| `reviewer` | Text, z. B. „KI-Entwurf (Claude), kontrolliert von …“ (Namen legen wir fest) |
| `basis_annual_period_end` | **muss genau dem aktuellen Jahresabschluss der Aktie entsprechen** (`screening_current.annual_period_end`), sonst gilt die Prüfung als abgelaufen |
| `interest_income_notes` | nur `B3_SEGMENTS`, seit 08.10.2026 (`supabase_manual_reviews_interest_notes.sql`): **Zinserträge laut Anhang** je Periode, siehe unten |

Wirkung auf den Status:
- **A2:** `pass` oder `fail` zählt. `unclear` oder fehlend = „nicht geprüft“.
- **B3:** `pass` = keine verbotenen Segmente (Beträge 0). `fail` = Beträge je Periode müssen vorliegen: `details.prohibitedRevenueByPeriod` mit Schlüsseln `"annual:YYYY-MM-DD"` und `"quarter:YYYY-MM-DD"` für den Jahresabschluss **und jedes der letzten vier Quartale**, je Zahl oder Objekt nach Kategorie (z. B. `{"music": 120, "derivatives": 40}`). `unclear` = „nicht geprüft“. Zinserträge gehören nicht in `prohibitedRevenueByPeriod`, die zählt die Engine selbst.
- **Zinserträge laut Anhang (seit 08.10.2026, Festlegung „zweistufig“):** Die Engine nimmt Zinserträge zuerst aus den Finanzdaten (bei SEC aus XBRL, nie aus einem Saldo wie „Other income/(expense), net“). Fehlen sie dort (Beispiel AAPL), trägt die B3-Prüfung sie aus dem Anhang des 10-K/10-Q ein: `interestIncomeNotes` im Entwurf → Spalte `interest_income_notes`. Je Periode ein Eintrag mit **Betrag, Periode und Fundstelle**: Schlüssel `"annual:YYYY-MM-DD"` bzw. `"quarter:YYYY-MM-DD"` (Jahresabschluss und die letzten vier Quartale), Wert `{"amount": 3500000000, "source": "10-K FY2025, Note 5 Other Income, S. 34"}`. Betrag in Einheiten der Berichtswährung (nicht in Millionen). Steht eine Angabe mit Dividenden oder anderen Erträgen zusammen („Interest and dividend income“), vollständig eintragen (vorsichtig vollständig gezählt) und das in `source` vermerken. Nur Bruttoerträge, keinen Saldo. Fehlt eine Periode, bleibt B3 „nicht geprüft“. Die Website zeigt dann „Zinserträge von Hand aus dem Anhang übernommen“.
- Kategorien verbotener Einnahmen (`PROHIBITED_INCOME_CATEGORIES` in `src/screening/industryRules.js`): `interest_in_revenue`, `riba_other`, `derivatives`, `securities_lending`, `conventional_fund_fees`, `alcohol`, `pork`, `gambling`, `adult`, `drugs`, `tobacco`, `weapons`, `music`, `other`.

SQL-Muster, das die aktuelle Jahresbasis automatisch einsetzt (Platzhalter in spitzen Klammern füllt unser Skript, nicht ich von Hand):

```sql
insert into public.manual_reviews
  (security_id, criterion, result, details, source_url, source_note, reviewer, basis_annual_period_end)
select s.id, 'A2', '<pass|fail|unclear>', '{}'::jsonb, '<URL>', '<Fundstelle>', '<Prüfer>', sc.annual_period_end
from public.securities s
join public.screening_current sc on sc.security_id = s.id
where s.ticker = '<TICKER>';
```

Kandidatenliste für den großen Lauf (alles, was nicht schon automatisch durchgefallen ist):

```sql
select ticker, name, status, annual_period_end, quarter_period_end
from public.screening_current
where asset_type = 'stock' and status <> 'nicht_konform'
order by ticker;
```

Eine Aktie erscheint dort erst, wenn der Cron sie abgerufen hat (ca. 24 Titel pro Tag). Für den Pilot fehlende Titel kann ich einzeln abrufen: `…/api/run-screening?tickers=AMZN,KO&force=1` (nur mit `CRON_SECRET`, das ich nie im Chat zeige).

### 4. Regeln der Prüfung (festgelegt)

- **Ein falsches „konform“ ist der teure Fehler.** Die KI lässt nur bestehen, wenn die Textstelle eindeutig ist. Alles Unklare wird `unclear` und kommt auf die **Grenzfall-Liste**, die ich separat prüfe.
- **Jedes Ergebnis braucht ein wörtliches, kurzes Zitat, einen Link und eine Fundstelle.** Ohne Zitat kein Ergebnis. Nichts erfinden, keine Beträge schätzen.
- **A2 `pass`** nur bei eindeutiger Zweckklausel (z. B. „jede rechtmäßige Tätigkeit“). **`fail`**, wenn der Zweck verbotene Geschäfte oder Zinsgeschäfte nennt. Satzung nicht gefunden oder nur per Verweis ohne Text = `unclear`.
- **B3 `pass`** nur, wenn aus den ausgewiesenen Segmenten und Produktlinien kein verbotener Anteil erkennbar ist. **`fail`** nur mit belegten Beträgen je Periode. Gemischte oder nicht aufgeschlüsselte Segmente (Beispiel Apple: Musik steckt in den Dienstleistungen) = `unclear`. So steht es in `prohibitedIncomeSources`.
- Der Standardtext wird nicht abgedruckt, nur sinngemäß wiedergegeben mit Fundstelle. Zitate aus Unternehmensunterlagen bleiben kurz.
- Auslegungsfragen entscheide ich. Bitte nicht stillschweigend entscheiden, sondern fragen.
- **A1-Hinweise im 10-K (seit 09.10.2026):** Mit SEC-Daten läuft A1 über den SIC-Code, eine Unternehmensbeschreibung gibt es dort nicht. Die Stichworte zum Kerngeschäft (Schweinefleisch, Cannabis, Casino, Erwachsenenunterhaltung, Video Games, Musik, umstrittene Waffen usw.) stehen deshalb in `keyword-hits.md` im Abschnitt **„A1-Hinweise“** (`node scripts/keyword-scan.mjs`, bei `sec-fetch.mjs` automatisch). **Jeder A1-Treffer muss in der A2/B3-Prüfung bewertet werden.** Betrifft er das Kerngeschäft, ist A1 manuell zu prüfen (Ergebnis in `manual_reviews`, criterion `A1`, mit Zitat und Quelle wie bei A2). Treffer in Risikofaktoren oder Nebensätzen kurz als „kein Kerngeschäft“ vermerken.
- **Casino-Hotels (SIC 7011)** stehen über SIC bei „Hotels“ (B3-Schwerpunkt), nicht automatisch im Ausschluss. Sie fallen über B3 auf: Casino-Umsätze sind verbotene Einnahmen (Kategorie `gambling`) und zählen zur 5-%-Grenze.
- **Zahlungsnetzwerke (Festlegung 09.10.2026, `PAYMENT_NETWORK_TICKERS`: V, MA, PYPL, FISV, FIS, GPN, CPAY, XYZ):** Bei diesen Titeln eigene Kreditprodukte ausdrücklich prüfen, z. B. Cash App Borrow und Afterpay (Block), PayPal Credit und PayPal Pay Later, Tankkarten-Kredite (Corpay). Zinsen, Kreditgebühren und Verzugsgebühren sind verbotene Einnahmen (`interest_in_revenue` bzw. `riba_other`). Fehlen die Beträge, ist B3 `unclear` (strenge B3-Linie).
- Im FMP-Modus (Standard) bleibt die bisherige Stichwortprüfung an der Unternehmensbeschreibung des FMP-Profils unverändert.

### 5. Stichproben nach dem großen Lauf

Die ersten **20** Ergebnisse kontrolliere ich komplett. Danach alle paar Tage **5 bis 10** Aktien, **gezielt gezogen**: alle Grenzfälle, Mischkonzerne und ein Zufallsanteil. Bei 5 % Fehlerquote findet eine zufällige Stichprobe von 10 Aktien nur mit etwa 40 % Wahrscheinlichkeit einen Fehler, deshalb nicht rein zufällig.

### 6. Vorschlag Tabellenformat für den Entwurf (bitte prüfen)

Eine JSON-Datei je Aktie, z. B. `review-work/<TICKER>/draft.json`:

```json
{
  "ticker": "AAPL",
  "cik": "0000320193",
  "annualPeriodEnd": "2025-09-27",
  "filing": { "form": "10-K", "url": "…", "filed": "…" },
  "A2": {
    "result": "pass | fail | unclear",
    "quote": "wörtliche Zweckklausel, kurz",
    "sourceUrl": "…",
    "sourceNote": "z. B. Certificate of Incorporation, Art. III",
    "reasoning": "ein bis zwei Sätze",
    "confidence": "high | medium | low",
    "needsHumanReview": false,
    "reasonForReview": null
  },
  "B3": {
    "result": "pass | fail | unclear",
    "segments": [ { "name": "…", "revenue": 0, "currency": "USD", "category": null, "note": "" } ],
    "prohibitedRevenueByPeriod": null,
    "interestIncomeNotes": null,
    "quote": "wörtliche Stelle(n) zur Segmentbeschreibung",
    "sourceUrl": "…",
    "sourceNote": "z. B. 10-K FY2025, Note 13, S. 52",
    "reasoning": "…",
    "confidence": "high | medium | low",
    "needsHumanReview": true,
    "reasonForReview": "z. B. Dienstleistungen enthalten Musik, nicht getrennt ausgewiesen"
  }
}
```

Ablauf pro Aktie (Vorschlag, zu verbessern):
1. CIK holen (steht im letzten Ergebnis in `screening_runs.inputs.profile.cik`, sonst über SEC `company_tickers.json`).
2. Einreichungsliste über `https://data.sec.gov/submissions/CIK<10-stellig>.json`, neuestes 10-K und die letzten drei 10-Q.
3. Satzung: im Exhibit-Index des 10-K den Eintrag 3.1/3.2 (Certificate of Incorporation) suchen, oft per Verweis auf frühere Einreichungen, dem Verweis folgen.
4. Segmentangaben: im 10-K die Segment-Note (Item 8) und Item 1 „Business“, in den 10-Q die Segmentangaben der letzten vier Quartale.
5. Relevante Textstellen in Dateien schreiben, Claude Code liest sie und schreibt `draft.json`.

Hinweise zur SEC-Seite (bitte beim Bau gegen die aktuellen SEC-Regeln prüfen): Anfragen brauchen einen `User-Agent` mit Namen und E-Mail-Adresse, und die Rate ist auf wenige Anfragen pro Sekunde begrenzt.

### 7. Entscheidungen, die heute anstehen (Standard in Klammern)

1. Wer liest beim **großen** Lauf: Claude Code oder API-Zugang mit eigener Abrechnung? (Pilot in Claude Code, danach entscheiden.)
2. Wortlaut der **Prüfer-Angabe** und mein Name darin. (Vorschlag: „KI-Entwurf (Claude), kontrolliert von <mein Name>“; Stichproben-Ergebnis separat festhalten.)
3. **B3-Prüffrequenz:** jährlich (Standard, wie die Gültigkeit der Prüfungen heute) oder nach jedem Quartalsbericht. Ob SS 21, 3/4/8 das verlangt, lese ich im Standardtext nach.
4. **Methodik-Seite:** Satz „KI-gestützte Prüfung mit Stichprobenkontrolle“ aufnehmen, bevor ein so geprüftes „konform“ erscheint.

### 8. Womit wir anfangen

Frag mich bitte zuerst nach: (a) dem Ergebnis der Kandidatenabfrage (Abschnitt 3), damit wir sehen, welche der zehn Pilotaktien schon Daten in der Datenbank haben, (b) meinem Namen für die Prüfer-Angabe, (c) meiner Antwort zu den Entscheidungen in Abschnitt 7. Dann schreibst du das Pilot-Paket aus Abschnitt 2 Schritt für Schritt.

Wichtig: Ich zeige dir niemals Geheimwörter oder Schlüssel. Wenn etwas ein Geheimwort braucht, sagst du mir nur, wo ich es einfüge.
