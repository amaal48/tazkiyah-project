# PROJECT-CONTEXT.md — Tazkiyah

Stand: 17.09.2026. Dieses Dokument dient als vollständiger Kontext für neue Claude-Code-Sessions, um sofort produktiv weiterzumachen.

---

## 1. Projektüberblick

**Was ist Tazkiyah** (ehemals "Amanah" — umbenannt wegen Namenskonflikt mit `amanah-invest.de`, einer bestehenden Plattform mit gleicher Zielgruppe): Eine Web-App für Halal-konformes Investieren. Screent Aktien und ETFs nach islamischen Sharia-Kriterien (AAOIFI-Standards), zeigt Privatanlegern transparent, ob und warum ein Titel konform ist.

**Zielgruppe:** Privatanleger mit kleinerem Budget, Sharia-konform investieren wollend, explizit inklusive Einsteiger.

**Kernprinzipien:** Radikale Transparenz (jede Einstufung mit Begründung), kein "KI"-Hype-Marketing, Neutralitätsversprechen (unabhängig von Brokern, keine Provisionen).

### Kernfunktionen — umgesetzt

- **Screener, Aktien-/ETF-Detailseiten, Watchlist, Portfolio-Reinheit, Reinheits-Rechner, Vergleichsfunktion, Sektor-Explorer, Akademie, Termin-Kalender mit iCal-Export, deutscher Handelskalender, PDF-Berichte/Marktbericht, Sidebar-Navigation** — siehe README.md für Details, unverändert zum letzten Stand.
- **Nutzerkonten (vollständig ausgebaut, Stand heute):**
  - Registrierung mit Anzeigename (Pflicht), Vor-/Nachname (optional), Newsletter-Opt-in, Altersbestätigung (18+, Pflicht), AGB-Zustimmung (Pflicht) — `src/components/AuthPanel.jsx`
  - **Formular-Autosave** (live getestet, funktioniert): Registrierungsfelder (außer Passwort/Zustimmungen) werden während der Eingabe automatisch in localStorage zwischengespeichert, Absturzschutz — `src/hooks/useFormDraft.js`
  - Login, Passwort-vergessen-Anfrage — ebenfalls `AuthPanel.jsx`
  - Passwort-Reset (nach E-Mail-Link) — `src/components/ResetPasswordPanel.jsx`, reagiert auf Supabase-Event `PASSWORD_RECOVERY`
  - **Kontobereich in 4 Unterseiten aufgeteilt**, navigierbar über Dropdown-Menü im Sidebar-Footer (Klick auf E-Mail-Adresse) und über Tab-Navigation (`AccountNav.jsx`) oben auf jeder Unterseite:
    - `ProfilePage.jsx` — Persönliche Informationen (Anzeigename, Vor-/Nachname, E-Mail-Status mit Verifizierungs-Badge + Resend, Newsletter-Toggle)
    - `SecurityPage.jsx` — Passwort ändern; Platzhalter für OAuth/2FA/aktive Sitzungen (noch nicht umgesetzt)
    - `SettingsPage.jsx` — Platzhalter für Lokalisierung (Währung/Sprache/Format/Zeitzone), noch nicht umgesetzt
    - `PrivacyPage.jsx` — Datenexport (JSON: alle Daten; CSV: nur Watchlist-Ticker), live getestet und bestätigt funktionierend; Platzhalter für Konto-löschen (braucht serverlose Funktion mit Service-Role-Key, nicht im Frontend)
  - **`profiles`-Tabelle in Supabase**: per Trigger automatisch befüllt bei jeder Registrierung (`supabase_schema_profiles.sql`, im Projekt-Root abgelegt). Spalten: `id` (FK auf `auth.users`), `display_name`, `first_name`, `last_name`, `newsletter_opt_in`, `age_confirmed`, `terms_accepted_at`, `created_at`. RLS: jeder Nutzer sieht/ändert nur eigene Zeile. `ProfilePage.jsx` schreibt bei Änderungen sowohl in `user_metadata` als auch in diese Tabelle.
  - **Watchlist-Tabelle** (`watchlist_items`): pro Nutzer, Spalten u.a. `user_id`, `ticker`, `created_at` — siehe `src/hooks/useWatchlist.js`

