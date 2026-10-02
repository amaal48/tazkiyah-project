# Umbau Schritt 1: Oberfläche auf den AAOIFI-Screener umstellen

Stand: 02.10.2026. Diese Datei ist die Arbeitsanweisung für Claude Code. Sie beschreibt, was gebaut wird, nicht jede Zeile Code. Fragen stellst du, bevor du rätst.

## 0. Ziel in einem Satz

Die Seite zeigt statt der alten Bewertung (Halal / Grenzwertig / Nicht Halal, Score, Stern) die Ergebnisse des neuen Screeners aus Supabase: **konform / nicht konform / nicht geprüft**, mit Begründung, Werten und **immer mit Quelle**. Jede Quellenangabe (z. B. „SS 21, 3/4/2“) ist ein Link auf eine eigene **Erklärseite je Prüfung**.

## 1. Feste Regeln (nicht verhandelbar)

1. **Drei Status, kein Score.** Keine Prozentzahl als Bewertung, kein Stern, keine Zählung wie „4 von 6 bestanden“, kein „Grenzwertig“. Statt Zählung steht bei „nicht geprüft“ in Worten, was fehlt.
2. **Kein vierter Status.** Eine Aktie ohne Ergebnis in der Datenbank ist für Nutzer „nicht geprüft“ mit dem Grund „Wird demnächst geprüft“.
3. **Grundlage immer sichtbar:** Auf der Hauptseite steht klar, dass nach den AAOIFI Shari'ah Standards Nr. 21, 27 und 35 geprüft wird. Kein AAOIFI-Logo. Dazu der Satz: „Tazkiyah prüft nach den Standards der AAOIFI und ist nicht mit der AAOIFI verbunden.“
4. **Jede Aussage hat Erklärung und Quelle.** Quelle = Fundstelle im Standard als Link auf die Erklärseite der Prüfung.
5. **Den Standardtext nicht abdrucken,** sinngemäß wiedergeben und die Fundstelle nennen.
6. **Texte kommen aus einer Stelle:** `src/screening/explanations.js` (Erklärungen, Prüfstufen, Kennzeichnungstexte) und `src/screening/parameters.js` (Methode, Begründung, Alternative, Grenzwerte). Keine Grenzwerte oder Erklärungen in Komponenten fest eintippen. Grenzwerte immer über `fillParams` einsetzen.
7. **Keine Anlageberatung, kein Rechtsgutachten (Fatwa):** Hinweis auf Hauptseite und Detailseite.
8. **Ton und Gestaltung:** wie bisher, neutral, deutsch. Vorhandene Design-Variablen (`--emerald`, `--red`, `--gold`, `--surface` usw.) weiterverwenden. „Nicht geprüft“ bekommt eine **neutrale** Farbe (grau), nicht Gelb/Amber, weil Amber bisher „Grenzwertig“ war.

## 2. Arbeitsweise

- Neuer Branch `ui-screening`. **Nicht auf `main` committen oder pushen.** Der Push des Branches erzeugt bei Vercel eine Vorschau-Adresse zum Testen.
- Kleine Commits mit klaren Nachrichten. Vor jedem Commit: `npm run test:screening` und `npm run build`.
- Kein SQL ausführen, keine Supabase-Einstellungen ändern, keine Schlüssel in Dateien schreiben.
- `App.jsx` hat 2.800 Zeilen. Neue Teile in **eigene Dateien** auslagern (siehe 3), `App.jsx` nur anpassen, wo es nötig ist.
- Wenn etwas hier nicht zum Code passt: kurz sagen, was du gefunden hast, und Vorschlag machen.

## 3. Neue und geänderte Dateien (Vorschlag)

```
src/lib/screeningData.js          Daten laden (Liste, Detail, Verlauf), Zwischenspeicher
src/lib/hashRoute.js              Hash-Adressen lesen und schreiben (siehe 7)
src/components/screening/StatusBadge.jsx
src/components/screening/StageDiagram.jsx    Grafik der Prüfstufen
src/components/screening/ScreeningHero.jsx   Kopfbereich + Grundlage + Hinweis
src/components/screening/StatusLegend.jsx
src/components/screening/ScreeningList.jsx   Filter, Sortierung, Liste
src/components/screening/ScreeningDetail.jsx Detailseite
src/components/screening/SourceLink.jsx      Quellenangabe als Link
src/components/screening/CriterionPage.jsx   Erklärseite je Prüfung
```

