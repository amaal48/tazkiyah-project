# Umbau Schritt 1b: Startseite vereinfachen, Screener als eigene Seite, Methodik trägt die Erklärung

Stand: 02.10.2026. Arbeitsanweisung für Claude Code. Sie ergänzt `docs/UI-UMBAU-SCHRITT-1.md` und ersetzt dort die Abschnitte zur Hauptseite (Abschnitt 8) und zur Platzierung der Prüfstufen-Grafik. Alles andere aus Schritt 1 bleibt.

## 0. Anlass

Rückmeldung der Projektinhaberin nach dem Ansehen der Vorschau:

- Es steht zu viel Text auf einmal auf der Startseite.
- Die Startseite soll Tazkiyah vorstellen und zeigen, **was es gibt**: Screener, Portfolio, Berichte, Watchlist, Akademie, Methodik.
- Die Art, wie geprüft wird, gehört in die **Methodik**.
- Der Inhalt nutzt nur eine schmale Mittelspalte, die Breite der Seite bleibt ungenutzt. Es soll breiter und trotzdem übersichtlich und anschaulich sein.

Maßstab: Ein neuer Nutzer versteht in fünf Sekunden, was Tazkiyah ist und wo er klicken muss.

## 1. Feste Regeln

1. **Weniger Text.** Startseite insgesamt höchstens etwa 150 Wörter (ohne Navigation). Jede Karte hat höchstens einen Satz. Kein Absatz länger als drei Zeilen.
2. **Die Grundlage bleibt sichtbar** (frühere Entscheidung): Auf der Startseite steht in **einer einzigen kompakten Zeile** „Grundlage: AAOIFI Shari'ah Standards Nr. 21, 27 und 35“ (Link auf `#/methodik`), dazu „nicht mit der AAOIFI verbunden“ und „keine Anlageberatung, kein Rechtsgutachten (Fatwa)“. Kein AAOIFI-Logo.
3. **Drei Status, kein Score** (unverändert aus Schritt 1).
4. **Nichts erfinden:** keine Beispielzahlen, keine Beispielaktien mit erfundenem Ergebnis, keine Platzhalter als Dekoration.
5. **Gestaltung:** ruhig und redaktionell. Vorhandene Design-Variablen und Schriften weiterverwenden, ein Akzent (Gold). Keine Emojis. Einheitliche Linien-Icons (vorhandene Icon-Lösung nutzen, sonst einfache SVG). Keine Verlaufsflächen, kein Glühen, keine großen Schatten. Wenig Kästen im Kasten.
6. **Texte aus einer Stelle:** Statustexte kommen weiter aus den vorhandenen Komponenten (`StatusBadge`, `StatusLegend`), Erklärungen aus `src/screening/explanations.js`. Keine Grenzwerte fest eintippen.

## 2. Neue Aufteilung der Seiten

| Adresse | Inhalt |
|---|---|
| `#/` | Startseite (Überblick) |
| `#/screener` | Screener: Filter und Liste (der bisherige Listenbereich der Hauptseite) |
| `#/methodik` | Methodik mit „So wird geprüft“ |

Navigation:

- Das Logo führt zu `#/`.
- „Screener“ und „Alle Aktien“ in der Sidebar führen zu `#/screener`.
- Die Status- und Sektorfilter in der Sidebar bleiben erhalten. Ein Klick öffnet `#/screener` mit gesetztem Filter.
- Suche alle Stellen, die bisher auf die Hauptseite zurückführen (Zurück-Links auf Detail- und Erklärseiten, Breadcrumbs), und stelle sie auf die richtige Seite um. „Zurück“ von der Detailseite geht zum Screener, die Filter bleiben nach Möglichkeit erhalten.

## 3. Startseite (`#/`)

Von oben nach unten:

**A. Hero.** Ab 1000 px Breite zwei Spalten, darunter eine Spalte.

- Links:
  - Kleine Zeile über der Überschrift: „Investieren nach islamischen Grundsätzen“
  - Überschrift, höchstens zwei Zeilen auf Desktop: „Aktien und ETFs, geprüft nach AAOIFI-Standards.“ Schriftgröße fließend (`clamp`), deutlich kleiner als bisher (die jetzige Überschrift nimmt fünf Zeilen ein).
  - Unterzeile, ein bis zwei Sätze: „Tazkiyah zeigt, ob eine Aktie oder ein ETF die Prüfungen nach den AAOIFI-Standards besteht. Zu jeder Regel nennen wir die Quelle.“
  - Zwei Schaltflächen: primär „Zum Screener“ (`#/screener`), sekundär „So prüfen wir“ (`#/methodik`).
- Rechts: eine Karte „Drei mögliche Ergebnisse“ mit den drei `StatusBadge` und je einem kurzen Satz (gleiche Texte wie `StatusLegend`). Sie ersetzt die Legende der alten Hauptseite.

**B. „Was es bei Tazkiyah gibt“.** Sechs gleich große, vollständig klickbare Karten. 3 Spalten ab 1000 px, 2 Spalten ab 640 px, darunter 1 Spalte. Je Karte: Icon, Titel, ein Satz, kleiner Pfeil.

| Karte | Satz | Ziel |
|---|---|---|
| Screener | Aktien und ETFs nach den AAOIFI-Standards prüfen. | `#/screener` |
| Portfolio | Eigenes Portfolio anlegen und den Status je Position sehen. | Portfolio-Seite |
| Berichte | Berichte zum Marktgeschehen. | Berichte-Seite |
| Watchlist | Titel merken und im Blick behalten. | Watchlist-Seite |
| Akademie | Grundlagen zum Investieren nach islamischen Grundsätzen. | Akademie-Seite |
| Methodik | Wie wir prüfen, mit Quelle zu jeder Regel. | `#/methodik` |

