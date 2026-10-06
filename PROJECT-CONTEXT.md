# PROJECT-CONTEXT.md — Tazkiyah

Stand: 06.10.2026. Dieses Dokument dient als vollständiger Kontext für neue Claude-Code-Sessions und neue Claude-Chats, um sofort produktiv weiterzumachen. **Einstieg: Abschnitt 0.**

---

## 0. Aktueller Stand und nächster Schritt (06.10.2026)

**Neu am 06.10.2026** (Branch `ui-screening`, nicht auf `main`):
- **Gegenprüfung:** `pass` nur nach vollständiger Gegenprüfung, „nicht konform“ auch per Stichprobe; festgehalten in `manual_reviews.verification`. Details: Abschnitt 4, „Gegenprüfung (Regel vom 06.10.2026)“.
- **Prüfer-Angabe:** intern Kürzel (`AMI`) und `ai_draft`; öffentlich „Geprüft von der Tazkiyah-Redaktion · vollständig geprüft · Quelle: … · geprüft im <Monat Jahr>“, ohne KI-Hinweis an den Ergebnissen (Engine 1.4.0). Die KI-Unterstützung steht einmal auf der Methodik-Seite. Details: Abschnitt 4, „Manuelle Prüfungen“.
- **Methodik-Seite:** Festlegung Arzneimittel bei „Drogen“, Absatz zur KI-gestützten Auswertung („Jede Auswertung nennt die genaue Fundstelle.“).
- **`review-to-sql.mjs`:** Aufruf `node --env-file=.env.local scripts/review-to-sql.mjs --reviewer AMI`; prüft den Jahresabschluss gegen `screening_current` und die Gegenprüfung.
- **Datenschutz der Prüfdaten:** `supabase_manual_reviews_verification.sql` und `supabase_manual_reviews_privacy.sql` am 06.10.2026 im SQL Editor ausgeführt. Test mit dem öffentlichen Schlüssel am 06.10.2026: `manual_reviews` und `manual_reviews_due` abgewiesen („permission denied“), 0 Vorkommen von `reviewer`, „KI-Entwurf“ oder `ai_draft` in den 31 gespeicherten Läufen; `screening_current` und `securities` weiter lesbar, Detailseite lädt.
- **Nächste Schritte:** (1) ~~SQL ausführen~~ erledigt 06.10. (2) Vorschau von `ui-screening` prüfen. (3) Kandidatenabfrage in `docs/BRIEFING-A2-B3.md` an den Prüfumfang vom 05.10. anpassen und ausführen. (4) `ui-screening` auf `main` mergen, danach Neuberechnung (`?limit=0`), nicht vorher über die Vorschau; erst dann erscheint „· vollständig geprüft“ an den Ergebnissen (die gespeicherten Ergebnisse stammen noch von Engine 1.3.0). Offene Punkte: Abschnitt 1, „Offene Punkte (Stand 06.10.2026)“.

**Neu am 05.10.2026:**
- **Datenanbieter entschieden:** FMP wird ganz ersetzt (SEC für Abschlüsse, Tiingo für Kurse). Bis dahin bleibt FMP Free in Betrieb. Details: Abschnitt 1, „Datenanbieter (Entscheidung 05.10.2026)“.
- **TradingView-Widgets auf der Detailseite** (Branch `ui-screening`, Commit `69e5e8f`): Kurs-Chart und Finanzdaten mit aktueller Marktkapitalisierung, erst nach Klick (Zwei-Klick-Lösung). Börse je Aktie in `securities.exchange` (in Supabase befüllt). Details: Abschnitt 1, „Kernfunktionen“.
- **Cron untersucht:** Er läuft, aber FMP Free liefert für fast alle Aktien keine Jahresabschlüsse (Fehler 402). Deshalb stehen erst 9 Titel in `screening_current`. Details: Abschnitt 4, „Cron-Befund (05.10.2026)“.
- **Nächster Schritt:** A2/B3 weiter mit der Kandidatenabfrage (Abschnitt 1, „Geplant / offen“, Punkt 3). Danach SEC- und Tiingo-Adapter bauen.

**Stand 02.10.2026 (abends), weiterhin gültig, soweit oben nichts anderes steht:**

**Wo wir stehen:** Datenbasis und Screening-Engine stehen und sind an Apple und Microsoft gegen Börsenkurs und 10-K geprüft. Die Oberfläche ist auf den Screener umgebaut (Branch `ui-screening`, Vorschau-Adresse bei Vercel, **noch nicht auf `main` gemergt**). Die Seite ist **nicht offiziell gestartet**, sie ist nur per Link erreichbar. Fast jede Aktie steht auf „nicht geprüft“, weil die Handprüfungen A2 (Satzung) und B3 (Umsatzsegmente) fehlen. Roadmap als Dokument: https://claude.ai/code/artifact/9740a04f-6d82-4c70-8fc2-c5bf2e8dac92

**Nächster Schritt (ab 03.10.):** A2/B3-Prüfung mit KI-Vorprüfung und Kontrolle durch die Nutzerin: erst ein Pilot mit zehn Aktien, dann der große Lauf, dann Stichproben. Briefing für den neuen Chat: `docs/BRIEFING-A2-B3.md`. (Pilot am 04.10. durchgeführt, Ergebnis in Abschnitt 4.)

**Zuerst prüfen oder erledigen:**
1. Vorschau von `ui-screening` ansehen (Apple-Chart, Microsoft ohne „Leasing geschätzt“, Handy, Klick auf eine Quelle) und danach auf `main` mergen.
2. `CRON_SECRET` erneuern (der alte Wert stand im Chat), `SCREENING_DAILY_CALL_BUDGET` auf 200 prüfen. Nach Änderungen an Vercel-Variablen manuell neu deployen.
3. Cron-Fortschritt ansehen (Abfrage der Titel mit Ergebnis in `screening_current`), damit klar ist, wie viele Titel schon Kandidaten für A2/B3 sind. (Erledigt 05.10.: 9 Titel, Ursache siehe Abschnitt 4, „Cron-Befund“.)

**Regeln, die immer gelten:**
- Geheimwörter und Schlüssel nie in einen Chat oder in Claude Code einfügen, nur in Vercel und im Terminal (`read -s CRON_SECRET`).
- Auslegungsfragen entscheidet die Nutzerin. Wortlaut des Standards zuerst, bei Spielraum die vorsichtigere Variante.
- Ein falsches „konform“ ist der teure Fehler, ein unnötiges „nicht geprüft“ nicht.
- Drei Status, kein Score, kein „Grenzwertig“; zu jeder Aussage Erklärung und Quelle.

---

## 1. Projektüberblick

**Was ist Tazkiyah** (ehemals "Amanah" — umbenannt wegen Namenskonflikt mit `amanah-invest.de`, einer bestehenden Plattform mit gleicher Zielgruppe): Eine Web-App für Halal-konformes Investieren. Screent Aktien und ETFs nach den AAOIFI-Sharia-Standards Nr. 21 (Financial Paper), Nr. 27 (Indices) und Nr. 35 (Zakah) und zeigt Privatanlegern transparent, ob und warum ein Titel konform ist.

**Zielgruppe:** Privatanleger mit kleinerem Budget, Sharia-konform investieren wollend, explizit inklusive Einsteiger. Launch zunächst nur in Deutschland.

**Kernprinzipien:** Radikale Transparenz (jede Einstufung mit Begründung und Quelle), kein "KI"-Hype-Marketing, Neutralitätsversprechen (unabhängig von Brokern, keine Provisionen). Der Screener gibt Prüfergebnisse nach AAOIFI aus, keine religiösen Urteile ("konform nach AAOIFI SS 21" statt "halal").

### Kernfunktionen — umgesetzt

