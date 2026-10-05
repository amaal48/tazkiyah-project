# UI-Umbau auf Design B („Hell und ruhig“)

Stand: 05.10.2026 · Entscheidung: Amaal hat Richtung B gewählt (heller Papierton, dunkles Grün als Hauptfarbe, Gold als Akzent). Das bisherige Dark Theme entfällt.

Diese Anweisung ist vollständig. Die Entwürfe liegen als Design-Leinwand bei Amaal; alles, was du zum Bauen brauchst, steht hier.

## Rahmen

- Arbeite auf dem Branch `ui-screening`. Nicht auf `main` mergen, nicht nach `main` pushen.
- **Keine Logik ändern.** `src/screening/engine.js`, `parameters.js`, `explanations.js`, die Provider, die Datenbank und alle Texte zur Methodik bleiben inhaltlich unverändert. Das hier ist ein reiner Umbau von Aussehen und Aufbau.
- Arbeite in den vier Phasen unten, **ein Commit pro Phase**. Nach jeder Phase: `npm run test:screening` und `npm run build` müssen fehlerfrei laufen.
- Keine neuen Abhängigkeiten außer Google Fonts.
- Keine erfundenen Zahlen. Wo die Seite Werte zeigt, kommen sie aus den echten Daten; fehlt ein Wert, wird der Bereich ausgeblendet, nicht mit Beispielwerten gefüllt.
- Am Ende `PROJECT-CONTEXT.md` anpassen: „Dark Theme, einziges Theme“ ersetzen durch „Helles Theme (Design B, entschieden 05.10.2026), kein Dark Mode“, und die Farbtabelle unten dort übernehmen.

## Phase 1 – Theme, Schriften, Grundbausteine

### Farben

Die Farben stehen zentral im `<style>`-Block in `App.jsx` (`:root { --bg … }`). Ersetze die Werte dort. Die Variablennamen bleiben, damit die rund 900 Verwendungen weiter funktionieren; drei neue kommen dazu.

| Variable | Alt (dunkel) | Neu (B) | Verwendung |
|---|---|---|---|
| `--bg` | #0E1613 | **#F5F2E9** | Seitenhintergrund (Papierton) |
| `--bg-deep` | #0B100E | **#EFEADD** | abgesetzte Flächen |
| `--surface` | #121B17 | **#FFFFFF** | Karten |
| `--track` | #1B2621 | **#EFEADD** | Balken-Hintergrund, neutrale Flächen |
| `--border` | #26332C | **#E2DBC9** | Ränder, Trennlinien |
| `--text` | #F2EFE9 | **#1B241F** | Haupttext |
| `--text-soft` | #C9CFC9 | **#3A433D** | Fließtext zweiter Ebene |
| `--muted` | #8B978F | **#4F5751** | Beschreibungen |
| `--faint` | #5B6560 | **#6B716C** | Platzhalter, Kleingedrucktes (nie kleiner als 13 px) |
| `--gold` | #C9A66B | **#B08A3E** | Grenzmarken, Linien, Icon-Akzente (nicht als Textfarbe) |
| `--gold-soft` | #E4C68A | **#8A6A2C** | Gold als Textfarbe (Kicker über Überschriften, kleine Akzente) |
| `--emerald` | #3E7C59 | **#2E7A55** | Flächen „konform“ (mit Transparenz) |
| `--emerald-soft` | #8FC9A6 | **#1D5E41** | Text „konform“ |
| `--red` | #7C3E3E | **#C0533F** | Flächen „nicht konform“ (mit Transparenz) |
| `--red-soft` | #D68F8F | **#9A3426** | Text „nicht konform“ |
| `--amber` | #8A6A2E | **#B07A1F** | Hinweise, Auslegungsfragen (Flächen) |
| `--amber-soft` | #E0B368 | **#7A5410** | Hinweise, Auslegungsfragen (Text) |
| neu `--primary` | – | **#1F5A43** | Hauptknöpfe, Links, aktive Navigation |
| neu `--primary-hover` | – | **#123B2B** | Hover von Knöpfen und Links |
| neu `--on-primary` | – | **#FFFFFF** | Text auf `--primary` |
| neu `--footer` | – | **#13231C** | Fußzeile (Text darauf #CFD6CF, Links #E2C27A) |