`src/components/ShariaDetailWidget.jsx` wird durch `ScreeningDetail` ersetzt und danach entfernt, sobald nichts mehr darauf zeigt.

## 4. Daten aus Supabase

Der Client existiert: `src/lib/supabaseClient.js` (Anon-Key, nur Lesen). Alle benötigten Tabellen sind öffentlich lesbar.

**Liste (eine Abfrage, schlank):** `screening_current` ist eine Ansicht mit dem jeweils letzten Ergebnis je Titel. Sie enthält auch große Spalten (`result`, `inputs`, `parameters`). **Diese nie komplett für alle Titel laden.** Stattdessen:

```js
supabase.from("screening_current").select(
  "security_id,ticker,name,asset_type,status,run_at,annual_period_end,quarter_period_end," +
  "headline:result->headline,summary:result->summary"
)
```

Zusätzlich `securities` (`id,ticker,name,asset_type`), weil Titel ohne Ergebnis in `screening_current` fehlen. Beides zusammenführen: Titel ohne Ergebnis = „nicht geprüft“, Grund „Wird demnächst geprüft“. Seitenweise laden, falls mehr als 1.000 Zeilen (Supabase-Grenze); aktuell etwa 504.

**Detail (eine Abfrage pro Titel):** `screening_current` mit `.eq("ticker", t)`, hier mit der Spalte `result` (alle Kriterien). **Niemals `inputs` laden.**

**Verlauf:** `screening_status_changes` (`from_status,to_status,changed_at`) für die `security_id`, absteigend nach `changed_at`.

**Statuswerte in der Datenbank:** `konform`, `nicht_konform`, `nicht_geprueft`. Anzeige: „Konform“, „Nicht konform“, „Nicht geprüft“. Die Langfassung steht in `result.statusLabel` (z. B. „konform nach AAOIFI SS 21“).

**Zwischenspeicher:** Die Liste einmal pro Sitzung laden (React-Kontext oder einfacher Modul-Cache), nicht bei jedem Seitenwechsel.

**Stammdaten:** Sektor, Preise und Kursverläufe kommen vorerst weiter aus `src/data/stocks.js` (Zuordnung über `ticker`). Die Kurse dort sind **Platzhalter**. Sie werden in diesem Schritt nicht angefasst, aber **nirgends als echt darstellen**. Den **Status** liest die Seite ab jetzt nur noch aus Supabase, nie mehr aus `stocks.js`. Nach der Umstellung dürfen `status`, `score`, `business`, `financials` aus `stocks.js` nirgends mehr verwendet werden.

## 5. Form der Ergebnisse

`result` (Detail) enthält unter anderem:

- `status`, `statusLabel`, `screenedAt`, `dataBasis` (`annualPeriodEnd`, `quarterPeriodEnd`, …)
- `criteria[]`, je Prüfung: `id`, `name`, `source`, `result` (`pass` | `fail` | `not_checked` | `not_applicable` | `disabled`), `reason`, `checks[]`, `flags[]`, `review`, `parameterRefs[]`
  - `checks[]` bei Kennzahlen: `basis` (`annual` | `quarter`), `periodEnd`, `label`, `value`, `limit`, `comparator` (`<=` | `>=`), `distanceToLimit`, `result`, `reason`; bei Leasing zusätzlich `leaseSource`, `leaseAmount`
  - `result: "disabled"` nicht anzeigen
- `headline` (Liste): `failed[]` mit `criterion`, `name`, `reason`, `check{basis,periodEnd,value,limit,comparator}`; `notChecked[]` mit `criterion`, `name`, `reason`
- `parameters` (die bei diesem Lauf gültigen Werte, Grundlage für `fillParams`)

ETFs (`asset_type = "etf"`) haben die Prüfungen G1 bis G4 und H statt A bis D. In Schritt 1 reicht für ETFs dieselbe Darstellung mit ihren Prüfungen.