- **Screener, Aktien-/ETF-Detailseiten, Watchlist, Portfolio-Reinheit, Reinheits-Rechner, Vergleichsfunktion, Sektor-Explorer, Akademie, Termin-Kalender mit iCal-Export, deutscher Handelskalender, PDF-Berichte/Marktbericht, Sidebar-Navigation** — siehe README.md. Seit 02.10. kommt der **Status** dieser Oberflächen aus Supabase (Screener, Branch `ui-screening`). `src/data/stocks.js` enthält nur noch Stammdaten und Platzhalter (Kurse, `eckdaten` sind Beispielwerte aus einem alten Lauf und werden als solche gekennzeichnet).
- **Nutzerkonten** (unverändert zum Stand 17.09.): Registrierung mit Autosave, Login, Passwort-Reset, Kontobereich mit 4 Unterseiten (`ProfilePage`, `SecurityPage`, `SettingsPage`, `PrivacyPage`), `profiles`-Tabelle mit Trigger und RLS, `watchlist_items`-Tabelle.
- **NEU: Screening-Engine nach AAOIFI** (`src/screening/`), siehe Abschnitt 4.
- **NEU: Täglicher Screening-Cron** (`api/run-screening.js`), siehe Abschnitt 4.
- **NEU: Methodik-Seite** (`src/components/MethodikPage.jsx`), öffentlich über die Sidebar ("Methodik"). Liest alle Inhalte direkt aus `parameters.js` und `industryRules.js`, jeder Parameter hat einen Anker `#methodik-<schlüssel>` für spätere Info-Symbole im Screener (`goTo("methodik", "methodik-debtMaxPct")`).
- **NEU: Oberfläche auf den Screener umgestellt** (Branch `ui-screening`): Startseite (`StartPage.jsx`), Screener-Seite mit Filtern und Liste (`components/screening/ScreenerPage.jsx`, `ScreeningList.jsx`), Detailseite (`ScreeningDetail.jsx`), **Erklärseite je Prüfung** (`CriterionPage.jsx`, Adresse `#/kriterium/b1`), Quellenangaben als Links (`SourceLink.jsx`), Prüfstufen-Grafik (`StageDiagram.jsx`), Hash-Adressen (`lib/hashRoute.js`), Laden der Ergebnisse (`lib/screeningData.js`). Portfolio-Seite (`PortfolioPage.jsx`) mit Hinweis, dass eigene Portfolios folgen.
- **NEU (05.10.2026): Kurs und Marktdaten von TradingView** auf der Detailseite (`components/screening/MarketData.jsx`, wiederverwendbare Komponente `components/TradingViewWidget.jsx`). Abschnitt „Kurs und Marktdaten“ nach den Prüfungen, vor „Verlauf“. Der alte Block `PriceSection` mit Beispielwerten und Demo-Chart ist entfernt.
  - Widgets: **„Symbol Overview“** (Kurs-Chart mit Kurs und Tagesänderung) und **„Fundamental Data“** (Finanzdaten, oben unter „Bewertung“ die aktuelle Marktkapitalisierung). „Symbol Info“ war geplant, zeigt die Marktkapitalisierung aber bei keiner Breite (getestet am Desktop und bei 390 px) und wird deshalb nicht verwendet. Sprache `de_DE`.
  - **Zwei-Klick-Lösung:** Vor dem Klick auf „Kursdaten von TradingView laden“ wird nichts von TradingView geladen (kein Skript, kein iframe, keine Anfrage; im Browser geprüft). Hinweis am Knopf: „Beim Laden werden Daten, u. a. deine IP-Adresse, an TradingView (USA) übertragen.“ Die Zustimmung gilt bis zum Neuladen für alle Aktien und wird nirgends gespeichert (nur Arbeitsspeicher, `lib/tradingViewClient.js`). So gewollt, vorerst nicht ändern.
  - TradingView-Branding und Link („… by TradingView“) bleiben unter jedem Widget sichtbar (Pflicht für die kostenlose Nutzung).
  - Hinweis unter den Widgets: „Kurs und Marktkapitalisierung von heute. Die Prüfung rechnet mit der Marktkapitalisierung am Bilanzstichtag, deshalb können die Werte abweichen.“
  - Farben zentral als `--tv-*` in `:root` (`App.jsx`), werden beim Laden ausgelesen.
  - **Börse:** Spalte `securities.exchange` (NASDAQ, NYSE, CBOE), befüllt aus der SEC-Liste `company_tickers_exchange.json` mit `node scripts/sec-exchanges.mjs` → `supabase_securities_exchange.sql` (erneut ausführbar, füllt nur leere Felder). Symbol in `lib/tradingView.js`: z. B. `NASDAQ:AAPL`, Aktiengattung mit Punkt (`BRK-B` → `NYSE:BRK.B`, `BF-B` → `NYSE:BF.B`). Ohne bekannte Börse kein Widget. ISWD hat kein Widget. AVB, EA und EQR bleiben leer (laut SEC: AVB am 17.08.2026 und EA am 04.08.2026 delistet, EQR heißt seit 12.08.2026 Vivmark Residential, Ticker VMRK an der NYSE; das Universum muss hier angepasst werden).
  - Später möglich (geplant, nicht umgesetzt): Kurse selbst über Tiingo anzeigen, ohne Klick. Erfordert die Anzeige-Lizenz von Tiingo (250 $/Monat).
- **NEU: ETF-Holdings-Import** (`scripts/import-etf-holdings.mjs`): wandelt die iShares-Holdings-CSV (englisch oder deutsch) in eine SQL-Datei für den SQL Editor.

### Stand der Daten in Supabase (02.10.2026)

- Schema `supabase_schema_screening.sql` und Seed `supabase_seed_securities.sql` (503 Aktien aus dem S&P 500 + ETF ISWD) eingespielt.
- ETF ISWD: `fund_annual_report_date = 2025-10-31`; manuelle Prüfungen G2, G3, G4 und G5_FUND_INCOME eingetragen (alle bestanden, Quelle: Jahresbericht iShares II plc zum 31.10.2025, Seitenangaben in `manual_reviews`).
- ETF-Holdings zum 29.09.2026 importiert: 387 Aktienpositionen, 99,80 % Aktiengewicht. Nur 66,97 % des Gewichts (121 US-Titel) liegen im eigenen Universum, 266 vor allem ausländische Titel (32,83 %) nicht.
- **Entscheidung:** ISWD bleibt vorerst "nicht geprüft". Das Universum wird erst später um die ausländischen Titel erweitert, zusammen mit dem Wechsel auf einen FMP-Bezahltarif.
- Manuelle Prüfungen A2 (Satzung) und B3 (Umsatzsegmente) für Aktien: noch keine. Bis dahin sind alle Aktien "nicht geprüft" oder "nicht konform".
- Der Cron holt seit 02.10. täglich ca. 24 Titel (Budget 200, 8 Abrufe je Titel). Die 28 Titel vom 30.09. (ohne Marktkapitalisierung) werden über die Datenversion einmal neu abgerufen. Ein Volldurchlauf dauert ca. 3 Wochen.
- **Stand 05.10.2026 (in der Datenbank geprüft):** `securities.exchange` befüllt: 340 × NYSE, 159 × NASDAQ, 1 × CBOE, leer: AVB, EA, EQR, ISWD. In `screening_current` stehen 9 Titel (AAPL, AMZN, BA, BAC, ISWD, JNJ, KO, MSFT, NVDA), Ursache siehe Abschnitt 4, „Cron-Befund“.
- **Stichprobe 02.10. bestätigt (Kurs, Aktienzahl, Leasing, B1, B2, C1 gegen Börsenkurs und 10-K):** AAPL B1 2,94 % (Jahr) und 2,35 % (Quartal), B2 3,47 % / 3,51 %, C1 63,14 % / 61,77 %; MSFT B1 4,65 %, B2 4,08 %, C1 69,3 %. Beide Titel stehen wegen fehlender A2/B3-Prüfung auf „nicht geprüft“.

### Geplant / offen

**Datenanbieter (Entscheidung 05.10.2026):**
- FMP-Angebot „Builders Plan“ (599 $/Monat) abgelehnt, zu teuer für die Entwicklungsphase.
- Ziel: FMP ganz ersetzen (geplant, noch kein Code):
  - Bilanz, GuV, Quartale, Aktienzahl am Bilanzstichtag: **SEC** (XBRL, kostenlos, kommerziell nutzbar). SEC als Quelle nennen, keine SEC- oder EDGAR-Logos verwenden.
  - Kurse zum Stichtag (für die Marktkapitalisierung): **Tiingo Commercial** (50 $/Monat, nur interne Nutzung). Buchen, wenn der Tiingo-Adapter gebaut wird.
  - Anfrage an Tiingo läuft: ob Status und Prozent-Kennzahlen und ob die Marktkapitalisierung mit dem Commercial-Tarif angezeigt werden dürfen. Eine eigene Kursanzeige braucht die Anzeige-Lizenz (Startups 250 $/Monat).
  - Branche für A1: künftig SEC-Branchencode (SIC). Eine Zuordnung zu den Branchengruppen in `industryRules.js` wird nötig.