Danach diese Stellen gezielt umstellen, weil sich die Bedeutung umdreht:

1. **Hauptknöpfe:** Überall, wo `bg-[var(--gold)]` zusammen mit `text-[var(--bg)]` steht (14 Stellen), wird daraus `bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-hover)]`.
2. **`text-[var(--gold-soft)]` (58 Stellen) einzeln prüfen:** Ist es ein Link, ein klickbarer Text oder ein aktiver Navigationspunkt, wird es `text-[var(--primary)]`. Ist es ein Kicker, eine Nummer oder ein dekorativer Akzent, bleibt es `--gold-soft`.
3. **Aktive Zustände** mit `bg-[var(--gold)]/15` bzw. `border-[var(--gold)]` werden `bg-[var(--primary)]` mit `text-[var(--on-primary)]` (gefüllt) für aktive Filter, sonst `border-[var(--primary)]`.
4. **Fokus:** `focus-visible:outline-[var(--gold)]` → `focus-visible:outline-[var(--primary)]`, 2 px, 2 px Abstand. Jedes klickbare Element muss einen sichtbaren Fokus haben.
5. `.bg-lattice` (das goldene Punktraster) **entfernen**, Klasse und Verwendung.
6. `color-scheme: light` setzen. In `index.html`: `lang="de"` und `<meta name="theme-color" content="#F5F2E9">`.
7. **`src/index.css` aufräumen:** Alle Reste der Vite-Vorlage raus (die lila `--accent`-Werte, `#social`, der `prefers-color-scheme: dark`-Block, die Vorlagen-Schriftgrößen). Übrig bleiben nur `@import "tailwindcss";`, `body { margin: 0 }` und die `#root`-Regel für volle Breite.

### Schriften

- **Inter fällt weg.** Fließtext wird **Source Sans 3** (400, 500, 600). Überschriften bleiben **Fraunces** (400, 500). Zahlen, Ticker und Fundstellen bleiben **IBM Plex Mono** (400, 500).
- Den `@import` im `<style>`-Block entsprechend ändern und `.font-body` auf `'Source Sans 3', system-ui, sans-serif` setzen. Die Body-Schrift auf dem obersten Container in `App.jsx` setzen, damit sie überall gilt.

### Schriftgrößen und Lesbarkeit

| Element | Größe / Zeilenhöhe |
|---|---|
| Fließtext | 17 px / 1.6 |
| Beschreibungen, Tabellenzellen | 15–16 px |
| Kleingedrucktes, Quellenzeilen | 14 px, **nie unter 13 px** |
| H1 Startseite | Fraunces 500, 52 px / 1.1 (Handy 34 px) |
| H1 andere Seiten | Fraunces 500, 42 px / 1.15 (Handy 32 px) |
| H2 Abschnitt | Fraunces 500, 34 px (in Karten 24 px) |
| Kicker über H1 | Source Sans 3, 15 px, 600, `--gold-soft`, normale Schreibweise |

Dazu:
- **Keine Labels mehr in gesperrten Großbuchstaben** (`uppercase tracking-[0.15em]` usw.). Das ist der stärkste „KI-Look“. Ersetzen durch normale Schreibweise, 14–15 px, Gewicht 500–600, Farbe `--muted`.
- Alle `text-[11px]` und `text-xs` bei Inhalten auf mindestens 14 px anheben (Statusanzeigen eingeschlossen).
- Fließtext höchstens ca. 65 Zeichen breit (`max-w-[62ch]`).

### Abstände und Flächen

- Inhaltsbreite: höchstens **1160 px**, mittig, seitlicher Innenabstand **40 px** (Handy **20 px**). Die Klasse `.page` entsprechend anpassen; nach Phase 3 gibt es keine Sidebar mehr, also mittig statt linksbündig.
- Abstand zwischen großen Abschnitten **72–88 px**, innerhalb eines Abschnitts **24–32 px**.
- **Karten:** `--surface`, 1 px Rand `--border`, Radius **14–16 px**, Innenabstand **24 px**. **Keine Schatten, keine Verläufe, keine farbigen Ränder links.**
- Zeilen in Listen innerhalb einer Karte: 18–22 px vertikaler Innenabstand, Trennlinie `#ECE6D6`.