### Geplant / offen

- **Backup-/Datensicherheits-Strategie**: aktueller Supabase-Tarif ist Free — dort laufen zwar automatische tägliche Backups im Hintergrund, sind aber NICHT selbst über das Dashboard abrufbar/wiederherstellbar (nur ab Pro-Tarif, 25$/Monat, inkl. optionaler Point-in-Time Recovery). Nutzerin prüft aktuell, ob ein manuelles `pg_dump`-Backup-Skript (kostenlos, aber manuell) für jetzt reicht oder ob ein Upgrade sinnvoll ist.
- E-Mail ändern mit Bestätigung
- Versand-Provider entscheiden (Supabase-Standard vs. Resend/Postmark)
- E-Mail-Templates branden
- Wöchentlicher E-Mail-Bericht (es gibt schon eine `weekly_reports`-Tabelle und einen Cron-Job in `vercel.json` auf `/api/generate-weekly-report`, aber die eigentliche Logik/Inhalt ist noch offen)
- Lokalisierung (Mehrsprachigkeit ist ein eigenes größeres Vorhaben, nicht nur ein Dropdown)
- OAuth (Google/Apple) — braucht zuerst manuelle Einrichtung im Supabase-Dashboard (Client-IDs bei Google/Apple selbst beantragen)
- 2FA (TOTP)
- Aktive Sitzungen/Geräte mit Standort (braucht externen Geo-IP-Dienst)
- Konto löschen (braucht serverlose Funktion mit Service-Role-Key)
- Portfolio an echte Nutzerkonten koppeln
- Reale rechtliche AGB/Datenschutzerklärung (aktuell Platzhalter-Links `href="#"` in `AuthPanel.jsx`)

---

## 2. Tech-Stack & Setup

**Frontend:** React + Vite, Tailwind CSS v4, Recharts