- Reihenfolge: 1. Pilot A2/B3. 2. SEC- und Tiingo-Adapter bauen, für die Pilotaktien parallel zu FMP laufen lassen. 3. Zahlen vergleichen. 4. SIC-Zuordnung. 5. FMP abschalten. Bis dahin bleibt FMP Free in Betrieb und dient als Gegenprobe.
- Die Adapter-Schicht (`providers/model.js`) ist dafür vorgesehen. `mapFmpProfile` und der Cron werden bis dahin nicht mehr erweitert.

**Offene Punkte (Stand 05.10.2026):**
- Cron: Ursache für die 9 Titel ist gefunden (Abschnitt 4, „Cron-Befund“). Lösung ist der Anbieterwechsel oben; im Code wurde nichts geändert.
- Das Repository auf GitHub ist **öffentlich** (am 05.10. geprüft). `docs/UEBERGABE-2026-10-04.md` enthält eine E-Mail-Adresse und die Vercel-Adresse (die Vercel-Adresse steht auch hier in Abschnitt 2). Entscheidung offen: privat stellen oder öffentlich lassen.
- Vor dem Launch: TradingView in die Datenschutzerklärung aufnehmen, schriftliche Bestätigung von Tiingo ablegen.
- Universum anpassen: AVB und EA delistet, EQR jetzt VMRK (siehe Kernfunktionen, TradingView).

**Offene Punkte (Stand 06.10.2026, nach Commit `2ffc7a9` auf `ui-screening`):**
1. **SQL Editor (erledigt 06.10.2026):** `supabase_manual_reviews_verification.sql` ausgeführt (Spalten `verification` und `ai_draft`; Nachtrag `AMI`, `ai_draft = true`, `full` bei den sieben Pilot-Einträgen vom 04.10.; die Kontrollabfrage liegt bei der Nutzerin, mit dem öffentlichen Schlüssel ist die Tabelle nicht mehr lesbar). Eine neue `insert-reviews.sql` war nicht nötig.
2. **Vercel-Vorschau** von `ui-screening` ansehen: Detailseite („Geprüft von der Tazkiyah-Redaktion …“), Methodik-Seite (Festlegung Arzneimittel, Absatz zur KI-gestützten Auswertung).
3. **Keine Neuberechnung über die Vorschau-Adresse** (`?limit=0`): Die Vorschau rechnet mit Engine 1.4.0, der Cron auf `main` noch mit 1.3.0; beide würden die Ergebnisse täglich gegenseitig überschreiben, und `reviewer` käme zurück. Neuberechnung erst nach dem Merge auf `main`.
4. **Seitenangaben (entschieden 06.10.2026, Variante A):** Der Methodik-Satz lautet jetzt „Jede Auswertung nennt die genaue Fundstelle.“ statt „… enthält Seitenangaben“. Grund: Nur 5 der 20 Pilotprüfungen nennen eine Seite; A2 nennt den Artikel der Satzung, B3 teils nur Item oder Note. Seitenangaben sind keine Pflicht; `sourceNote` nennt Dokument und Abschnitt, die Seite, wenn das Dokument Seitenzahlen hat.
5. **Prüfer-Angabe und KI-Text nicht mehr öffentlich lesbar (erledigt 06.10.2026):** `supabase_manual_reviews_privacy.sql` ausgeführt: Lese-Policy auf `manual_reviews` entfernt, `anon`/`authenticated` dürfen `manual_reviews` und `manual_reviews_due` nicht mehr lesen, `reviewer` aus allen gespeicherten Ergebnissen entfernt (`criteria[].review` und `purification.fundInterestReview`, 39 Stellen). Das Schema ist angepasst, ein erneutes Ausführen bringt die Freigabe nicht zurück. Test mit dem öffentlichen Schlüssel am 06.10.2026: `manual_reviews` und `manual_reviews_due` abgewiesen („permission denied“), 0 Vorkommen von `reviewer`, „KI-Entwurf“ oder `ai_draft` in den 31 gespeicherten Läufen; `screening_current` und `securities` weiter lesbar, Detailseite lädt.
6. **Prüfdatum im Prüfkasten (entschieden 06.10.2026):** wird wieder angezeigt, nur Monat und Jahr, am Ende der Zeile nach der Quelle: „· geprüft im Oktober 2026“ (aus `reviewed_at`).

Stand der A2/B3-Prüfung, Auslegungen, FMP-Lizenzfrage und nächste Schritte: siehe docs/UEBERGABE-2026-10-04.md