Titel genau wie in der Navigation. Prüfe, ob die Sätze zum tatsächlichen Inhalt der Seiten passen (vor allem Berichte und Portfolio), und passe sie sonst an; sag mir, was du geändert hast. Seiten, die ein Konto brauchen, verhalten sich wie heute (Anmeldung).

**C. Schlusszeile**, klein und ruhig: die Zeile aus Regel 2.

**Entfällt auf der Startseite:** Prüfstufen-Grafik (zieht in die Methodik), langer Hinweiskasten, Schnellkacheln, Filter, Liste, Marktbericht-Abschnitt.

## 4. Screener-Seite (`#/screener`)

- Kopf: Titel „Screener“ und ein Satz, dazu ein Link „So prüfen wir“. Eine kompakte Zeile mit den drei Status als Badges (Erklärung per Tooltip oder kurzer Text, kein Absatz).
- Filterleiste: ab 1000 px in **einer** Zeile (Suche, Status, Sektor, Aktie/ETF, Sortierung), darunter die Trefferzahl. Filter und Sortierung wie in Abschnitt 8 von Schritt 1, ohne „nach Score“.
- Liste: Ab 1000 px als Zeilenliste mit Spalten **Name und Ticker | Sektor | Status | Begründung**, die ganze Zeile ist klickbar. Auf schmalen Bildschirmen Karten. Die Begründungszeile darf bis zu zwei Zeilen haben und wird nie ohne Ausweg abgeschnitten.
- Leerer Zustand („Keine Treffer“) mit Link zum Zurücksetzen der Filter.
- Die Liste nutzt die volle Inhaltsbreite (siehe 6).

## 5. Methodik-Seite

- Oben: Titel, ein bis zwei Sätze, die Grundlage (AAOIFI SS 21, 27, 35) mit dem Satz zur fehlenden Verbindung mit der AAOIFI und dem Hinweis auf Anlageberatung und Fatwa.
- Dann **„So wird geprüft“** mit der Prüfstufen-Grafik (von der Startseite hierher verschoben) und den drei Status mit Erklärung.
- **Die Stufenkarten dürfen keinen Text abschneiden.** In der Vorschau werden „Unternehmenszweck laut Satzung“ und „Zinstragende Schulden“ abgeschnitten, und „Stufe B“ bricht in eine zweite Zeile um. Karten per Raster mit `auto-fit` und Mindestbreite, Text umbrechen lassen, kein `text-overflow: ellipsis`, kein festes Höhenlimit.
- Danach die vorhandenen Abschnitte wie bisher. Lange Abschnitte dürfen einklappbar sein (`details`/`summary`), wenn die Seite dadurch nicht als Textwand beginnt.

## 6. Breite und Raster (für alle Seiten)

Heute nutzt der Inhalt nur eine schmale Mittelspalte mit viel leerem Rand links und rechts.

- Finde den Container, der die Breite begrenzt, und ändere ihn: Der Inhalt füllt den Platz neben der Sidebar bis höchstens etwa **1280 px**, mit seitlichem Abstand `clamp(16px, 3vw, 48px)`, **linksbündig zur Sidebar** und nicht in der Mitte schwebend.
- Fließtext (Erklärseiten, Absätze in der Methodik) bleibt auf etwa 68 Zeichen Zeilenlänge begrenzt, damit er lesbar bleibt. Karten, Tabellen, Filter und die Liste nutzen die ganze Inhaltsbreite.
- Prüfe bei Fensterbreiten 375, 768, 1280, 1440 und 1920 px. Kein horizontales Scrollen.

## 7. Nicht Teil dieses Schritts

Logo, Farbpalette und Schriften, Free/Pro, echte Kurse, Inhalte der Akademie, alles unter `src/screening/`. Wenn dort etwas fehlt, melde es.

## 8. Arbeitsweise

- Weiter auf dem Branch `ui-screening` (gleiche Vorschau-Adresse). Kleine Commits. Vor jedem Commit `npm run test:screening` und `npm run build`. Branch pushen, nicht `main`.
- Kein SQL. Wenn etwas nicht zum Code passt, frag nach.
- Trage in `PROJECT-CONTEXT.md` drei Sätze ein: neue Seitenstruktur (`#/`, `#/screener`, `#/methodik`), die Startseite stellt vor und verlinkt, „So wird geprüft“ steht in der Methodik, die AAOIFI-Grundlage bleibt als eine Zeile auf der Startseite.

## 9. Abnahme

- [ ] Startseite bei 1440 × 900 px: Überschrift, Unterzeile, beide Schaltflächen und mindestens die erste Kartenreihe sind ohne Scrollen sichtbar.
- [ ] Startseite insgesamt höchstens etwa 150 Wörter (ohne Navigation).
- [ ] Sechs Karten, jede führt zur richtigen Seite, Titel wie in der Navigation.
- [ ] Die Grundlage (AAOIFI SS 21, 27, 35) steht in einer Zeile auf der Startseite, mit Link zur Methodik.
- [ ] Prüfstufen-Grafik und Erklärung stehen in der Methodik, **nichts abgeschnitten**.
- [ ] `#/screener` zeigt Filter in einer Zeile und eine Liste in voller Breite; Sidebar-Filter funktionieren; Zurück von der Detailseite landet im Screener.
- [ ] Inhalt füllt die Breite (kein leerer Randstreifen links oder rechts) bei 1280, 1440, 1920 px; auf 375 px alles bedienbar.
- [ ] Nirgends „Halal“ als Status, „Grenzwertig“, Score, Stern oder Zählung.
- [ ] Tests und Build ohne Fehler.
