# Tazkiyah: Übergabe und Stand (04.10.2026)

Zweck dieser Datei: Im nächsten Chat hochladen (oder in `docs/` im Repo ablegen), damit die Arbeit ohne Rückfragen weitergeht. Sie **ersetzt nicht** die `PROJECT-CONTEXT.md` im Repo. Die wird von Claude Code gepflegt und enthält die technischen Einzelheiten. Diese Datei fasst zusammen, was in der Arbeit an A2/B3, den Auslegungen und der Datenfrage (FMP) entschieden und gefunden wurde.

## 0. So arbeitet Amaal gern (Arbeitsweise)

- Keine Entwicklerin, wenig Zeit und knappes Nutzungskontingent. Aufgaben **in einem Durchgang komplett** erledigen, ohne Hin und Her. Sie kontrolliert am Ende.
- Befehle für Claude Code **fertig zum Einfügen** liefern, SQL fertig zum Einfügen in den Supabase SQL Editor.
- Geheimwörter (`CRON_SECRET`, API-Schlüssel) **nie im Chat zeigen oder einfügen**. Zwei alte Werte standen im Chat und sind ersetzt.
- Auslegungen sind ihre Entscheidung und werden offen dokumentiert, keine Fatwa, keine Anlageberatung.

## 1. Projekt in Kürze

- **Tazkiyah**: Web-App (React, Vite, Tailwind, Supabase, Vercel), die Aktien und ETFs nach AAOIFI SS 21, 27 und 35 screent. Status der Engine: konform, nicht konform, nicht geprüft (vierte Stufe „Unklar“ ist geplant, siehe 5).
- Repo: github.com/amaal48/tazkiyah-project, lokal `~/Desktop/Website`. Arbeitsbranch **`ui-screening`** (nicht auf `main`, nicht öffentlich). Production-Adresse `https://tazkiyah-project-kohl.vercel.app` zeigt noch die alte Oberfläche. Supabase-Projekt „amanah“ (Free).
- Stand Git: `ui-screening` ist etwa 8 Commits vor `origin`, **nicht gepusht**. `main` unberührt.
- Screening-Daten kommen von **FMP** (Gratis-Tarif). Täglicher Cron um 5 Uhr. Tests: `npm run test:screening` und `npm run test:scripts` (22 Tests).

## 2. Was in dieser Arbeit entstanden ist

**Werkzeuge in `scripts/`** (Befehle immer im Projektordner):

| Datei | Aufgabe |
|---|---|
| `sec-fetch.mjs` | holt 10-K, Satzung(en) und spätere Satzungsänderungen (8-K Item 5.03) von der SEC, schreibt Texte, `slices.md`, `keyword-hits.md` nach `review-work/<TICKER>/` |
| (Claude Code) | schreibt je Aktie `draft.json` nach den Regeln in `docs/REVIEW-PILOT.md` |
| `check-quotes.mjs` | prüft unabhängig von der KI, ob jedes Zitat wörtlich in der Quelle steht, und ob Segmentsummen stimmen |
| `keyword-scan.mjs` | sucht im 10-K nach Stichwörtern zu verbotenen Kategorien (Alkohol, Glücksspiel, Musik, Kredit usw.) |
| `review-sheet.mjs` | erzeugt `review-work/kontrollbogen.md` |
| `review-to-sql.mjs --reviewer "…"` | erzeugt `review-work/insert-reviews.sql` aus bestätigten Entwürfen (nur pass/fail, nur mit belegtem Zitat, stimmenden Summen) |

Ablauf pro Charge: `sec-fetch` → Entwürfe (Claude Code) → `check-quotes` und `keyword-scan` → `review-sheet` → Kontrolle durch Amaal (`confirmed: true` setzen lassen) → `review-to-sql` → SQL im Supabase SQL Editor ausführen → Status neu rechnen (`run-screening?limit=0`).

SEC-Abruf braucht im Terminal: `export SEC_USER_AGENT="Tazkiyah Amaal Ibrahim amaal48@gmail.com"` (kein Geheimnis).

