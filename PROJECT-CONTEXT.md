# PROJECT-CONTEXT.md — Tazkiyah

Stand: 01.10.2026. Dieses Dokument dient als vollständiger Kontext für neue Claude-Code-Sessions, um sofort produktiv weiterzumachen.

---

## 1. Projektüberblick

**Was ist Tazkiyah** (ehemals "Amanah" — umbenannt wegen Namenskonflikt mit `amanah-invest.de`, einer bestehenden Plattform mit gleicher Zielgruppe): Eine Web-App für Halal-konformes Investieren. Screent Aktien und ETFs nach den AAOIFI-Sharia-Standards Nr. 21 (Financial Paper), Nr. 27 (Indices) und Nr. 35 (Zakah) und zeigt Privatanlegern transparent, ob und warum ein Titel konform ist.

**Zielgruppe:** Privatanleger mit kleinerem Budget, Sharia-konform investieren wollend, explizit inklusive Einsteiger. Launch zunächst nur in Deutschland.

**Kernprinzipien:** Radikale Transparenz (jede Einstufung mit Begründung und Quelle), kein "KI"-Hype-Marketing, Neutralitätsversprechen (unabhängig von Brokern, keine Provisionen). Der Screener gibt Prüfergebnisse nach AAOIFI aus, keine religiösen Urteile ("konform nach AAOIFI SS 21" statt "halal").

### Kernfunktionen — umgesetzt

- **Screener, Aktien-/ETF-Detailseiten, Watchlist, Portfolio-Reinheit, Reinheits-Rechner, Vergleichsfunktion, Sektor-Explorer, Akademie, Termin-Kalender mit iCal-Export, deutscher Handelskalender, PDF-Berichte/Marktbericht, Sidebar-Navigation** — siehe README.md. Achtung: Diese Oberflächen lesen noch aus der statischen `src/data/stocks.js` mit dem alten Statusmodell (Halal/Grenzwertig/Nicht Halal, Score). Umstellung auf die neue Engine steht aus (siehe "Geplant / offen").
- **Nutzerkonten** (unverändert zum Stand 17.09.): Registrierung mit Autosave, Login, Passwort-Reset, Kontobereich mit 4 Unterseiten (`ProfilePage`, `SecurityPage`, `SettingsPage`, `PrivacyPage`), `profiles`-Tabelle mit Trigger und RLS, `watchlist_items`-Tabelle.
- **NEU: Screening-Engine nach AAOIFI** (`src/screening/`), siehe Abschnitt 4.
- **NEU: Täglicher Screening-Cron** (`api/run-screening.js`), siehe Abschnitt 4.
- **NEU: Methodik-Seite** (`src/components/MethodikPage.jsx`), öffentlich über die Sidebar ("Methodik"). Liest alle Inhalte direkt aus `parameters.js` und `industryRules.js`, jeder Parameter hat einen Anker `#methodik-<schlüssel>` für spätere Info-Symbole im Screener (`goTo("methodik", "methodik-debtMaxPct")`).
- **NEU: ETF-Holdings-Import** (`scripts/import-etf-holdings.mjs`): wandelt die iShares-Holdings-CSV (englisch oder deutsch) in eine SQL-Datei für den SQL Editor.

### Stand der Daten in Supabase (30.09.2026)

- Schema `supabase_schema_screening.sql` und Seed `supabase_seed_securities.sql` (503 Aktien aus dem S&P 500 + ETF ISWD) eingespielt.
- ETF ISWD: `fund_annual_report_date = 2025-10-31`; manuelle Prüfungen G2, G3, G4 und G5_FUND_INCOME eingetragen (alle bestanden, Quelle: Jahresbericht iShares II plc zum 31.10.2025, Seitenangaben in `manual_reviews`).
- ETF-Holdings zum 29.09.2026 importiert: 387 Aktienpositionen, 99,80 % Aktiengewicht. Nur 66,97 % des Gewichts (121 US-Titel) liegen im eigenen Universum, 266 vor allem ausländische Titel (32,83 %) nicht.
- **Entscheidung:** ISWD bleibt vorerst "nicht geprüft". Das Universum wird erst später um die ausländischen Titel erweitert, zusammen mit dem Wechsel auf einen FMP-Bezahltarif.
- Manuelle Prüfungen A2 (Satzung) und B3 (Umsatzsegmente) für Aktien: noch keine. Bis dahin sind alle Aktien "nicht geprüft" oder "nicht konform".

### Geplant / offen