### Grundbausteine

- **Hauptknopf:** `--primary`, Text weiß, 600, 16 px, Höhe mind. 48 px, Radius 10 px, Innenabstand 14 × 26 px.
- **Zweitknopf:** weiß, 1 px Rand `#D6CEB9`, Text `--text`, sonst wie Hauptknopf.
- **Eingabefelder und Auswahllisten:** Höhe 50 px, Hintergrund `#FBFAF6`, Rand `#D6CEB9`, Radius 10 px, Text 16 px. Jedes Feld hat ein `<label>` (darf visuell versteckt sein).
- **Filter-Chips:** Pillenform, Höhe mind. 44 px, weiß mit Rand `#D6CEB9`; aktiv: gefüllt `--primary`, Text weiß.
- **Statusanzeige (`StatusBadge.jsx`):** Pillenform, 14 px, 600, Innenabstand 6 × 12 px. **Symbol plus Text, kein Punkt:**

| Status | Symbol | Hintergrund | Text |
|---|---|---|---|
| Konform | ✓ | #E3F0E8 | #1D5E41 |
| Nicht konform | ✕ | #F6E3DF | #9A3426 |
| Nicht geprüft | – | #ECECE8 | #555A55 |

  Die Symbole als kleine Inline-SVG (Strichstärke 2.2–2.4), `aria-hidden="true"`; der Text bleibt `STATUS_TEXT[key]`. Die Größe `lg` ist 16 px mit Innenabstand 10 × 18 px.
- **Icons:** einfache Strich-Icons (Inline-SVG, Strich 1.7), in einer 44 × 44-Kachel mit Radius 12 px, Hintergrund `#E6EFE9`, Icon `--primary`. Für Methodik die Gold-Variante: Hintergrund `#F4ECD9`, Icon `--gold-soft`. Keine Emojis.
- **Fußzeile:** volle Breite, Hintergrund `--footer`, darin die `BasisLine` in 14 px.

Commit: `UI B Phase 1: helles Theme, Schriften, Grundbausteine`

## Phase 2 – Seiten neu aufbauen

### Startseite (`StartPage.jsx`)

Reihenfolge von oben nach unten:

1. **Kopfbereich, zwei Spalten** (auf dem Handy untereinander), Abstand oben 80 px:
   - Links: Kicker „Investieren nach islamischen Grundsätzen“, H1 „Aktien und ETFs, geprüft nach AAOIFI-Standards.“, Einleitungssatz (19 px, `--muted`), darunter Hauptknopf „Zum Screener“ und Zweitknopf „So prüfen wir“.
   - Rechts: **Beispielkarte** mit einem echten konformen Titel aus den Screening-Daten (Name, Ticker, Statusanzeige, darunter B1 und B2 jeweils mit Wert gegen Grenzwert, Balken und Grenzmarke wie auf der Detailseite, Quellenzeile mit `SourceLink`). Gibt es keinen konformen Titel mit vollständigen Werten, wird die Karte nicht angezeigt.
2. **Legende der drei Status** als weiße Karte in voller Breite, drei Spalten nebeneinander: runde Symbolkachel (36 px, Farben wie Statusanzeige), daneben Status fett und eine Zeile Erklärung. `StatusLegend.jsx` entsprechend umbauen.
3. **„Was es bei Tazkiyah gibt“**: H2 plus eine Zeile Unterzeile, darunter die sechs Bereiche als Karten in einem Raster mit drei Spalten (`repeat(auto-fit, minmax(300px, 1fr))`, Abstand 16 px). Jede Karte ist ganz klickbar: Icon-Kachel links, rechts Titel (18 px, 600) und Beschreibung (16 px, `--muted`). Texte der Bereiche wie bisher.
4. **Fußzeile** wie in Phase 1.

### Screener (`ScreenerPage.jsx`, `ScreeningList.jsx`)

