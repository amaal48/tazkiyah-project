# Tazkiyah: Übergabe UI-Umbau Design B (05.10.2026)

Zweck: Stand nach dem Umbau der Oberfläche auf Design B (Vorgabe `docs/UI-DESIGN-B.md`). Ergänzt die `PROJECT-CONTEXT.md` (Abschnitt 5 enthält jetzt Theme und Farbtabelle) und die Übergabe vom 04.10.2026 (A2/B3).

## 1. Stand

Branch **`ui-screening`**, vier Commits, einer pro Phase. **Nicht gepusht, nicht auf `main`.**

| Phase | Commit | Inhalt |
|---|---|---|
| 1 | `c578c62` | helles Theme, Variablen, Schriften (Source Sans 3 statt Inter), Grundbausteine (`.page`, `.btn-primary`, `.btn-secondary`, `.field`, `.chip`, `.card`, `.icon-tile`), Fokusrahmen, `index.css` aufgeräumt, `lang="de"` und `theme-color` |
| 2 | `7b7ebb8` | Startseite (Hero, Beispielkarte aus echten Daten, Status-Legende, Bereichskarten), Screener (Filterkarte, Kartenzeilen), Detailseite (Ergebnisfeld, Stufen, Kriterienzeilen mit Grenzbalken, Verlauf) |
| 3 | `5263097` | Kopfleiste (`SiteHeader.jsx`) statt Seitenleiste, Untermenüs, Kontomenü, Handy-Menü mit 48-px-Einträgen |
| 4 | dieser Commit | Prüfung, Aufräumen, Doku |

Nach jeder Phase liefen `npm run test:screening` (85/85) und `npm run build` fehlerfrei. In Phase 4 lief zusätzlich `npm run test:scripts` (22/22).

## 2. Was Phase 4 geprüft und geändert hat

- **Suchmuster:** keine Großbuchstaben mit Sperrung, kein `text-xs`, keine Schrift unter 13 px (eine letzte Stelle mit 9 px in den Kalenderkacheln behoben), kein Inter, kein `bg-lattice`, kein `text-[var(--bg)]`. Hex-Farben stehen nur noch in `:root` (die Earnings-Farben im Kalender liefen vorher über eigene Hex-Werte und nutzen jetzt `--primary` und `--tile`).
- **Kontrast:** alle Textfarben auf ihren Flächen mindestens 4,5:1. Dafür sind `--faint` und `--gold-soft` leicht dunkler als vorgegeben (Vorgabewerte: 4,46 bzw. 4,49). Das goldene Icon auf der goldenen Kachel hat 4,27:1, das reicht für Grafik (3:1).
- **Handy (390 px):** kein seitliches Scrollen auf Startseite, Screener, Detail, Methodik, Kriterium, Watchlist, Akademie, Berichte, Portfolio, Kalender und Sektoren. Zu kleine Tippflächen auf mindestens 44 px gebracht: Kriterien-Links und Zeitraum-Knöpfe im Chart (Detail), Kriterienliste (Methodik), Tabs (Akademie, Kalender), Filter und Export (Kalender), Kalenderkacheln, „Entfernen“ (Watchlist), Brotkrumen auf allen Unterseiten.
- **Tastatur:** Die Brotkrumen („Tazkiyah“, „Berichte“) waren `span`s mit Klick und mit der Tastatur nicht erreichbar, jetzt sind es Knöpfe. `focus:outline-none` an den Feldern für Anmeldung, Passwort, Profil und Sicherheit sowie an `.field` entfernt, damit der Fokusrahmen überall sichtbar ist. Der globale Fokusrahmen (2 px `--primary`, 2 px Abstand) steht außerhalb der Tailwind-Ebenen und wird von keiner Regel überschrieben.
- **Aufgeräumt:** `src/App.css` und `src/assets/` (Reste der Vite-Vorlage, nirgends eingebunden) gelöscht.

## 3. Offene Punkte

1. **Tastaturprüfung von Hand:** Die Prüfung lief über Code und CSS-Regeln. Echte Tab-Tastendrücke im Browser waren nicht möglich, weil das Vorschaufenster verdeckt war. Bitte einmal selbst durchtabben: Startseite → Screener → Detail → Menü (Desktop und Handy).
2. **Kontoseiten** (Profil, Einstellungen, Sicherheit, Datenschutz) und das Anmeldefenster sind nur über die gemeinsamen Variablen umgestellt und nicht im Browser angesehen, weil dafür eine Anmeldung nötig ist.
3. **Vorschau ansehen:** Vercel-Vorschau von `ui-screening` erst nach einem Push. Gepusht wird nur auf Wunsch.
4. **Bundle-Größe:** Der Build warnt, dass die JS-Datei über 500 kB groß ist (1,41 MB, gzip 331 kB). Wie vorgegeben nur notiert, nicht behoben. Später möglich: Seiten per `import()` nachladen.
5. Ältere Seiten in `App.jsx` (Portfolio-Demo, Akademie, Berichte, Kalender, Vergleich) sind farblich und in den Tippflächen angepasst, aber nicht neu aufgebaut wie Startseite, Screener und Detail.

## 4. Bewusst nicht geändert

- **Logik:** `src/screening/engine.js`, `parameters.js`, `explanations.js`, die Provider, die Datenbank und alle Methodiktexte sind inhaltlich unverändert. Filter- und Sortierlogik im Screener ist unverändert.
- **ISIN-Suche:** Die Vorgabe nennt „Name, Ticker oder ISIN suchen“. Die Suche kann heute keine ISIN, daher heißt das Feld „Name oder Ticker suchen“. Eine ISIN-Suche wäre eine Logikänderung.
- **Keine erfundenen Zahlen:** Die Beispielkarte auf der Startseite nimmt den ersten konformen Titel mit echten B1/B2-Werten (derzeit Johnson & Johnson) und wird ausgeblendet, wenn es keinen gibt.
- **Keine neuen Abhängigkeiten** außer Google Fonts (Fraunces, Source Sans 3, IBM Plex Mono).
- **Bundle-Warnung** nicht behoben (siehe oben).
- **`main`** nicht angefasst, nichts gepusht.
