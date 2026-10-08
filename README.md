# Tazkiyah

(Ehemals "Amanah" — umbenannt aufgrund eines Namenskonflikts mit einer bestehenden Plattform auf dem deutschen Markt.)

Eine Web-App für Halal-konformes Investieren: datenbasierte Sharia-Screening-Analysen für Aktien und ETFs, gedacht für Privatanleger mit kleinerem Budget.

## Was schon funktioniert

- **Screener** – Suche mit Live-Vorschlägen, Filter nach Status (Halal / Grenzwertig / Nicht Halal), Sektor und Verschuldungsquote, live gefilterte Ergebnisliste
- **Aktien-Detailseite** – Geschäftsmodell-Screen mit Tooltips, Finanz-Ratios im Vergleich zum AAOIFI-Grenzwert, Live-Kursverlauf, Einschätzung je Aktie, ähnliche konforme Alternativen
- **Portfolio-Reinheit** – aggregierte Übersicht über den Halal-Anteil der eigenen Holdings
- **Reinheits-Rechner** – schätzt den Spendenanteil auf Dividenden
- **Watchlist** – aktienübergreifend merkbar, mit Zähler in der Sidebar, synchronisiert über Supabase bei eingeloggten Nutzern
- **Vergleichsfunktion** – bis zu 3 Aktien nebeneinander vergleichen
- **Sektor-Explorer** – Übersicht, wie viele Titel je Branche konform sind
- **Nutzerkonten** – Registrierung/Login/Passwort-Reset über Supabase Auth, eigenes Profil
- **PDF-Berichte & Akademie** – Wissens-/FAQ-Bereich zu den Screening-Kriterien
- **Sidebar-Navigation** – ein-/ausklappbar, mit aufklappbaren Gruppen und direkten Filter-Shortcuts

## Tech-Stack

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) (Auth + Postgres)
- Fundamentaldaten über Financial Modeling Prep (Ersatz durch SEC/EDGAR geplant), Kurs-Chart und Marktdaten über TradingView-Widgets
- Hosting über [Vercel](https://vercel.com/)

## Setup

```bash
npm install
npm run dev
```

Die App läuft danach lokal unter `http://localhost:5173`.

## Status

Aktiv in Entwicklung. Sharia-Screening-Daten stammen aus einer eigenen, per Python-Skript erzeugten CSV (503 echte US-Aktien + 1 verifizierter UCITS-ETF). Kurse und Fundamentaldaten in der Aktien-Detailseite sind live; im Screener selbst noch Demo-Werte (klar gekennzeichnet).

## Hinweis

Keine Anlageberatung.