**Backend/Infrastruktur:**
- **Supabase** — Auth (E-Mail/Passwort) + Postgres. Projekt heißt im Dashboard noch **"Amanah"** (rein kosmetisch, nicht umbenannt, keine funktionale Auswirkung). Region `eu-central-1`. Nutzt Publishable Key (nicht Legacy-„anon"-JWT).
- **Vercel** — Hosting + Serverless Functions. Projekt umbenannt zu **"tazkiyah"**, feste Produktions-URL: `https://tazkiyah-project-kohl.vercel.app`. Automatisches Deployment bei Push auf `main`.

**Externe APIs:** Twelve Data (Kurse, `api/price-history.js`), Financial Modeling Prep Stable API (Fundamentaldaten, `api/fundamentals.js`) — beide live.

**GitHub:** `github.com/amaal48/tazkiyah-project` (umbenannt von `amanah-project` — alte URL leitet automatisch weiter)

**Ordnerstruktur (Ergänzungen seit letztem Stand):**

```
src/
  App.jsx                          — Hauptdatei (Screener, Detailseite, Watchlist, Portfolio,
                                      Akademie, Kalender, Sidebar mit Konto-Dropdown, Root)
  components/
    AuthPanel.jsx                  — Login/Registrierung/Passwort-vergessen, mit Autosave
    ResetPasswordPanel.jsx         — Neues Passwort nach E-Mail-Link setzen
    AccountNav.jsx                 — Tab-Navigation für die 4 Konto-Unterseiten
    ProfilePage.jsx                — Konto-Unterseite: Persönliche Informationen
    SecurityPage.jsx               — Konto-Unterseite: Passwort ändern
    SettingsPage.jsx               — Konto-Unterseite: Platzhalter Lokalisierung
    PrivacyPage.jsx                — Konto-Unterseite: Datenexport + Danger-Zone-Platzhalter
    Toast.jsx                      — generische Toast-Benachrichtigung (von allen Konto-Seiten genutzt)
  hooks/
    useFormDraft.js                — Formular-Autosave (localStorage), Absturzschutz
    useWatchlist.js                — Watchlist-Logik, Supabase-Sync bei Login
  lib/
    supabaseClient.js              — zentrale Supabase-Verbindung
supabase_schema_profiles.sql       — Trigger + RLS für profiles-Tabelle (Referenz, im SQL Editor
                                      ausgeführt, nicht automatisch angewendet)
supabase_backfill_profiles.sql     — einmaliges Backfill-Skript (Referenz)
```

**Wo der Code liegt:** Lokal auf dem MacBook der Nutzerin (`~/Desktop/Website`), zusätzlich auf GitHub. Notion nur für Planung/Dokumentation.

---

## 3. Workflow-Erklärung

**Grundprinzip:** Nutzerin bespricht Wünsche in einem separaten Claude-Chat (nicht diese Claude-Code-Session). Dort liefert Claude Code als herunterladbare Dateien. Diese müssen **aktiv heruntergeladen** werden — ohne Klick auf die Datei-Karte landet nichts auf der Festplatte, Claude Code sieht die Datei nicht.

**Danach:** Hier in Claude Code werden Anweisungen wie folgt gegeben:
```
Suche in ~/Downloads nach der neuesten Datei "AccountNav.jsx" und ersetze damit src/components/AccountNav.jsx.
```

**Besonderheiten:**
- Nutzerin ist Vollzeitstudentin, arbeitet nebenbei viel — ca. 20h/Woche fürs Projekt, unregelmäßig, keine festen Sprints.
- Immer präzise, nummerierte Anleitungen geben, keine Abkürzungen voraussetzen.
- Bei kurzen kritischen Werten in Vercel Environment Variables im Zweifel von Hand eintippen statt einfügen (Copy-Paste hat schon unsichtbare Zeichen eingeschleust).
- Nach Änderung an Vercel Environment Variables ist ein manueller Redeploy nötig.
- Jede gelieferte Datei wird vor Auslieferung syntaktisch geprüft.
- SQL-Migrationen (wie `supabase_schema_profiles.sql`) laufen **nicht** über Claude Code, sondern manuell im Supabase SQL Editor — Claude Code kopiert sie nur als Referenzdatei ins Repo.
- Git commit/push führt die Nutzerin selbst aus bzw. lässt Claude Code es tun, wenn explizit darum gebeten.

---

## 4. Sharia-Screening-Logik

Unverändert zum letzten Stand: zweistufiges Verfahren (Business Activity Screen + Financial Ratios), verbindlicher Grenzwert 30 % für Verschuldung und Cash-Quote, dreistufiger Status (Halal/Grenzwertig/Nicht Halal), Score 0–100 selbst hergeleitet. Bei Änderungen an der Grenzwert-Logik: an 3 Stellen synchron halten (Python-Screening-Skript, `App.jsx`/`ShariaDetailWidget.jsx`, `api/fundamentals.js`).

---

## 5. Konventionen & Design

Unverändert: Dark Theme (kein Light Mode), CSS-Variablen (`--bg`, `--surface`, `--border`, `--text`, `--muted`, `--faint`, `--gold`, `--gold-soft`, `--emerald`, `--emerald-soft`, `--red`, `--red-soft`, `--amber`, `--amber-soft`) — keine generischen Tailwind-Farben wie `slate`/`zinc`. Fraunces (Überschriften), Inter (Fließtext), IBM Plex Mono (Zahlen). Kein "KI"-Branding. Radikale Ehrlichkeit bei Demo-/Platzhalterdaten — fehlende/noch nicht gebaute Bereiche werden klar als "folgt später" gekennzeichnet statt vorzutäuschen, dass sie fertig sind (siehe `SettingsPage.jsx`, `SecurityPage.jsx`-Platzhalter).