**Screener (nächste Schritte):**
- Commit/Push der Screening-Dateien und erster Cron-Lauf (Vercel → Settings → Cron Jobs → "Run")
- Nach dem ersten Lauf an 2–3 Titeln gegen die Jahresberichte prüfen (Hinweise oben in `src/screening/providers/fmp.js`): Enthalten FMPs Schuldenfelder bereits Leasing? Liefert FMP 0 statt "unbekannt" bei nicht ausgewiesenen Zinserträgen? Bildet der Saldo `nonOperatingIncomeExcludingInterest` die sonstigen Erträge ausreichend ab?
- OpenFIGI-Börsenkennungen (`src/screening/providers/openfigi.js`) gegen die Dokumentation und an bekannten Titeln prüfen
- Erste manuelle Prüfungen A2/B3 für eine Auswahl von 10–20 Aktien (Claude bereitet Entwürfe mit Seitenangaben vor, Nutzerin bestätigt)
- Eingabemaske für manuelle Prüfungen statt Eintragen im Supabase Table Editor
- Oberfläche auf die Engine umstellen: drei Status überall (Screener, Detailseite, Glossar, Akademie, Filter, Portfolio), "Grenzwertig" und Score entfernen, optional "Abstand zum Grenzwert" als reine Info, Info-Symbole mit Link zur Methodik-Seite, Hinweis bei Statuswechsel auf der Watchlist (Tabelle `user_notifications`)
- `api/fundamentals.js` ist veraltet (alte Logik mit eigener Grenzwertprüfung) und sollte nach der Umstellung entfernt oder auf die Engine umgebaut werden
- Universum später um die ausländischen ISWD-Bestandteile erweitern (mit Bezahltarif)
- AAOIFI J5: prüfen, ob es neuere Fassungen von SS 21/27/35 als die in der Gesamtausgabe 2017 enthaltenen gibt (2004/2006/2008)

**Übrige offene Punkte (unverändert):**
- Backup-Strategie (Supabase Free vs. Pro / `pg_dump`)
- E-Mail ändern mit Bestätigung, Versand-Provider (Supabase vs. Resend/Postmark), gebrandete E-Mail-Templates
- Wöchentlicher E-Mail-Bericht (Tabelle `weekly_reports` und Cron existieren, Logik offen)
- Lokalisierung, OAuth (Google/Apple), 2FA, aktive Sitzungen, Konto löschen (serverlose Funktion mit Service-Role-Key)
- Portfolio an echte Nutzerkonten koppeln
- Reale AGB/Datenschutzerklärung (aktuell Platzhalter)

**Design (beim Design-Überarbeiten mit angehen):**
- `src/index.css` ist noch die Vorlage aus dem Vite-Starter: zentriert Text (`#root { text-align: center }`), setzt Absatzabstände auf null und färbt `h1`/`h2` im hellen Systemmodus fast schwarz. Diese Regeln liegen außerhalb der Tailwind-Layer und überschreiben Tailwind-Klassen. Die Methodik-Seite ist dagegen abgesichert (Inline-Stile für Überschriften, `pt-*` statt `mt-*` bei Absätzen), andere Seiten vermutlich nicht.
- Auf dem Handy ist die Sidebar standardmäßig ausgeklappt und verdeckt den Inhalt.
- In `stocks.js` wurde beim ETF die Replikation korrigiert ("Physisch (laut Jahresbericht 2025: optimierte Auswahl)"). Der Jahresbericht führt den Fonds als "non-replicating"; die iShares-Produktseite sagt "Replicated".

---

## 2. Tech-Stack & Setup

**Frontend:** React + Vite, Tailwind CSS v4, Recharts

**Backend/Infrastruktur:**
- **Supabase** — Auth (E-Mail/Passwort) + Postgres. Projekt heißt im Dashboard noch **"Amanah"** (rein kosmetisch). Region `eu-central-1`. Tarif: Free.
- **Vercel** — Hosting + Serverless Functions + Cron. Projekt **"tazkiyah"**, Produktions-URL `https://tazkiyah-project-kohl.vercel.app`. Automatisches Deployment bei Push auf `main`.
  - Crons (`vercel.json`): `/api/generate-weekly-report` montags 6:00 UTC, `/api/run-screening` täglich 3:00 UTC (`maxDuration` 60 s)
  - Umgebungsvariablen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `FMP_API_KEY`, `TWELVE_DATA_API_KEY`; optional `SCREENING_DAILY_CALL_BUDGET` (Standard 200) und `OPENFIGI_API_KEY`