**Screener (nächste Schritte, Stand 02.10. abends):**
1. `ui-screening` prüfen (Vorschau) und auf `main` mergen. Die Seite ist nicht gestartet.
2. `CRON_SECRET` erneuern, `SCREENING_DAILY_CALL_BUDGET` = 200 prüfen, Redeploy.
3. **A2/B3-Pilot** mit zehn Aktien (NVDA, JNJ, AAPL, AMZN, GOOGL, DIS, BRK-B, MSFT, KO, HD): KI liest Satzung und Segmentangaben, liefert Entwurf mit wörtlichem Zitat und Link, die Nutzerin kontrolliert alle zehn. Details: `docs/BRIEFING-A2-B3.md`. Stand 05.10.: Pilot durchgeführt (Abschnitt 4). Als Nächstes die Kandidatenabfrage ausführen. Achtung: Die Abfrage in `docs/BRIEFING-A2-B3.md` filtert noch mit `status <> 'nicht_konform'` und damit auch nach B1/B2/C1. Für den Prüfumfang vom 05.10.2026 (Abschnitt 4) darf sie nur Titel ausschließen, die eindeutig an A1 scheitern (noch anzupassen). Offen: B3-Häufigkeit (jährlich, quartalsweise oder nur Aktien mit verbotenen Segmenten quartalsweise), Wortlaut der Prüfer-Angabe (entschieden 06.10.2026, Abschnitt 4, „Manuelle Prüfungen“). Methodik-Seite (seit 06.10.2026, ersetzt den Platzhalter „KI-gestützte Prüfung mit Stichprobenkontrolle“): „Satzung und Umsatzsegmente werten wir mit KI-Unterstützung aus den Jahresberichten aus. Jede Auswertung nennt die genaue Fundstelle. Bevor ein Titel als ‚konform‘ gilt, prüfen wir die zitierten Stellen selbst nach.“ Regel dazu: Abschnitt 4, „Gegenprüfung“.
4. Großer Lauf für alle Aktien außer Titeln, die eindeutig an A1 scheitern (Prüfumfang vom 05.10.2026, siehe Abschnitt 4, „A2/B3-Prüfung (Planung)“; bis 04.10. galt: alle, die nicht schon an A1/B1/B2/C1 scheitern), danach Stichproben alle paar Tage (5–10 Aktien, gezielt). Kontrollseite für Entwürfe (Zitat, Link, „bestätigt/korrigieren“) statt Eintragen per SQL. Methodik-Seite (seit 06.10.2026, ersetzt den Platzhalter „KI-gestützte Prüfung mit Stichprobenkontrolle“): „Satzung und Umsatzsegmente werten wir mit KI-Unterstützung aus den Jahresberichten aus. Jede Auswertung nennt die genaue Fundstelle. Bevor ein Titel als ‚konform‘ gilt, prüfen wir die zitierten Stellen selbst nach.“ Prüfer-Angabe (seit 06.10.2026): intern Kürzel (`AMI`) und `ai_draft`, öffentlich „Geprüft von der Tazkiyah-Redaktion …“ (Abschnitt 4, „Manuelle Prüfungen“).
5. Kleinigkeiten: `todo`-Felder in `src/screening/explanations.js` (D2 Tamattu'-Aktien, C3/SS 59), alle Fundstellen gegen den Standardtext prüfen, SS 21, 3/4/8 zur Prüffrequenz nachlesen, Feld `metrics` im Ergebnis (Sortierung nach B1/B2 ohne Positionszugriff), OpenFIGI-Börsenkennungen prüfen (`providers/openfigi.js`), AAOIFI J5 (neuere Fassungen von SS 21/27/35?), `api/fundamentals.js` entfernen oder auf die Engine umbauen (wird von der Oberfläche nicht mehr benutzt).
6. **Vor dem Launch:** echte Kurse statt Beispielwerten (seit 05.10. über die TradingView-Widgets; eigene Kurse über Tiingo geplant), Datenanbieter siehe „Datenanbieter (Entscheidung 05.10.2026)“ (ersetzt die frühere Frage nach FMP-Tarif und Display-Lizenz), Free/Pro-Umfang, Transparenz (KI-gestützte Prüfung nennen), A2/B3 für die gefragtesten Titel.
7. **Danach (Schritt 3):** Portfolio mit eigenen Positionen und Reinheit, Watchlist-Hinweise bei Statuswechsel (Tabelle `user_notifications`), Vergleich/Sektoren/Kalender auf den neuen Stand, Reinigung und Zakat anzeigen (brauchen B3), ISWD vollständig (Universum um ausländische Titel erweitern, mit Bezahltarif).
- Offene Auslegungsfragen: B3-Prüffrequenz (jährlich oder pro Quartalsbericht), Behandlung unklarer Segmente (aktuell „nicht geprüft“), Operating-Leasing als Schuld (aktuell ja), Gültigkeit von A2 (aktuell jährlich).

**Vor dem öffentlichen Start:**
1. Fundstellen (Abschnittsnummern der AAOIFI-Standards SS 21, 27, 35) gegen den Standardtext prüfen.
2. Alle Auslegungsentscheidungen von einer fachkundigen Person gegenlesen lassen.
3. Wortlaut auf der Seite prüfen: nicht „AAOIFI-konform“ oder „halal“, sondern „geprüft nach den Kriterien von AAOIFI SS 21, mit offengelegten Auslegungen“, dazu der Hinweis, dass es keine Fatwa und keine Anlageberatung ist.
4. Methodik-Seite (`#/methodik`) nennt alle Auslegungen sichtbar.

**Übrige offene Punkte (unverändert):**
- Backup-Strategie (Supabase Free vs. Pro / `pg_dump`)
- E-Mail ändern mit Bestätigung, Versand-Provider (Supabase vs. Resend/Postmark), gebrandete E-Mail-Templates
- Wöchentlicher E-Mail-Bericht (Tabelle `weekly_reports` und Cron existieren, Logik offen)
- Lokalisierung, OAuth (Google/Apple), 2FA, aktive Sitzungen, Konto löschen (serverlose Funktion mit Service-Role-Key)
- Portfolio an echte Nutzerkonten koppeln
- Reale AGB/Datenschutzerklärung (aktuell Platzhalter)

**Design (beim Design-Überarbeiten mit angehen):**
- `src/index.css` ist noch die Vorlage aus dem Vite-Starter: zentriert Text (`#root { text-align: center }`), setzt Absatzabstände auf null und färbt `h1`/`h2` im hellen Systemmodus fast schwarz. Diese Regeln liegen außerhalb der Tailwind-Layer und überschreiben Tailwind-Klassen. Die Methodik-Seite ist dagegen abgesichert (Inline-Stile für Überschriften, `pt-*` statt `mt-*` bei Absätzen), andere Seiten vermutlich nicht.
- Auf dem Handy startet die Sidebar seit 02.10. eingeklappt (erledigt). Offen: Zeitraum-Knöpfe des Kurs-Charts stehen bei 375 px Breite 5 px über (entfällt seit 05.10., der alte Chart ist entfernt); weniger „KI-Look“ im Gesamtdesign.
- TradingView-Widgets bei 390 px: TradingView kürzt in den Finanzdaten die Beschriftungen („Mar…“), die Werte bleiben lesbar. Kein seitliches Scrollen.
- In `stocks.js` wurde beim ETF die Replikation korrigiert ("Physisch (laut Jahresbericht 2025: optimierte Auswahl)"). Der Jahresbericht führt den Fonds als "non-replicating"; die iShares-Produktseite sagt "Replicated".

---

## 2. Tech-Stack & Setup

**Frontend:** React + Vite, Tailwind CSS v4, Recharts (seit 05.10. nirgends mehr eingebunden, Abhängigkeit noch in `package.json`)

**Backend/Infrastruktur:**
- **Supabase** — Auth (E-Mail/Passwort) + Postgres. Projekt heißt im Dashboard noch **"Amanah"** (rein kosmetisch). Region `eu-central-1`. Tarif: Free.
- **Vercel** — Hosting + Serverless Functions + Cron. Projekt **"tazkiyah"**, Produktions-URL `https://tazkiyah-project-kohl.vercel.app`. Automatisches Deployment bei Push auf `main`.
  - Crons (`vercel.json`): `/api/generate-weekly-report` montags 6:00 UTC, `/api/run-screening` täglich 3:00 UTC (`maxDuration` 60 s)
  - Umgebungsvariablen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `FMP_API_KEY`, `TWELVE_DATA_API_KEY`; optional `SCREENING_DAILY_CALL_BUDGET` (Standard 200) und `OPENFIGI_API_KEY`

**Externe APIs:**
- Twelve Data (Kurse, `api/price-history.js`; seit 05.10. von der Oberfläche nicht mehr benutzt)
- Financial Modeling Prep Stable API (Fundamentaldaten). **Free-Tarif nur für Entwicklung/Test** (250 Abrufe/Tag, geteilt mit dem Wochenbericht). Vor dem öffentlichen Launch Wechsel auf einen Tarif, der öffentliche Anzeige und kommerzielle Nutzung erlaubt. Anbieter ist über die Adapter-Schicht austauschbar.
- OpenFIGI (deutsche Handelsplätze per ISIN, kostenlos)
- SEC / EDGAR (kostenlos, User-Agent mit Name und E-Mail Pflicht): 10-K und Satzung für A2/B3 (`scripts/sec-fetch.mjs`), Börse je Aktie (`scripts/sec-exchanges.mjs`). Abschlüsse per XBRL: geplant (ersetzt FMP).
- TradingView-Widgets (kostenlos, mit Branding, nur nach Klick): Kurs-Chart und Finanzdaten auf der Detailseite.
- Tiingo Commercial: geplant (Kurse zum Stichtag), noch nicht gebucht.

**GitHub:** `github.com/amaal48/tazkiyah-project`

**Ordnerstruktur (Ergänzungen seit 17.09.):**

```
src/
  screening/
    parameters.js        — EINZIGE Quelle für Grenzwerte, Auslegungsparameter,
                            Ableitungsregeln, Produktausschlüsse, Pflichthinweise
                            (je Parameter: value, method, rationale, alternative, source)
    industryRules.js     — Branchengruppen für A1/A3/C2 + Kategorien verbotener Einnahmen
    engine.js            — Prüfung A→B→C→D (ETFs: G) → H, Purification, Zakat; reine Funktion
    runner.js            — Ablauf eines Cron-Durchlaufs (Budget, Abruf, Neuberechnung, ETFs, Universum)
    supabaseRepo.js      — Datenbankzugriff des Runners (Service-Role-Key)
    holdingsCsv.js       — Parser für ETF-Holdings-CSV
    providers/
      model.js           — anbieterneutrales Datenmodell (die Engine kennt nur dieses)
      fmp.js             — FMP-Adapter
      openfigi.js        — Handelsplätze per ISIN
    *.test.js            — Tests (engine, runner, holdingsCsv)
    explanations.js      — Erklärtexte in einfachen Worten je Prüfung, Prüfstufen, Kennzeichnungstexte
  components/
    MethodikPage.jsx     — Methodik-Seite (Prüfstufen-Grafik, alle Regeln, „Daten und ihre Grenzen“)
    StartPage.jsx        — Startseite (Überblick mit Karten)
    PortfolioPage.jsx    — Portfolio-Seite (Hinweis „folgt“)
    TradingViewWidget.jsx — TradingView-Widget und Zustimmungs-Platzhalter (05.10.)
    screening/           — ScreenerPage, ScreeningList, ScreeningDetail, CriterionPage, SourceLink,
                            StageDiagram, StatusBadge, StatusLegend, BasisLine, format.js,
                            MarketData.jsx (Abschnitt „Kurs und Marktdaten“, 05.10.)
  lib/
    screeningData.js     — lädt Liste, Detail und Verlauf aus Supabase (nie die Spalte inputs laden)
    hashRoute.js         — Hash-Adressen: #/  #/screener  #/aktie/AAPL  #/kriterium/b1  #/methodik
    tradingView.js       — TradingView-Symbol aus Ticker und Börse (getestet)
    tradingViewClient.js — Zustimmung (nur Arbeitsspeicher) und Farben der Widgets
docs/
  UI-UMBAU-SCHRITT-1.md  — Anweisung Oberfläche (Status, Detailseite, Erklärseiten)
  UI-STARTSEITE.md       — Anweisung Startseite/Screener/Methodik (Schritt 1b)
  BRIEFING-A2-B3.md      — Briefing für die A2/B3-Prüfung (neuer Chat)
api/
  run-screening.js       — täglicher Screening-Cron (manuell: ?limit=2&dryRun=1 oder ?tickers=AAPL,MSFT&force=1, nur mit CRON_SECRET)
scripts/
  import-etf-holdings.mjs — node scripts/import-etf-holdings.mjs <csv> [ETF-Ticker] [Stichtag]
  sec-exchanges.mjs      — Börse je Aktie aus der SEC-Liste → supabase_securities_exchange.sql (05.10.)
supabase_schema_screening.sql — Schema für den Screener (wiederholbar)
supabase_securities_exchange.sql — Spalte securities.exchange anlegen und leere Felder füllen (wiederholbar)
supabase_seed_securities.sql  — Titel aus stocks.js anlegen (wiederholbar)
```

**Tests:** `npm run test:screening` (85 Tests: engine, runner, holdingsCsv, providers/fmp), `npm run test:scripts` (26 Tests: A2/B3-Skripte, Börsen-Skript), `npm run test:lib` (5 Tests: TradingView-Symbole). Stand 05.10.: alle bestanden.

**Wo der Code liegt:** Lokal auf dem MacBook der Nutzerin (`~/Desktop/Website`), zusätzlich auf GitHub. Notion nur für Planung/Dokumentation.

---

## 3. Workflow-Erklärung

**Grundprinzip:** Nutzerin bespricht Wünsche in einem separaten Claude-Chat. Dort liefert Claude Code als herunterladbare Dateien (einzeln oder als ZIP mit Projektpfaden). Diese müssen **aktiv heruntergeladen** werden.

**Danach** in Claude Code, z. B.:
```
Suche in ~/Downloads die neueste Datei, deren Name mit "tazkiyah-..." beginnt und auf ".zip" endet, und entpacke sie in ~/Desktop/Website (Ordnerstruktur beibehalten, vorhandene Dateien überschreiben).
```

**Besonderheiten:**
- Nutzerin ist Vollzeitstudentin, ca. 20 h/Woche fürs Projekt, unregelmäßig.
- Immer präzise, nummerierte Anleitungen geben, keine Abkürzungen voraussetzen; bei Unklarheit kurz Schritt für Schritt.
- Kurze kritische Werte in Vercel Environment Variables im Zweifel von Hand eintippen (Copy-Paste hat schon unsichtbare Zeichen eingeschleust). Nach Änderungen an Vercel Environment Variables manueller Redeploy nötig.
- Jede gelieferte Datei wird vor Auslieferung syntaktisch geprüft und, wo möglich, getestet.
- SQL (Schema, Seeds, Importe, manuelle Prüfungen) läuft **nicht** über Claude Code, sondern manuell im Supabase SQL Editor. In SQL-Beispielen keine Platzhalter wie `JJJJ-MM-TT`, sondern echte Werte.
- Git commit/push führt die Nutzerin selbst aus bzw. lässt Claude Code es tun, wenn explizit darum gebeten.
- Manuelle Prüfungen: Claude kann Entwürfe aus Jahresberichten vorbereiten (hochgeladene PDFs werden vollständig durchsucht), die Entscheidung trifft die Nutzerin. Ab 02.10. geplant: KI-Vorprüfung mit Quelle und wörtlichem Zitat, Stichprobenkontrolle (siehe `docs/BRIEFING-A2-B3.md`).
- Seit 02.10. läuft der Umbau der Oberfläche direkt in Claude Code auf einem Branch (`ui-screening`) mit Vercel-Vorschau; Anweisungen stehen in `docs/UI-*.md`. Gemergt wird erst nach der Prüfung der Vorschau.
- Anweisungen für Claude Code immer als kopierfertige Codeblöcke geben. Die Nutzerin ist keine Entwicklerin: einfache Worte, nummerierte Schritte, erklären, was ein Befehl tut.
- Befehle mit Geheimwörtern nur in der normalen Terminal-App ausführen (nicht in Claude Code, nicht im Chat), z. B. `read -s CRON_SECRET`, dann `curl -s -H "Authorization: Bearer $CRON_SECRET" "https://tazkiyah-project-kohl.vercel.app/api/run-screening?..."`.
- Wenn die Nutzerin einen Satz wie „alles klar, mach das“ schreibt, ist das die Freigabe für den zuletzt besprochenen Vorschlag, nicht für mehr.

---

## 4. Sharia-Screening-Logik

**Grundsatz (festgelegt):** Wortlaut des AAOIFI-Standards zuerst. Wo der Text Spielraum lässt, gilt die vorsichtigere Variante. Grenzwerte werden nicht strenger gemacht als im Standard (30 % / 30 % / 5 %). Alle Werte, Begründungen und Quellen stehen in `src/screening/parameters.js` und auf der Methodik-Seite. Die Abschnittsnummern wurden am 30.09. gegen die AAOIFI-Gesamtausgabe 2017 (englisch) geprüft.

**Status:** konform nach AAOIFI SS 21 / nicht konform / nicht geprüft. Rangfolge: belegtes Durchfallen → nicht konform (auch wenn andere Daten fehlen); sonst fehlende oder unklare Daten → nicht geprüft; sonst konform. Fehlende Daten führen nie zu "konform". "Grenzwertig" und der Score entfallen.

**Prüfstufen (Aktien):**
- **A Tätigkeit:** A1 Kerngeschäft (Branchengruppen in `industryRules.js`: Ausschluss / manuelle Prüfung / Prüfung über B3), A2 Unternehmenszweck laut Satzung (manuell), A3 Gold-/Silber-/Währungshandel (Ausschluss)
- **B Kennzahlen:** B1 zinstragende Schulden inkl. Leasing ≤ 30 % der Marktkapitalisierung zum Bilanzstichtag; B2 Cash und alle Anlagen ≤ 30 % (außer Daten belegen Unverzinslichkeit); B3 verbotene Einnahmen (Zinserträge + Segmente aus manueller Prüfung, nach Kategorien) ≤ 5 % der Gesamteinnahmen (Umsatz + Zinserträge + sonstige Erträge). B1/B2 auf letztem Jahresabschluss UND letztem Quartal; B3 auf letzten 4 Quartalen UND letztem Jahresabschluss.
- **C Vermögensstruktur:** C1 reale Vermögenswerte und Rechte ≥ 33,3 % der Gesamtaktiva (Buchwerte als Näherung für Marktwerte, Goodwill zählt nicht, immaterielle Werte zählen, Forderungen aus dem laufenden Geschäft zählen seit 01.10. nach SS 59, 8/1 mit), C2 keine Nur-Cash-Unternehmen/SPACs, C3 keine Nur-Forderungs-Unternehmen (belegt über C1, so in der Doku festgelegt; SS 21, 3/18; SS 59, 8/1 und 8/3)
- **D Wertpapierart:** keine Vorzugsaktien mit finanziellem Vorrang, keine Tamattu'-Aktien, keine Anleihen
- **H Produktausschlüsse:** Margin, Leerverkauf, Leihe, Futures, Optionen, Swaps, Index-Derivate, gehebelte/inverse ETFs usw.

**ETFs:** G1 Look-through (jede enthaltene Aktie muss konform sein), G2 keine synthetische Replikation, G3 keine Wertpapierleihe, G4 keine Derivate, G5 Purification als gewichtete Reinigungsquote je 1.000 € (Mindestabdeckung 95 %, fehlender Teil wird mit gewichteter Durchschnittsquote hochgerechnet) plus fondseigene Zinserträge. G-Regeln sind Ableitungen und abschaltbar. Universum: nur UCITS-ETFs mit Basisinformationsblatt.

**Purification:** quartalsweise, Stichtag Quartalsende, unabhängig von Dividende/Gewinn (SS 21, 3/4/6/1–6). Erst berechenbar, wenn eine gültige B3-Segmentprüfung vorliegt.

**Zakat:** zakatpflichtiges Vermögen je Aktie (Cash + netReceivables + Vorräte) ohne Abzug von Verbindlichkeiten, Wert mit Abzug als Info; Fallback Nettogewinn minus Ausschüttungen der Periode.

**Universum Aktien:** nur Titel mit mindestens einem deutschen Handelsplatz (Prüfung per ISIN über OpenFIGI), gespeichert mit ISIN, Handelsplätzen und Prüfdatum.

**Manuelle Prüfungen:** Tabelle `manual_reviews` (Kriterien A1, A2, A3, **B1_LEASE**, B3_SEGMENTS, G2, G3, G4, G5_FUND_INCOME) mit `result` (`pass`/`fail`/`unclear`), `details` (jsonb), `source_url` oder `source_note` (mindestens eins), `reviewer`, `reviewed_at` und `basis_annual_period_end`. **Eine Prüfung gilt nur, wenn `basis_annual_period_end` genau dem aktuellen Jahresabschluss der Aktie entspricht** (`screening_current.annual_period_end`); sonst gilt sie als abgelaufen. Sie laufen ab, sobald ein neuer Jahresabschluss vorliegt (ETFs: neuer Fonds-Jahresbericht in `securities.fund_annual_report_date`). Arbeitsliste: View `manual_reviews_due`. B3-Beträge in `details.prohibitedRevenueByPeriod` mit Schlüsseln `"annual:JJJJ-MM-TT"` bzw. `"quarter:JJJJ-MM-TT"` und Kategorien aus `PROHIBITED_INCOME_CATEGORIES`; Zinserträge aus der GuV-Zeile nicht eintragen (zählt die Engine selbst). **B3-Ergebnis:** `pass` = keine verbotenen Segmente (Beträge 0), `fail` = Beträge je Periode für den Jahresabschluss und jedes der letzten vier Quartale müssen vorliegen, `unclear` = Aktie bleibt „nicht geprüft“ (gemischte oder unklare Segmente, so festgelegt in `prohibitedIncomeSources`). **A2-Ergebnis:** `pass`, `fail` oder `unclear` (unklar oder fehlend = „nicht geprüft“). `B1_LEASE`: `details {quarterPeriodEnd, leaseLiabilities}`, nur nötig wenn B1 wegen einer Leasing-Schätzung „nicht geprüft“ ist. **Prüfer-Angabe (Entscheidung 06.10.2026):** intern `reviewer` = Kürzel der prüfenden Person (`AMI`) und `ai_draft` (boolean, `true` = es lag ein KI-Entwurf vor; für alle Einträge aus `review-work/`), dazu `verification` (`full`/`sample`). Öffentlich nur „Geprüft von der Tazkiyah-Redaktion · vollständig geprüft“ bzw. „· stichprobenartig geprüft“ (aus `verification`, entfällt ohne) „· Quelle: <Fundstelle>“ (aus `source_note`, verlinkt mit `source_url`) „· geprüft im <Monat Jahr>“ (aus `reviewed_at`, am Ende der Zeile). `reviewer` und `ai_draft` werden nirgends auf der Website angezeigt und nicht ins Prüfergebnis übernommen (Engine 1.4.0). Die KI-Unterstützung wird nur einmal auf der Methodik-Seite erklärt, kein Hinweis auf KI an den Ergebnissen. Der frühere Wortlaut „KI-Entwurf (Claude), kontrolliert von …“ gilt nicht mehr.

**Cron-Ablauf (`api/run-screening.js`):** täglich. Holt Finanzdaten für nie geprüfte Titel bzw. wenn ein neues Quartal zu erwarten ist (8 Abrufe je Titel: Profil, 6 Abschlüsse, Kursverlauf; Tagesbudget 200 → ca. 25 Titel/Tag, erster Volldurchlauf ca. 3 Wochen). Bis 01.10. war CALLS_PER_TITLE fälschlich 7 → Budget wurde um 1 Abruf je Titel unterschätzt.. Rechnet nach neuen manuellen Prüfungen oder Parameter-/Engine-Änderungen aus gespeicherten Daten neu (0 Abrufe). Speichert nur geänderte Ergebnisse (`screening_runs`, Historie; Statuswechsel per Trigger in `screening_status_changes`, Hinweise an Watchlist-Nutzer in `user_notifications`).

**Cron-Befund (05.10.2026, in der Datenbank geprüft, nichts geändert):** Der Cron läuft und ruft die Titel alphabetisch ab (am 05.10. waren es 24). Von 61 bisher abgerufenen Aktien hatten aber nur 8 Erfolg (AAPL, AMZN, BA, BAC, JNJ, KO, MSFT, NVDA). 44 scheiterten mit **FMP 402** („im Tarif nicht enthalten“) beim Jahresabschluss (GuV, Bilanz oder Cashflow), 9 am 30.09. mit 429 (Tageslimit, werden erneut versucht). Laut FMP-Preisseite enthält der Free-Tarif nur „Profile and Reference Data“, Jahresabschlüsse erst ab Starter. Dass es bei einigen bekannten Aktien klappt, spricht für eine kleine freigegebene Auswahl im Free-Tarif (Schlussfolgerung aus dem Muster, nicht von FMP bestätigt). Jeder gescheiterte Titel verbraucht trotzdem bis zu 8 Abrufe und ruht danach 7 Tage. Warten hilft also nicht; Lösung ist der Anbieterwechsel (Abschnitt 1, „Datenanbieter“). Ungeklärt: warum am 02. und 03.10. nur je 2 Titel abgerufen wurden (`screening_api_usage` ist mit dem öffentlichen Schlüssel nicht lesbar).

**Schutz des Crons (01.10.):** Sperre gegen gleichzeitige Läufe (Tabelle `screening_lock`, Funktionen `acquire_screening_lock`/`release_screening_lock`), Abrufe werden vor jedem Titel atomar über `add_api_usage` reserviert, FMP-Fehler haben eine Art (`limit`/`premium`/`other`). Bei „Limit Reach“ bricht der Abruf ab, ohne Titel als fehlerhaft zu markieren. Sind Quartale oder der Kursverlauf im Tarif gesperrt, wird mit den Jahreswerten weitergerechnet (betroffene Prüfungen „nicht geprüft“), und der Titel wird erst nach dem nächsten erwarteten Jahresabschluss erneut abgerufen.

**Oberfläche (Entscheidungen 02.10.):** Statt der alten Bewertung drei Status (konform / nicht konform / nicht geprüft), kein Score, kein Stern, kein „Grenzwertig“, keine Zählung „x von y bestanden“; bei „nicht geprüft“ steht in Worten, was fehlt. Ein vierter Status „noch nicht bearbeitet“ entfällt (zeigt „Wird demnächst geprüft“). Hauptseite: Kopf mit Grundlage AAOIFI SS 21/27/35 (kein AAOIFI-Logo, Satz zur fehlenden Verbindung), Prüfstufen-Grafik, Legende, Filter, Liste mit Begründungszeile. Detailseite: Kriterien mit Werten, Abstand zur Grenze, Kennzeichnungen, Quellen. **Jede Quelle ist ein Link auf eine eigene Erklärseite je Prüfung** (`#/kriterium/b1`), Texte zentral in `src/screening/explanations.js` und `parameters.js`. Free/Pro-Abgrenzung später. Arbeitsanweisung für Claude Code: `docs/UI-UMBAU-SCHRITT-1.md`, Umbau auf Branch `ui-screening` (umgesetzt, noch nicht auf `main`). Texte in Akademie, FAQ und Glossar sind auf die drei Status umgestellt; `stocks.js` ist von der alten Bewertung bereinigt. Engine 1.3.0 liefert `result.headline` (Kurzfassung für die Liste). **Prüfer-Angabe an Ergebnissen (06.10.2026):** Die Detailseite zeigt an jeder manuellen Prüfung „Geprüft von der Tazkiyah-Redaktion · vollständig geprüft“ bzw. „· stichprobenartig geprüft“ und „· Quelle: …“ (Link) und am Ende „· geprüft im <Monat Jahr>“ (seit 06.10.2026); ohne Prüfer-Kürzel und ohne KI-Hinweis. Die KI-Unterstützung steht einmal auf der Methodik-Seite („Daten und ihre Grenzen“). Offen: `todo`-Felder in explanations.js (D2 Tamattu', C3 SS 59), Fundstellen gegen den Standardtext prüfen.

**Seitenstruktur (Schritt 1b, 02.10.):** Die Seite hat drei Adressen: `#/` (Startseite), `#/screener` (Filter und Liste) und `#/methodik`. Die Startseite stellt Tazkiyah kurz vor und verlinkt auf Screener, Portfolio, Berichte, Watchlist, Akademie und Methodik; „So wird geprüft“ (Prüfstufen-Grafik und die drei Status) steht in der Methodik. Die AAOIFI-Grundlage (SS 21, 27, 35) bleibt als eine Zeile auf der Startseite, mit Link zur Methodik, „nicht mit der AAOIFI verbunden“ und „keine Anlageberatung, kein Rechtsgutachten (Fatwa)“. Arbeitsanweisung: `docs/UI-STARTSEITE.md`.

**A2/B3-Prüfung (Planung):** Vorprüfung durch KI mit Quelle und wörtlicher Textstelle, Kontrolle durch die Nutzerin nach der Regel „Gegenprüfung (06.10.2026)“ (unten in diesem Abschnitt); Grenzfälle werden gelistet und von ihr separat geprüft. A2 jährlich, B3 geplant nach jedem Quartalsbericht (Fundstelle SS 21, 3/4/8 noch prüfen). Methodik-Seite und Prüfer-Angabe: siehe „Gegenprüfung (06.10.2026)“ und „Manuelle Prüfungen“ (Prüfer-Angabe). **Prüfumfang (Entscheidung 05.10.2026):** A2 und B3 für alle Aktien prüfen, außer Titeln, die eindeutig an A1 scheitern (Ausschlussbranchen laut `industryRules.js`). Kein Vorfilter nach B1, B2 oder C1, weil diese Kennzahlen je Quartal schwanken und die Prüfung dann schon vorliegen soll. Geschätzt fallen 60 bis 70 Titel raus (Banken, Versicherungen, Kreditgeber, Rüstung, Glücksspiel, Alkohol, Tabak, Schweinefleisch), es bleiben ca. 430 bis 440, darunter 25 bis 30 sonstige Finanzdienstleister mit besonders aufwändigem B3. (Bis 04.10. galt: Nur Titel prüfen, die nicht schon an A1/B1/B2/C1 scheitern.) Kontrollseite statt reiner Eingabemaske (Entwurf, Quelle, Textstelle, „bestätigt/korrigieren“).

**A2/B3-Vorprüfung (Skripte, 03.10.):** `scripts/sec-fetch.mjs` holt je Aktie das jüngste 10-K und die Satzung von der SEC (EDGAR) nach `review-work/<TICKER>/`. Claude Code liest diese Texte und schreibt den Entwurf der Prüfung nach `review-work/<TICKER>/draft.json`. `scripts/review-sheet.mjs` erzeugt daraus den Kontrollbogen `review-work/kontrollbogen.md`, und `scripts/review-to-sql.mjs` erzeugt aus den bestätigten Entwürfen (`"confirmed": true`, Ergebnis pass oder fail) die SQL-Datei `review-work/insert-reviews.sql` für `manual_reviews`, die die Nutzerin selbst im Supabase SQL Editor ausführt. `review-work/` steht in `.gitignore`. Tests: `npm run test:scripts`. Ablauf und Regeln stehen in `docs/REVIEW-PILOT.md`.

**A2-Auslegung (Entscheidung 04.10.2026):** A2 prüft, ob die Satzung verbotene Geschäfte ausdrücklich zum Zweck macht (z. B. Bank-, Versicherungs-, Glücksspiel- oder Alkoholgeschäft als genannter Unternehmenszweck). Eine allgemeine Zweckklausel („jede rechtmäßige Tätigkeit“) oder eine Aufzählung allgemeiner Befugnisse (z. B. Wertpapiere halten, Schuldtitel ausgeben, Herstellungsverben wie „destillieren“ in einer allgemeinen Warenliste) gilt als pass. Ob das Geschäft selbst erlaubt ist, prüfen die anderen Kriterien (A1, B1, B2, B3, C1). Kurzform: „Zweck statt Befugnisse“, Anlass war Coca-Cola. Daraus folgt für die Entwürfe (wie in `docs/REVIEW-PILOT.md`): `pass`, wenn kein verbotenes Geschäft ausdrücklich Unternehmenszweck ist; `fail`, wenn eines ausdrücklich als Zweck genannt ist; `unclear` nur, wenn die Satzung fehlt, nur eine Änderungsurkunde ohne Zweckklausel oder nur ein Verweis vorliegt, oder wenn nicht erkennbar ist, ob ein verbotenes Geschäft Zweck oder nur Befugnis ist.

**B3-Regel Stichwort-Treffer (Entscheidung 04.10.2026):** Behaupte nie, etwas stehe nicht im 10-K, ohne es mit keyword-hits.md oder grep geprüft zu haben. Jeder Treffer in keyword-hits.md ist vor einem B3 pass zu bewerten; betrifft er ein eigenes Geschäft des Unternehmens, ist das Ergebnis unclear (oder fail, wenn die Beträge vorliegen). Fund aus dem Pilot: Der KO-Entwurf behauptete fälschlich, Alkohol werde im 10-K nicht erwähnt. Werkzeug: `node scripts/keyword-scan.mjs` schreibt je Aktie `review-work/<TICKER>/keyword-hits.md`.

### B3-Linie: strenge Auslegung (Stand 04.10.2026)
- Entscheidung von Amaal Ibrahim. Auslegung, keine Fatwa.
- Regel: Betreibt ein Unternehmen laut 10-K ein eigenes Geschäft, das verbotene Erträge enthalten kann (Kundenkredit, Finanzierungs- oder Kartenprogramme, Alkohol, Musik usw.), und werden diese Erträge nicht ausgewiesen, ist B3 unclear. Eigene Zinserträge aus Geldanlagen zählt die Engine selbst, sie führen nicht zu unclear.
- Nicht eingeführt: eine Obergrenzen-Regel (Abschätzung aus ausgewiesenem Bestand mal Zinssatz). Sie bleibt als Option für die Gegenlesung durch eine fachkundige Person.
- Folge im Pilot: HD, MSFT, KO, AAPL, AMZN, GOOGL und DIS stehen bei B3 auf unclear.
- Bedeutung in `manual_reviews`: `B3_SEGMENTS` = `fail` heißt „verbotene Segmente vorhanden, Beträge je Periode eingetragen“ (Jahresabschluss und letzte 4 Quartale), nicht „durchgefallen“. Die 5-%-Rechnung macht die Engine.

**A2/B3-Pilot, Ergebnis (04.10.2026):** Pilot (10 Aktien, 20 Prüfungen): A2 ohne inhaltlichen Fehler, eine veraltete Quelle (HD, Satzung von 2026). B3: zwei falsche pass (KO: Alkoholgeschäft, HD: Kredit an Kunden), beide erst durch die Stichwort-Suche gefunden, auch die Zweitlesung hatte sie übersehen. Folge: Stichwort-Suche und Summenprüfung sind Pflicht vor jedem B3 pass. Stand nach der B3-Linie: Nur NVDA und JNJ sind bei A2 und B3 gelöst (je pass). Bei MSFT wurde das eigene Finanzierungsprogramm erst durch die Stichwort-Suche v3.4 sichtbar.

**Gegenprüfung (Regel vom 06.10.2026, Amaal Ibrahim):** Jedes Ergebnis, das zu „konform“ führen kann (`pass`), wird vor der Freigabe vollständig gegengeprüft. Ergebnisse, die zu „nicht konform“ führen, dürfen per Stichprobe gegengeprüft werden. Festgehalten in `manual_reviews.verification`.
- Spalte `manual_reviews.verification` (`full` = alle zitierten Stellen vollständig gegengeprüft, `sample` = Stichprobe, `null` = Altbestand), mit Prüfregel. In `supabase_schema_screening.sql` ergänzt und als eigene Datei `supabase_manual_reviews_verification.sql` (Stand 06.10.: noch im SQL Editor auszuführen).
- `draft.json` hat je Prüfung das Feld `verification`, das die Nutzerin beim Bestätigen setzt (nie die KI).
- `scripts/review-to-sql.mjs` übernimmt `verification` in die Spalte. `pass` nur mit `full`, sonst übersprungen („pass ohne vollständige Gegenprüfung“); `fail` mit `full` oder `sample`; fehlt `verification`, wird übersprungen. Ablauf: `docs/REVIEW-PILOT.md`, Abschnitt 5 und 6.
- Stand 06.10.: Bei den sieben bestätigten Prüfungen (A2: HD, JNJ, KO, MSFT, NVDA; B3: JNJ, NVDA) steht `verification: "full"`; die Nutzerin hat sie vollständig geprüft.

**Arzneimittel (Festlegung vom 06.10.2026, Amaal Ibrahim):** Verschreibungspflichtige Arzneimittel, auch Betäubungsmittel für den medizinischen Einsatz, gelten als Arzneimittel und fallen nicht unter „Drogen“. Die Gruppe „Drogen“ meint Rauschmittel für den Freizeitgebrauch, einschließlich Freizeit-Cannabis. Gilt für alle Pharmaunternehmen. Hinterlegt in `src/screening/industryRules.js` (Gruppe `drugs`, Feld `decision`); die Methodik-Seite zeigt sie bei den Branchen als „Unsere Festlegung (06.10.2026)“. Reine Anzeige, die Prüflogik ändert sich nicht.

**Datenversion (02.10.):** `INPUT_DATA_VERSION` (runner.js) = Stand der Datenaufbereitung; Ergebnisse mit älterem Stand (`inputs.dataVersion`, ersatzweise Feld `multiClassIssuer` = Version 2) werden einmal neu abgerufen, auch innerhalb der 7-Tage-Sperre. Grund: die 28 Titel vom 30.09. hatten keine Marktkapitalisierung und wären sonst bis ca. Mitte November nicht neu abgerufen worden. Bei Änderungen, die gespeicherte Eingangsdaten entwerten, hochzählen.

**Manueller Lauf (02.10.):** `/api/run-screening?tickers=AAPL,MSFT&force=1` ruft nur diese Ticker ab (max. 20), auch wenn ihre Daten frisch sind (sonst gilt die 7-Tage-Sperre); Budget und Sperre gelten wie sonst, Universumsprüfung entfällt. Antwort enthält `unknownTickers`. Aufruf nur mit CRON_SECRET (Terminal: curl mit Authorization-Header auf die Production-Adresse).

**Marktkapitalisierung (02.10., von der Nutzerin bestätigt, Entwicklungsphase):** FMP Free liefert `historical-market-capitalization` nur für die letzten ca. 65 Handelstage (mit `from` gesperrt), `historical-price-eod/light` dagegen auch Jahre zurück (getestet für 2025). Deshalb: Marktkapitalisierung zum Stichtag = Schlusskurs am Stichtag (sonst letzter Handelstag davor, max. 7 Tage) × Aktienzahl. Aktienzahl: Bestand am Periodenende, wenn eine Quelle ihn liefert (Adapter-Parameter `sharesAtPeriodEnd`, bisher keine Quelle); sonst gewichteter Periodendurchschnitt, dann als `datenabweichung` gekennzeichnet. Snapshot-Feld `marketCapSource` (`price_x_weighted_avg_shares` / `price_x_period_end_shares`); Flag `marktkapitalisierung_aus_kurs` bei B1/B2. Mehrere Aktiengattungen: erkannt an gleicher CIK im Universum (`inputs.profile.cik`, Runner-Feld `multiClassIssuer`); da die Stückzahl je Gattung fehlt, gelten B1/B2 dann als „nicht geprüft“, solange die Marktkapitalisierung selbst gebildet ist. Grenze: Gattungen, die nicht im Universum stehen (z. B. BRK-A neben BRK-B), werden so nicht erkannt → Stichprobe nötig. Anbieterwert (Bezahltarif) hat Vorrang und ersetzt die Näherung. Parameter `marketCapFromPrice`, auf der Methodik-Seite unter „Daten und ihre Grenzen“ vermerkt.

**Leasing im Quartal (02.10., von der Nutzerin bestätigt):** Weist ein Quartal Leasing nicht gesondert aus (Feld 0 oder fehlt), übernimmt `applyLeaseEstimate` (fmp.js) den Wert des letzten Jahresabschlusses (`balance.leaseEstimate`), Flag `leasing_geschaetzt`. Keine Ergänzung bei Leasing im Quartal > 0, bei `debtFieldsIncludeLeases` oder wenn der Jahresabschluss Leasing erkennbar in den Schuldenposten enthält (`totalDebt` ≠ Schulden + Leasing → Doppelzählung vermeiden). Entscheidet die Schätzung (B1 mit Leasing > 30 %, ohne ≤ 30 %), ist B1 „nicht geprüft“ (`leasing_schaetzung_entscheidend`) und der 10-Q wird von Hand geprüft: manuelle Prüfung `B1_LEASE` mit `details {quarterPeriodEnd, leaseLiabilities}`, gültig nur für dieses Quartal und den aktuellen Jahresabschluss (Constraint im Schema ergänzt; Eingabemaske folgt). Parameter `leaseQuarterEstimate` (abschaltbar).

Offen: FMP-Tarifwahl und Display-Lizenz vor Launch. Stichprobe gegen 10-K/10-Q: Apple und Microsoft erledigt (Kurs, Aktienzahl, Leasing, B1, B2, C1 stimmen); offen sind eine Mehrgattungs-Firma (GOOGL/GOOG) und BRK-B. Hinweis: Microsofts Leasing (88,5 Mrd. $) besteht zu zwei Dritteln aus Finanzierungs-Leasing; die Einstellung `leaseLiabilitiesAsDebt` zählt alle Leasingverbindlichkeiten als Schuld (vorsichtige Lesart, Auslegungsfrage bei Operating-Leasing).

**Supabase-Tabellen des Screeners:** `securities` (seit 05.10. mit Spalte `exchange`), `screening_lock`, `screening_runs` (+ View `screening_current`), `screening_status_changes`, `user_notifications`, `manual_reviews` (+ View `manual_reviews_due`), `etf_holdings`, `purification_amounts`, `screening_api_usage`.

---

## 5. Konventionen & Design

Helles Theme (Design B, entschieden 05.10.2026), kein Dark Mode. Vorgabe und Begründung: `docs/UI-DESIGN-B.md`. Farben nur über CSS-Variablen im `<style>`-Block von `App.jsx` — keine generischen Tailwind-Farben wie `slate`/`zinc`, keine Hex-Werte außerhalb von `:root`. Fraunces (Überschriften), Source Sans 3 (Fließtext, 17 px), IBM Plex Mono (Zahlen, Ticker, Fundstellen). Kein Text in Großbuchstaben mit Sperrung, nichts unter 13 px. Kontrast mindestens 4,5:1 (3:1 ab 24 px), Tippflächen mindestens 44×44 px, Fokus immer sichtbar (2 px `--primary`). Navigation als Kopfleiste (`src/components/SiteHeader.jsx`) mit Menü fürs Handy, keine Seitenleiste. Kein "KI"-Branding. Radikale Ehrlichkeit bei Demo-/Platzhalterdaten — fehlende/noch nicht gebaute Bereiche werden klar als "folgt später" gekennzeichnet. Neutrale Formulierungen im Screener (keine Fatwas, keine Handlungsanweisungen wie "musst verkaufen").

**Farbtabelle (Design B)**

| Variable | Wert | Verwendung |
|---|---|---|
| `--bg` | #F5F2E9 | Seitenhintergrund (Papierton) |
| `--bg-deep` | #EFEADD | abgesetzte Flächen |
| `--surface` | #FFFFFF | Karten |
| `--track` | #EFEADD | Balken-Hintergrund, neutrale Flächen |
| `--border` | #E2DBC9 | Ränder, Trennlinien |
| `--text` | #1B241F | Haupttext |
| `--text-soft` | #3A433D | Fließtext zweiter Ebene |
| `--muted` | #4F5751 | Beschreibungen |
| `--faint` | #656B66 | Platzhalter, Kleingedrucktes (nie kleiner als 13 px) |
| `--gold` | #B08A3E | Grenzmarken, Linien, Icon-Akzente (nicht als Textfarbe) |
| `--gold-soft` | #836527 | Gold als Textfarbe (Kicker, kleine Akzente) |
| `--emerald` | #2E7A55 | Flächen „konform“ (mit Transparenz) |
| `--emerald-soft` | #1D5E41 | Text „konform“ |
| `--red` | #C0533F | Flächen „nicht konform“ (mit Transparenz) |
| `--red-soft` | #9A3426 | Text „nicht konform“ |
| `--amber` | #B07A1F | Hinweise, Auslegungsfragen (Flächen) |
| `--amber-soft` | #7A5410 | Hinweise, Auslegungsfragen (Text) |
| `--primary` | #1F5A43 | Hauptknöpfe, Links, aktive Navigation, Fokus |
| `--primary-hover` | #123B2B | Hover von Knöpfen und Links |
| `--on-primary` | #FFFFFF | Text auf `--primary` |
| `--footer` | #13231C | Fußzeile (Text darauf `--footer-text` #CFD6CF, Links `--footer-link` #E2C27A) |

Abweichung von der Vorgabe: `--faint` (#6B716C → #656B66) und `--gold-soft` (#8A6A2C → #836527) sind leicht abgedunkelt, weil die Vorgabewerte auf `--bg` nur 4,46:1 bzw. 4,49:1 erreichten. Weitere Hilfsvariablen für Status-Pillen, Kacheln und Formulare (`--ok-*`, `--bad-*`, `--none-*`, `--tile`, `--tile-gold`, `--note-*`, `--field`, `--control-border`, `--line`, `--header-border`, `--logo-dot`) stehen ebenfalls in `:root`.