## 6. Bausteine

### 6.1 StatusBadge
Drei Zustände, Farbe plus Text (nie nur Farbe), Konform = `--emerald`, Nicht konform = `--red`, Nicht geprüft = neutrales Grau. Wird überall verwendet, wo bisher `StatusPill` oder `ComplianceStar` stand. Der Stern und `STATUS_STYLES` mit „Halal/Grenzwertig/Nicht Halal“ entfallen.

### 6.2 Begründungszeile in der Liste
Aus `headline` bauen, kurz, ein Satz:

- **Nicht konform:** erste durchgefallene Prüfung. Bei Kennzahlen: „Zinstragende Schulden 34,2 % (höchstens 30 %), Quartal 27.06.2026“. Bei Prüfungen ohne Zahl: `reason`. Weitere durchgefallene Prüfungen als „und 1 weitere“.
- **Nicht geprüft:** in Worten, was fehlt. Zuordnung: A2 → „Satzung“, B3 → „Umsatzsegmente“, sonst `name` der Prüfung. Beispiel: „Satzung und Umsatzsegmente werden noch geprüft.“ Ohne Ergebnis in der Datenbank: „Wird demnächst geprüft.“
- **Konform:** „Alle Prüfungen nach AAOIFI SS 21 bestanden.“ plus Datum des Ergebnisses.
- Zahlenformat deutsch (Komma), Prozent mit einer Nachkommastelle, Datum als `TT.MM.JJJJ`.

### 6.3 Kennzeichnungen (Flags)
Texte aus `FLAG_TEXTS` in `explanations.js`. Als kleine Hinweise unter der jeweiligen Prüfung, jeder mit Link auf die Erklärseite (bevorzugt die Prüfung, unter der er steht, sonst `FLAG_TEXTS[flag].criterion`).

### 6.4 SourceLink
Nimmt eine Quellenangabe wie `"SS 21, 3/4/1; SS 59, 8/1 und 8/3"`, teilt sie mit `splitSources` in Fundstellen und zeigt jede als Link. Alle Fundstellen einer Prüfung führen auf **dieselbe** Erklärseite (`#/kriterium/b1`). Angaben mit „[Ableitung]“ bekommen den Hinweis „von uns abgeleitet, nicht wörtlich im Standard“.

## 7. Adressen (Hash-Routing)

Die Seite wechselt Ansichten heute nur über den `page`-Zustand ohne Adresse. Mit kleinem Aufwand Hash-Adressen ergänzen, ohne neue Bibliothek:

| Adresse | Seite |
|---|---|
| `#/` | Hauptseite |
| `#/aktie/AAPL` | Detailseite |
| `#/kriterium/b1` | Erklärseite (Prüfungs-ID klein) |
| `#/methodik` | Methodik-Übersicht |

Zurück- und Vor-Taste des Browsers müssen funktionieren, ein geladener Link muss die richtige Seite öffnen. Bestehende Seiten (Watchlist, Konto usw.) dürfen weiter über `page` laufen; sie bekommen nur dann Adressen, wenn es nichts kostet.

## 8. Hauptseite (HomePage)

Von oben nach unten:

1. **Kopfbereich** (`ScreeningHero`): ein Satz, was Tazkiyah prüft; darunter „Grundlage: AAOIFI Shari'ah Standards Nr. 21, 27 und 35“ mit Link auf `#/methodik`; der Satz zur fehlenden Verbindung mit der AAOIFI; der Hinweis zu Anlageberatung und Fatwa.
2. **Prüfstufen-Grafik** (`StageDiagram`): die vier Stufen aus `STAGES` (Tätigkeit, Kennzahlen, Vermögen, Aktie und Produkt) von links nach rechts oder untereinander, die Fragen aus `STAGES[].question`, bei Stufe B die Grenzen aus den Parametern (`debtMaxPct`, `depositsMaxPct`, `prohibitedIncomeMaxPct`), alles mit Links auf die jeweiligen Erklärseiten. Endet in den drei Status.
3. **Legende** (`StatusLegend`): die drei Status mit je einem Satz:
   - Konform: alle Prüfungen sind bestanden.
   - Nicht konform: mindestens eine Prüfung ist nicht bestanden.
   - Nicht geprüft: mindestens eine Prüfung steht noch aus oder ließ sich mit den Daten nicht abschließen; keine ist nicht bestanden.