**Externe APIs:**
- Twelve Data (Kurse, `api/price-history.js`)
- Financial Modeling Prep Stable API (Fundamentaldaten). **Free-Tarif nur für Entwicklung/Test** (250 Abrufe/Tag, geteilt mit dem Wochenbericht). Vor dem öffentlichen Launch Wechsel auf einen Tarif, der öffentliche Anzeige und kommerzielle Nutzung erlaubt. Anbieter ist über die Adapter-Schicht austauschbar.
- OpenFIGI (deutsche Handelsplätze per ISIN, kostenlos)

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
  components/
    MethodikPage.jsx     — öffentliche Methodik-Seite
api/
  run-screening.js       — täglicher Screening-Cron (manuell: ?limit=2&dryRun=1, nur mit CRON_SECRET)
scripts/
  import-etf-holdings.mjs — node scripts/import-etf-holdings.mjs <csv> [ETF-Ticker] [Stichtag]
supabase_schema_screening.sql — Schema für den Screener (wiederholbar)
supabase_seed_securities.sql  — Titel aus stocks.js anlegen (wiederholbar)
```

**Tests:** `npm run test:screening` (61 Tests: engine, runner, holdingsCsv, providers/fmp)

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
- Manuelle Prüfungen: Claude kann Entwürfe aus Jahresberichten vorbereiten (hochgeladene PDFs werden vollständig durchsucht), die Entscheidung trifft die Nutzerin.

---

## 4. Sharia-Screening-Logik

**Grundsatz (festgelegt):** Wortlaut des AAOIFI-Standards zuerst. Wo der Text Spielraum lässt, gilt die vorsichtigere Variante. Grenzwerte werden nicht strenger gemacht als im Standard (30 % / 30 % / 5 %). Alle Werte, Begründungen und Quellen stehen in `src/screening/parameters.js` und auf der Methodik-Seite. Die Abschnittsnummern wurden am 30.09. gegen die AAOIFI-Gesamtausgabe 2017 (englisch) geprüft.

**Status:** konform nach AAOIFI SS 21 / nicht konform / nicht geprüft. Rangfolge: belegtes Durchfallen → nicht konform (auch wenn andere Daten fehlen); sonst fehlende oder unklare Daten → nicht geprüft; sonst konform. Fehlende Daten führen nie zu "konform". "Grenzwertig" und der Score entfallen.

**Prüfstufen (Aktien):**
- **A Tätigkeit:** A1 Kerngeschäft (Branchengruppen in `industryRules.js`: Ausschluss / manuelle Prüfung / Prüfung über B3), A2 Unternehmenszweck laut Satzung (manuell), A3 Gold-/Silber-/Währungshandel (Ausschluss)
- **B Kennzahlen:** B1 zinstragende Schulden inkl. Leasing ≤ 30 % der Marktkapitalisierung zum Bilanzstichtag; B2 Cash und alle Anlagen ≤ 30 % (außer Daten belegen Unverzinslichkeit); B3 verbotene Einnahmen (Zinserträge + Segmente aus manueller Prüfung, nach Kategorien) ≤ 5 % der Gesamteinnahmen (Umsatz + Zinserträge + sonstige Erträge). B1/B2 auf letztem Jahresabschluss UND letztem Quartal; B3 auf letzten 4 Quartalen UND letztem Jahresabschluss.
- **C Vermögensstruktur:** C1 reale Vermögenswerte und Rechte ≥ 33,3 % der Gesamtaktiva (Buchwerte als Näherung für Marktwerte, Goodwill zählt nicht, immaterielle Werte zählen, Forderungen aus dem laufenden Geschäft zählen seit 01.10. nach SS 59, 8/1 mit), C2 keine Nur-Cash-Unternehmen/SPACs, C3 keine Nur-Forderungs-Unternehmen (eigene Prüfung: nach Abzug von Cash, Anlagen, Forderungen und Goodwill muss etwas übrig bleiben; Vorschlag, Bestätigung durch Nutzerin offen)
- **D Wertpapierart:** keine Vorzugsaktien mit finanziellem Vorrang, keine Tamattu'-Aktien, keine Anleihen
- **H Produktausschlüsse:** Margin, Leerverkauf, Leihe, Futures, Optionen, Swaps, Index-Derivate, gehebelte/inverse ETFs usw.

**ETFs:** G1 Look-through (jede enthaltene Aktie muss konform sein), G2 keine synthetische Replikation, G3 keine Wertpapierleihe, G4 keine Derivate, G5 Purification als gewichtete Reinigungsquote je 1.000 € (Mindestabdeckung 95 %, fehlender Teil wird mit gewichteter Durchschnittsquote hochgerechnet) plus fondseigene Zinserträge. G-Regeln sind Ableitungen und abschaltbar. Universum: nur UCITS-ETFs mit Basisinformationsblatt.

**Purification:** quartalsweise, Stichtag Quartalsende, unabhängig von Dividende/Gewinn (SS 21, 3/4/6/1–6). Erst berechenbar, wenn eine gültige B3-Segmentprüfung vorliegt.

**Zakat:** zakatpflichtiges Vermögen je Aktie (Cash + netReceivables + Vorräte) ohne Abzug von Verbindlichkeiten, Wert mit Abzug als Info; Fallback Nettogewinn minus Ausschüttungen der Periode.

**Universum Aktien:** nur Titel mit mindestens einem deutschen Handelsplatz (Prüfung per ISIN über OpenFIGI), gespeichert mit ISIN, Handelsplätzen und Prüfdatum.

**Manuelle Prüfungen:** Tabelle `manual_reviews` (Kriterien A1, A2, A3, B3_SEGMENTS, G2, G3, G4, G5_FUND_INCOME) mit Ergebnis, Quelle, Prüfer, Datum und `basis_annual_period_end`. Sie laufen ab, sobald ein neuer Jahresabschluss vorliegt (ETFs: neuer Fonds-Jahresbericht in `securities.fund_annual_report_date`). Arbeitsliste: View `manual_reviews_due`. B3-Beträge in `details.prohibitedRevenueByPeriod` mit Schlüsseln `"annual:JJJJ-MM-TT"` bzw. `"quarter:JJJJ-MM-TT"` und Kategorien aus `PROHIBITED_INCOME_CATEGORIES`; Zinserträge aus der GuV-Zeile nicht eintragen (zählt die Engine selbst).

**Cron-Ablauf (`api/run-screening.js`):** täglich. Holt Finanzdaten für nie geprüfte Titel bzw. wenn ein neues Quartal zu erwarten ist (7 Abrufe je Titel, Tagesbudget 200 → ca. 28 Titel/Tag, erster Volldurchlauf ca. 3 Wochen). Rechnet nach neuen manuellen Prüfungen oder Parameter-/Engine-Änderungen aus gespeicherten Daten neu (0 Abrufe). Speichert nur geänderte Ergebnisse (`screening_runs`, Historie; Statuswechsel per Trigger in `screening_status_changes`, Hinweise an Watchlist-Nutzer in `user_notifications`).

**Schutz des Crons (01.10.):** Sperre gegen gleichzeitige Läufe (Tabelle `screening_lock`, Funktionen `acquire_screening_lock`/`release_screening_lock`), Abrufe werden vor jedem Titel atomar über `add_api_usage` reserviert, FMP-Fehler haben eine Art (`limit`/`premium`/`other`). Bei „Limit Reach“ bricht der Abruf ab, ohne Titel als fehlerhaft zu markieren. Sind Quartale oder historische Marktkapitalisierung im Tarif gesperrt, wird mit den Jahreswerten weitergerechnet (betroffene Prüfungen „nicht geprüft“), und der Titel wird erst nach dem nächsten erwarteten Jahresabschluss erneut abgerufen.

**Supabase-Tabellen des Screeners:** `securities`, `screening_lock`, `screening_runs` (+ View `screening_current`), `screening_status_changes`, `user_notifications`, `manual_reviews` (+ View `manual_reviews_due`), `etf_holdings`, `purification_amounts`, `screening_api_usage`.

---

## 5. Konventionen & Design

Unverändert: Dark Theme (kein Light Mode), CSS-Variablen (`--bg`, `--surface`, `--border`, `--text`, `--muted`, `--faint`, `--gold`, `--gold-soft`, `--emerald`, `--emerald-soft`, `--red`, `--red-soft`, `--amber`, `--amber-soft`) — keine generischen Tailwind-Farben wie `slate`/`zinc`. Fraunces (Überschriften), Inter (Fließtext), IBM Plex Mono (Zahlen). Kein "KI"-Branding. Radikale Ehrlichkeit bei Demo-/Platzhalterdaten — fehlende/noch nicht gebaute Bereiche werden klar als "folgt später" gekennzeichnet. Neutrale Formulierungen im Screener (keine Fatwas, keine Handlungsanweisungen wie "musst verkaufen").