1. H1 „Screener“ und eine Zeile Einleitung.
2. **Filterkarte** (weiße Karte): oben Suchfeld („Name, Ticker oder ISIN suchen“) und Sortierung nebeneinander; darunter eine Zeile mit „Status:“ und den Chips Alle / ✓ Konform / ✕ Nicht konform / – Nicht geprüft, dann ein dünner senkrechter Trenner, dann Chips für Aktien, ETFs und Sektor. Die bestehende Filter- und Sortierlogik bleibt.
3. **Ergebnisliste als Kartenzeilen** statt Tabellenraster: jede Zeile eine eigene weiße Karte (Radius 14 px, Innenabstand 20 × 24 px, Abstand 10 px), ganz klickbar zur Detailseite. Inhalt in einer Reihe, die auf dem Handy umbricht: links Name (18 px, 600) und darunter `Ticker · Art · Sektor` in Mono 13 px; dann die Statusanzeige; dann die Begründung in einem Satz (16 px, `--muted`); rechts ein Pfeil → in `--gold-soft`. Die Kopfzeile der Tabelle entfällt.
4. Watchlist- und Vergleichsknöpfe bleiben erhalten, rechts in der Zeile, mind. 44 × 44 px, mit `aria-label`.

### Detailseite (`ScreeningDetail.jsx`)

1. Link „← Zurück zum Screener“, darunter Name als H1 (44 px), Ticker · Art · Sektor in Mono, rechts der Zweitknopf „+ Zur Watchlist“.
2. **Ergebnisfeld** in voller Breite, Radius 18 px, Innenabstand 32 px: links die Statusanzeige in Größe `lg`, daneben der Begründungssatz (19 px, 600) und darunter Prüfdatum und Datenstand (15 px).
   - Konform: Hintergrund `--primary`, Text #F2F5F1, Unterzeile #C9D9CF, Statusanzeige weiß mit grüner Schrift.
   - Nicht konform: Hintergrund #F6E3DF, Rand #E8C3BA, Text #7A2A1F.
   - Nicht geprüft: Hintergrund #ECECE8, Text #3A3F3B.
3. **Je Stufe ein Abschnitt** (A Tätigkeit, B Kennzahlen, C Vermögen, D Aktie und Produkt; bei ETFs die ETF-Stufen), auf breiten Bildschirmen zwei Spalten. Überschrift H2 24 px, darunter eine weiße Karte mit einer Zeile pro Prüfung:
   - Symbol (✓ / ✕ / –) in der Statusfarbe, daneben der Name in Klartext (600) und der Code (A1, B2 …) klein in Mono, `--faint`.
   - Bei Prüfungen mit Grenzwert: eine Zeile „Zeitraum“ links und „[Wert] % von höchstens 30 %“ rechts (Mono), darunter ein Balken 6 px hoch (Hintergrund `--track`, Füllung in der Statusfarbe, Breite = Wert im Verhältnis zur Balkenskala) mit einer **senkrechten Grenzmarke in `--gold`** (2 × 14 px) an der Position des Grenzwerts. Skala so wählen, dass der Grenzwert bei 60 % der Balkenbreite liegt.
   - Darunter die Quellenzeile (14 px): Abstand zur Grenze, falls vorhanden, und `SourceLink`.
   - Bei manuell geprüften Kriterien (A2, B3) zusätzlich „Manuell geprüft am …“ und der KI-Hinweis wie bisher, plus Link zum Beleg.
4. Kasten „Reinigung und Zakat“ als Hinweiskarte: Hintergrund #FBF5E6, Rand #EADBB5. Inhalt wie bisher.
5. Unten: „Keine Anlageberatung und kein Rechtsgutachten (Fatwa).“ und der Link zur Methodik.

Alle bisherigen Informationen der Detailseite bleiben erhalten; nur die Anordnung und Gestaltung ändern sich.

### Übrige Seiten

`CriterionPage`, `MethodikPage`, `PortfolioPage`, Watchlist, Konto-Seiten (`Profile`, `Settings`, `Security`, `Privacy`), `AuthPanel`, `ResetPasswordPanel`, `Toast`: nur an das neue Theme anpassen (Grundbausteine aus Phase 1, Schriftgrößen, keine Großbuchstaben-Labels, Karten statt dunkler Flächen). Kein neuer Aufbau.

Commit: `UI B Phase 2: Startseite, Screener und Detailseite im Design B`

## Phase 3 – Navigation oben statt Sidebar