4. **Filter und Sortierung:** Status (Mehrfachauswahl), Sektor, Aktie/ETF, Suche nach Name oder Ticker. Sortierung: Name, Ticker, niedrigste Verschuldung (B1), niedrigster Cash-Anteil (B2). **Kein „nach Score“.** Die bisherigen Schnellkacheln („Top nach Score“, „Grenzwertige Titel“, „Niedrigste Verschuldung“) entsprechend ersetzen: z. B. „Konforme Titel“, „Nicht geprüft“, „Niedrigste Verschuldung“.
5. **Liste** (`ScreeningList`, ersetzt `StockCard` für die Bewertung): Name, Ticker, `StatusBadge`, Begründungszeile (6.2). Klick öffnet die Detailseite. Aufklappen in der Karte entfällt, die Details stehen auf der Detailseite.

Bleibt unverändert: Navigation (`Sidebar`), Authentifizierung, Watchlist-Knopf in der Zeile.

## 9. Detailseite (ScreeningDetail, `#/aktie/AAPL`)

1. **Kopf:** Name, Ticker, `StatusBadge`, `statusLabel`, Datum des Ergebnisses (`screenedAt`) und **Datenstand** („Jahresabschluss 27.09.2025, Quartal 27.06.2026“ aus `dataBasis`).
2. **Begründung:** dieselbe Logik wie 6.2, aber ausführlich (alle durchgefallenen und alle offenen Prüfungen).
3. **Prüfungen**, gruppiert nach Stufe (A bis D, bei ETFs G und H):
   - Je Prüfung: Name in Klartext (nie nur Codes wie „B1“, den Code klein dazusetzen), Ergebnis aus `RESULT_LABELS`, **kurze Erklärung** (erster Satz aus `EXPLANATIONS[id].simple` mit `fillParams`), **Quelle** als `SourceLink`.
   - Bei Kennzahlen je `check`: Basis (Jahresabschluss/Quartal) mit Stichtag, **Wert gegen Grenzwert** („2,35 % von höchstens 30 %“) und **Abstand zur Grenze**. Kein Balken, der wie ein Score wirkt; ein dezenter Balken mit Grenzmarke ist erlaubt.
   - Offene Prüfungen: `reason` in Worten.
   - Kennzeichnungen (6.3) darunter.
   - Prüfungen mit manueller Prüfung (`review`): Datum, Quelle (`sourceUrl` als Link), Prüfer. Bei abgelaufener Prüfung („expired“) das sagen.
4. **Verlauf:** Statuswechsel mit Datum.
5. **Hinweis:** Anlageberatung/Fatwa, ein Link auf die Methodik.
6. **Platzhalter-Daten:** Was noch aus `stocks.js` kommt (Kurse), erscheint mit dem Hinweis „Beispielwerte“, solange es keine echten Kurse sind.

**Reinigung (Purification) und Zakat** stehen in `result.purification` und `result.zakat`. In Schritt 1 **nicht** darstellen und die bisherigen Zahlen dazu auch nicht mehr aus `stocks.js` zeigen; ein Hinweis „folgt“ genügt. Grund: Reinigung braucht zuerst die Prüfung der Umsatzsegmente.

## 10. Erklärseite je Prüfung (CriterionPage, `#/kriterium/b1`)

Gleicher Aufbau für alle Prüfungen A1 bis D3, H und G1 bis G4, Inhalte aus `EXPLANATIONS[id]` und den Parametern:

1. **Titel** (`name`) und Stufe.
2. **In einfachen Worten:** `simple` mit `fillParams` (Grenzwerte aus den Parametern).
3. **Quelle:** `source` als Fundstellen mit Hinweis, dass der Standardtext hier sinngemäß wiedergegeben wird.
4. **So rechnen wir:** je `parameterRefs`-Eintrag den Titel und `method` aus `DEFAULT_PARAMETERS`. `industryGroups` (nur A1) wird wie auf der Methodik-Seite dargestellt (`IndustryGroups`).
5. **Wo wir vom Wortlaut abweichen:** die Parameter unter `parameterRefs`, die `derivation: true` haben, im Namen eine Datengrenze beschreiben oder `pendingConfirmation: true` tragen (z. B. `marketCapFromPrice`, `leaseQuarterEstimate`, `realAssetsValuation`), hervorgehoben.
6. **Begründung und Alternative:** je Parameter `rationale` und `alternative`.
7. **Zurück:** Link zur Methodik und zu den Nachbarprüfungen derselben Stufe.

Felder `todo` in `explanations.js` **nicht anzeigen**. Sie sind offene Punkte der Projektinhaberin.

## 11. Methodik-Seite

`src/components/MethodikPage.jsx` bleibt die Übersicht über alle Regeln und bekommt:

1. Oben die **Prüfstufen-Grafik** (wie auf der Hauptseite) und darunter die Liste **aller Prüfungen nach Stufen**, jede mit Kurzsatz und Link auf `#/kriterium/...`.
2. Die vorhandenen Abschnitte (Grenzwerte, Datengrundlage, Tätigkeit, Reinigung, ETFs, „Daten und ihre Grenzen“) bleiben. Jeder Parameter-Eintrag zeigt zusätzlich „Verwendet bei:“ mit Links auf die Prüfungen, deren `parameterRefs` ihn enthalten.
3. Den Satz „Satzung, Umsatzsegmente und die Angaben zu ETFs werden von Hand … geprüft“ **nicht ändern**; die Beschreibung der Prüfmethode wird später in einem eigenen Schritt angepasst.

## 12. Nicht Teil von Schritt 1

- Watchlist-, Vergleichs-, Sektoren-, Kalender-, Berichte-Seite und der Portfolio-Anteil („Halal-Anteil“): Sie dürfen nicht abstürzen und müssen die **neuen** Status zeigen (über `StatusBadge`); ihre inhaltliche Überarbeitung folgt in Schritt 3. Wo ein Prozentwert oder Stern nicht ersetzbar ist, ausblenden und mit `// TODO Schritt 3` markieren.
- Texte in FAQ, Akademie und Glossar („Grenzwertig“, „Score“): Schritt 2. In Schritt 1 nur dort ändern, wo der Text dem neuen Status widerspricht und auf der Hauptseite oder Detailseite steht.
- Echte Kurse (Twelve Data), Free/Pro-Abgrenzung, Benachrichtigungen bei Statuswechsel.
- Änderungen an `src/screening/*` (Engine, Parameter, Runner). Falls dort etwas fehlt oder falsch ist: melden, nicht selbst ändern.

## 13. Abnahme

- [ ] `npm run test:screening` und `npm run build` laufen ohne Fehler.
- [ ] Auf der Vorschau-Adresse: Hauptseite zeigt Kopfbereich mit AAOIFI-Grundlage, Stufen-Grafik, Legende, Filter, Liste.
- [ ] Nirgends mehr: „Halal“ als Status, „Grenzwertig“, Score-Zahl, Stern, „Prüfungen bestanden“-Zählung.
- [ ] Apple und Microsoft haben Ergebnisse; Detailseite zeigt B1 mit Jahres- und Quartalswert, Abstand zur Grenze, Kennzeichnungen („Marktkapitalisierung aus Kurs gebildet“, „Leasing geschätzt“) und Quellen als Links.
- [ ] Ein Titel ohne Ergebnis zeigt „Nicht geprüft“ mit „Wird demnächst geprüft“.
- [ ] Klick auf „SS 21, 3/4/2“ öffnet `#/kriterium/b1`; der Link lässt sich kopieren und in einem neuen Tab öffnen; Zurück-Taste funktioniert.
- [ ] Die Erklärseite zeigt Grenzwerte aus den Parametern (30 %, 33,3 %), keine festen Zahlen im Text.
- [ ] Die Liste lädt ohne `inputs` und ohne die vollen `result`-Spalten (Netzwerk-Tab prüfen: Antwort deutlich unter 1 MB).
- [ ] Mobile Ansicht: Liste, Filter und Detailseite bedienbar.