`review-work/` steht in `.gitignore`: **die Entwürfe liegen nur lokal**. Ordner nicht löschen, besser eine Sicherungskopie anlegen.

**Dokumente:** `docs/REVIEW-PILOT.md` (Regeln und Format der Entwürfe), `PROJECT-CONTEXT.md` (A2-Auslegung, B3-Linie, Pflicht zur Stichwortsuche, Pilot-Ergebnis, Abschnitt „Vor dem öffentlichen Start“).

## 3. Pilot-Ergebnis (10 Aktien, 20 Prüfungen)

| Aktie | A2 | B3 | Grund bei B3 `unclear` | Status in der Datenbank |
|---|---|---|---|---|
| NVDA | pass | pass | | **konform** |
| JNJ | pass | pass | | **konform** |
| MSFT | pass | unclear | eigenes Finanzierungsprogramm (financing receivables 3,7 Mrd. $), Zinsen nicht ausgewiesen | nicht geprüft |
| HD | pass | unclear | Pro Trade Credit, Kundenforderungen 2.588 Mio. $, Zinsen nicht ausgewiesen | keine Daten (FMP 402) |
| KO | pass | unclear | Einstieg ins Alkoholgeschäft (Jack Daniel's & Coca-Cola, Lemon-Dou, Topo Chico Hard Seltzer; `10k.txt` Zeile 236 und 394), Umsatz nicht ausgewiesen | nicht geprüft |
| AAPL | pass | unclear | Musik und Apple Card in Services, nicht aufgeschlüsselt | nicht eingetragen |
| AMZN | pass | unclear | digitale Musik, Kreditkarten-Erträge, Sortiment | nicht eingetragen |
| GOOGL | pass | unclear | YouTube Music, Google Play (Glücksspiel-Apps), Absicherungsergebnis | nicht eingetragen |
| DIS | pass | unclear | ESPN-BET-Lizenz (Sportwetten), Musik, Getränke | nicht eingetragen |
| BRK-B | pass | unclear | Versicherung, Spirituosen-Großhandel | überspringen, scheitert vermutlich an A1 |

**In der Datenbank (`manual_reviews`) liegen 7 Prüfungen:** HD A2, JNJ A2 und B3_SEGMENTS, KO A2, MSFT A2, NVDA A2 und B3_SEGMENTS. Prüfer-Angabe: „KI-Entwurf (Claude), kontrolliert von Amaal Ibrahim“. Die Berichtsjahre passen zu den FMP-Daten.

**Lehren:**
- **A2** war fehlerfrei (eine veraltete Quelle bei HD: Satzung von 2026 jünger als das 10-K).
- **B3:** Von 5 KI-Ergebnissen „pass“ waren **3 falsch** (KO, HD, MSFT). Gefunden hat sie nur die Stichwortsuche. Auch die Zweitlesung durch Claude hatte HD übersehen. Die Zitatprüfung fängt „steht nicht im 10-K“ nicht.
- Folge: Stichwortsuche und Summenprüfung sind **Pflicht** vor jedem B3 `pass`.
- Aufwand Claude Code: etwa 1 Minute und 4 bis 10 Tool-Aufrufe je Aktie. Amaals Kontrollzeit wurde **nie gemessen**.

## 4. Auslegungsentscheidungen (Stand 04.10.2026)

Für die spätere Gegenlesung durch eine fachkundige Person. Alle sind Auslegungen, keine Fatwa.

1. **A2, Zweck statt Befugnisse.** `pass`, wenn die Satzung kein verbotenes Geschäft ausdrücklich zum Zweck macht (auch bei allgemeiner Klausel oder Aufzählung allgemeiner Befugnisse, z. B. Wertpapiere halten, „destillieren“ in einer Warenliste). `fail`, wenn ein verbotenes Geschäft ausdrücklich Zweck ist (Bank, Versicherung, Zins, Glücksspiel, Alkohol). `unclear` nur bei fehlender Satzung, nur Änderungsurkunde ohne Zweckklausel, oder wenn nicht erkennbar ist, ob Zweck oder Befugnis. Anlass: Coca-Cola (Satzung von 1919).
2. **B3, strenge Linie.** Betreibt ein Unternehmen laut 10-K ein eigenes Geschäft, das verbotene Erträge enthalten kann (Kundenkredit, Finanzierungs- oder Kartenprogramme, Alkohol, Musik usw.), und werden diese nicht ausgewiesen, ist B3 `unclear`. Eigene Zinserträge aus Geldanlagen zählt die Engine selbst.
3. **Obergrenzen-Regel nicht eingeführt.** Option: Bestand der Forderungen mal 36 % Zins unter 2,5 % des Umsatzes gilt als belegt (HD 0,57 %, MSFT 0,47 %). Bleibt als Option für die Gegenlesung.
4. **Pflicht vor B3 `pass`:** Stichwortsuche (`keyword-hits.md`) bewerten, Segmentsummen prüfen. Nie behaupten, etwas stehe nicht im 10-K, ohne grep oder Stichwortliste.
5. **Gerät oder Inhalt.** NVIDIA „Gaming“ ist Hardware (pass). **Offen:** Xbox bei Microsoft (6,6 % des Umsatzes; Spiele stehen nicht auf der Verbotsliste). Gaming und Werbung sind laut Drittseiten die Streitpunkte bei Microsoft. Frage für die gelehrte Person.
6. **Wortlaut auf der Seite:** nicht „halal“ oder „AAOIFI-konform“, sondern „geprüft nach den Kriterien von AAOIFI SS 21, mit offengelegten Auslegungen“, dazu Hinweis keine Fatwa, keine Anlageberatung. In `STATUS_LABELS` (`src/screening/engine.js`) und den Oberflächentexten noch nicht umgestellt.
7. **Frühere Auslegungen** (stehen in `PROJECT-CONTEXT.md`): Marktkapitalisierung aus Kurs mal Aktienzahl, Leasing-Schätzung, Datenqualität an AAPL und MSFT geprüft.

## 5. Stufe „Unklar“ (noch nicht umgesetzt)

- Vorschlag von Amaal, inspiriert von Zoya („fragwürdig“). Hintergrund: „nicht geprüft“ vermischt „noch nicht geprüft“ und „geprüft, Datenlage uneindeutig“. Nach dem Pilot stehen 7 von 10 Aktien bei B3 offen.
- Empfohlene Form: (1) Name **„Unklar“** (neutral, kein Vorwurf; „Fragwürdig“ ginge technisch auch, wäre Amaals Entscheidung); (2) Definition nach Belegen: alle Prüfungen durchgeführt, keine durchgefallen, mindestens eine mit den veröffentlichten Daten nicht eindeutig beantwortbar; (3) Rangfolge: nicht konform vor nicht geprüft vor unklar vor konform; (4) Grund immer sichtbar (Zitat und Begründung in der Datenbank, nicht nur pass oder fail). `unclear`-Prüfungen müssten dafür gespeichert werden (heute lässt `review-to-sql.mjs` sie weg).
- **Betrifft:** Engine, Supabase-Schema (erlaubte Status-Werte), Oberfläche, Texte (Legende, Startseite, Glossar, Methodik). Schätzung: 1 bis 2 Arbeitssitzungen. Engine, Schema und Tests macht Claude im Chat, die Oberfläche macht Claude Code.
- **Vergleich Zoya:** Dort heißt „Questionable“: (a) zu wenig öffentliche Information oder (b) Grauzone, in der Gelehrte uneinig sind. Unser „Unklar“ meint nur (a). Microsoft: Zoya fragwürdig, Musaffa nicht halal, S&P- und FTSE-basierte ETFs halal (laut Drittseite).
- **Offene Entscheidung:** Wort „Unklar“ oder „Fragwürdig“.

## 6. Daten und FMP (Erkenntnisse vom 04.10.2026)

- **Gratis-Tarif reicht nicht.** 250 Abrufe pro Tag, und laut Vergleichstabelle sind die Abschlüsse auf eine Beispielliste von Symbolen begrenzt (AAPL, TSLA, AMZN und 84 weitere). Das erklärt den Fehler **402 bei HD** („FMP cash-flow-statement 402“). Der Gratis-Tarif kann den S&P 500 nicht screenen.
- **Lizenz:** Persönliche Tarife (Starter 22, Premium 59, Ultimate 149 USD pro Monat bei Jahreszahlung) sind nur für private, nicht geschäftliche Nutzung. Die Bedingungen verbieten ohne besondere Vereinbarung, FMP-Daten auf Websites oder Apps für mehrere Personen zu zeigen, auch abgeleitete Daten. Nach Kündigung müssen alle Daten und abgeleiteten Informationen gelöscht werden. Die Tarifseite verlangt für Anzeige eine eigene „Data Display and Licensing Agreement“. Der kommerzielle Tarif **Enterprise** (Anzeige und Weitergabe) hat den Preis „Contact Us“. Stand der Bedingungen: 1. August 2023, Tarifseite aktueller. Keine Rechtsberatung.
- **Folge:** Für die öffentliche Seite reicht Starter oder Premium nicht. Nichts kaufen, bis FMP geantwortet hat. „Einen Monat kaufen, alles holen, kündigen“ ist nicht erlaubt.
- **Anfrage an FMP** (Kontaktformular auf `site.financialmodelingprep.com/pricing-plans?planType=commercial`, Feld „Use Case“):
  > We are building a halal stock screener (public website) that screens ~500 US large caps and ETFs against AAOIFI criteria. We use financial statements (annual and quarterly income statement, balance sheet, cash flow), profile and price data and display the computed compliance status and ratios for each stock. Questions: (1) What does Enterprise cost for this use case? (2) Does it include full US coverage with quarterly statements? (3) May we use a personal plan during development before launch, or do you offer a development license? (4) The free plan returns HTTP 402 for cash-flow-statement on HD; is this the symbol limit?
- **Alternative bei zu hohem Preis:** Abschlüsse direkt aus SEC-XBRL-Daten (kostenlos, soweit bekannt frei verwendbar). Aufwand erheblich (Zahlen je Unternehmen vereinheitlichen, Engine-Adapter), Kurse für die Marktkapitalisierung brauchen weiter einen Anbieter.
- **Kosten der FMP-Abrufe:** 8 pro Aktie plus 1 pro Lauf (Euro-Kurs). Tagesbudget aus Vercel-Variable `SCREENING_DAILY_CALL_BUDGET` (muss eine reine Zahl sein, zuletzt auf 200 gesetzt; ein zu kleiner Wert führte dazu, dass nichts geholt wurde). Lauf auf 50 Sekunden begrenzt.
- **Endpunkt `api/run-screening`:** Header `Authorization: Bearer <CRON_SECRET>`. Parameter `limit` (Höchstzahl Aktien mit neuen Daten), `tickers=A,B,…` (höchstens 20), `force=1` (nur mit tickers), `dryRun=1`. Ohne force holt er nur fällige Aktien (nie innerhalb von 7 Tagen nach dem letzten Abruf). `limit=0` holt **keine** neuen Daten und rechnet nur Aktien mit neuen Prüfungen oder Versionen neu.
- Heute geholte Aktien: NVDA, JNJ, KO (frisch), MSFT (02.10.). Berichtsjahre: NVDA 2026-01-25, JNJ 2025-12-28, KO 2025-12-31, MSFT 2026-06-30.

## 7. Offene Punkte nach Priorität

1. **FMP-Anfrage senden** (Text in 6), Antwort abwarten. Davon hängen Tempo und Kosten des großen Laufs ab.
2. **`git push` für `ui-screening`** (Sicherung): in Claude Code „Pushe den Branch ui-screening (nicht main).“
3. **Wort für die Stufe** nennen („Unklar“ oder „Fragwürdig“), dann Engine, Schema, Tests und Oberfläche bauen, Texte auf den neuen Wortlaut umstellen.
4. **Stichprobe** (15 Minuten), falls noch nicht gemacht (die Datenbank sagt „kontrolliert von Amaal Ibrahim“): NVDA Art. III der Satzung, JNJ-Summe 60.401 + 33.792 = 94.193 Mio. $, KO `10k.txt` Zeile 236 und 394, HD Zeile 424 und 1189.
5. **Vorschau von `ui-screening` ansehen** (Vercel, Deployments, Branch), dann über den Merge auf `main` entscheiden. Prüfen: Detailseite bei NVDA und JNJ zeigt Prüfer, Quelle, Datum.
6. **Fehlerabfrage** (wie weit ist der 402 verbreitet):
   ```sql
   select last_error, count(*) from public.securities where last_error is not null group by last_error order by 2 desc;
   ```
7. **Großer Lauf** (erst nach FMP-Klärung): etwa 200 Kandidaten in Päckchen zu 25; vorher aussortieren, was schon an A1, B1, B2 oder C1 scheitert; Pflicht: `check-quotes`, `keyword-scan`, Stichproben bei B3 `pass`; A2 weitgehend automatisch. Grobe Schätzung 3 bis 5 Wochen, davon 6 bis 10 Stunden eigene Arbeit; mit bezahltem Tarif deutlich schneller. Offen: Claude Code oder API (Kontingent).
8. **Vor dem öffentlichen Start:** gelehrte Person liest die Auslegungsliste (8 bis 10 Entscheidungen, etwa 1 bis 2 Stunden; Claude bereitet die Seite vor); Fundstellen der Standards SS 21, 27, 35 gegen den gekauften Standardtext prüfen; Rechtliches (Impressum, Datenschutz, mögliche Regulierung); Wortlaut auf der Seite; Methodik-Seite nennt alle Auslegungen sichtbar.
9. **Kleinere Punkte** (aus `PROJECT-CONTEXT.md`): offene Felder in `explanations.js` (D2 Tamattu', C3/SS59), Feld „metrics“ für die Sortierung nach B1 und B2, Roadmap-Dokument aktualisieren (https://claude.ai/code/artifact/9740a04f-6d82-4c70-8fc2-c5bf2e8dac92).

## 8. Nützliche Befehle

**Neues Geheimwort, ohne dass es erscheint** (normale Terminal-App, Fenster danach nicht schließen):
```
export CRON_SECRET=$(openssl rand -hex 32); echo -n "$CRON_SECRET" | pbcopy; echo ${#CRON_SECRET}
```
Es muss 64 erscheinen. Dann in Vercel bei `CRON_SECRET` für Production einfügen (Edit, Cmd + V, Save) und **Redeploy**.

**Status neu rechnen (ohne FMP-Abrufe) und gezielt Daten holen:**
```
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://tazkiyah-project-kohl.vercel.app/api/run-screening?limit=0"
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://tazkiyah-project-kohl.vercel.app/api/run-screening?tickers=NVDA,JNJ"
```

**Supabase SQL Editor:**
```sql
-- Status
select s.ticker, sc.status, sc.annual_period_end
from public.screening_current sc join public.securities s on s.id = sc.security_id
where s.ticker in ('NVDA','JNJ','MSFT','HD','KO') order by s.ticker;

-- Prüfungen
select s.ticker, m.criterion, m.result, m.basis_annual_period_end, m.reviewer
from public.manual_reviews m join public.securities s on s.id = m.security_id
where s.ticker <> 'ISWD' order by s.ticker, m.criterion;

-- Heutiger FMP-Verbrauch
select day, provider, calls from public.screening_api_usage
where day = (now() at time zone 'utc')::date;
```

## 9. So geht es im nächsten Chat weiter

1. Diese Datei hochladen und schreiben: „Weiter nach der Übergabe vom 04.10.2026. Stand: …“ (zum Beispiel FMP-Antwort da, oder Wort für die Stufe).
2. Zuerst Punkt 1 bis 3 aus Abschnitt 7 klären, die hängen nicht voneinander ab.
3. Den Rest erst danach, in der Reihenfolge der Liste.