1. Die Sidebar (`function Sidebar` in `App.jsx`) wird durch eine **Kopfleiste** ersetzt: volle Breite, Hintergrund `--bg`, unten 1 px Rand #DDD6C4, Inhalt in der Inhaltsbreite aus Phase 1, Höhe ca. 72 px.
   - Links das Logo: Kachel 30 × 30 px, Radius 8 px, `--primary`, darin ein goldener Punkt (10 px, #D9B45F); daneben „Tazkiyah“ in Fraunces 24 px.
   - Mitte: Screener, Portfolio, Berichte, Watchlist, Akademie, Methodik (16 px, 500). Aktiv: `--primary` mit 2 px Unterstrich; inaktiv: `--muted`. Neben Watchlist und Vergleich die bisherigen Zähler als kleine Zahl in einer Pille.
   - Rechts: „Anmelden“ als Hauptknopf (klein, Höhe 44 px) oder, wenn angemeldet, ein Kontomenü mit den bisherigen Einträgen (Profil, Einstellungen, Sicherheit, Datenschutz, Abmelden).
2. **Unter 900 px Breite**: Navigation einklappen. Rechts ein Menüknopf 44 × 44 px (weiß, Rand #D6CEB9, Radius 10 px, `aria-label="Menü öffnen"`, `aria-expanded`). Er öffnet ein Panel unter der Kopfleiste mit allen Punkten untereinander (je mind. 48 px hoch) und dem Anmelde- bzw. Kontobereich. Escape und Klick außerhalb schließen es.
3. Alles, was die Sidebar bisher konnte (Unterpunkte und Sprungmarken wie `activeAnchor`, Filter-Voreinstellungen, Zähler, Konto), muss über Kopfleiste oder Menü erreichbar bleiben. Unterpunkte als Aufklappmenü am jeweiligen Hauptpunkt.
4. Die Logik für `sidebarCollapsed` und den `marginLeft`-Versatz des Inhalts entfernen.

Commit: `UI B Phase 3: Kopfleiste statt Sidebar, Handy-Menü`

## Phase 4 – Prüfen und aufräumen

1. Im Code suchen und beheben, bis nichts mehr gefunden wird:
   - `uppercase` zusammen mit `tracking-` bei Labels
   - `text-[11px]` und `text-xs` bei Inhalten
   - `Inter`
   - `bg-lattice`
   - `text-[var(--bg)]` (Text in Hintergrundfarbe – war nur für Gold-Knöpfe gedacht)
   - feste Farbwerte `#…` außerhalb der Variablen, inklusive der blauen Reste `#8B9EE8` und `#3B4C7C`
2. **Kontrast:** Fließtext mindestens 4,5 : 1, große Schrift ab 24 px mindestens 3 : 1. Die Farben oben erfüllen das auf `--bg` und `--surface`; bei jeder neuen Kombination nachrechnen.
3. **Handy:** jede Seite bei 390 px Breite prüfen. Kein waagerechtes Scrollen der ganzen Seite; breite Inhalte scrollen in ihrem eigenen Kasten. Klickflächen mindestens 44 × 44 px.
4. **Tastatur:** Mit Tab durch Startseite, Screener, Detailseite und Menü gehen; alles erreichbar, Fokus immer sichtbar.
5. Tests und Build laufen fehlerfrei; die Bundle-Warnung über 500 kB notieren, aber in diesem Umbau nicht lösen.
6. `PROJECT-CONTEXT.md` wie im Rahmen oben beschrieben anpassen; eine Übergabe-Notiz `docs/UEBERGABE-<Datum>.md` mit dem Stand, offenen Punkten und dem, was du bewusst nicht geändert hast.

Commit: `UI B Phase 4: Prüfung, Aufräumen, Doku`

## Fertig, wenn

- Die Seite durchgehend hell ist, mit Grün als Hauptfarbe und Gold nur als Akzent.
- Startseite, Screener und Detailseite dem Aufbau oben entsprechen.
- Die Kopfleiste die Sidebar ersetzt und auf dem Handy als Menü funktioniert.
- Keine Inhalte, Werte oder Prüflogik verändert wurden.
- Alle vier Commits auf `ui-screening` liegen und nichts auf `main` gelandet ist.
