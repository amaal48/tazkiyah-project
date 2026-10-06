import React, { useState, useEffect } from "react";
import { ALL_STOCKS } from "./data/stocks";
import { generateICS, downloadICS } from "./utils/icsExport";
import { supabase } from "./lib/supabaseClient";
import { AuthPanel } from "./components/AuthPanel";
import { ResetPasswordPanel } from "./components/ResetPasswordPanel";
import { ProfilePage } from "./components/ProfilePage";
import { SecurityPage } from "./components/SecurityPage";
import { SettingsPage } from "./components/SettingsPage";
import { PrivacyPage } from "./components/PrivacyPage";
import { useWatchlist } from "./hooks/useWatchlist";
import { Toast } from "./components/Toast";
import MethodikPage from "./components/MethodikPage.jsx";
import { navigate, pushHashSilently, routes, useHashRoute } from "./lib/hashRoute";
import { useScreeningList } from "./lib/screeningData";
import StatusBadge from "./components/screening/StatusBadge.jsx";
import { ScreeningRow } from "./components/screening/ScreeningList.jsx";
import ScreenerPage from "./components/screening/ScreenerPage.jsx";
import StartPage from "./components/StartPage.jsx";
import PortfolioPage from "./components/PortfolioPage.jsx";
import SiteHeader from "./components/SiteHeader.jsx";
import BasisLine from "./components/screening/BasisLine.jsx";
import ScreeningDetail from "./components/screening/ScreeningDetail.jsx";
import CriterionPage from "./components/screening/CriterionPage.jsx";
import { STATUS_ORDER, STATUS_TEXT, reasonLine } from "./components/screening/format.js";

/* ============================================================
   TAZKIYAH — Basis-Prototyp
   Enthält: Startseite + Aktien-Detailseite in einer Datei,
   per einfachem State-Switch navigierbar (als Grundlage gedacht,
   nicht als fertiges Routing).
   ============================================================ */

/* ---------- Daten ---------- */

// Stammdaten (Sektor, Platzhalter-Kurse, Demo-Termine) aus src/data/stocks.js.
// Der Screening-Status kommt ausschließlich aus Supabase (useScreeningList).
const sampleStocks = ALL_STOCKS;

// Portfolio-Beispiel: 4 real vorhandene Titel mit angenommenen Gewichtungen
// (die Gewichtung selbst ist weiterhin frei erfunden — echte Portfolios kommen
// erst mit Nutzerkonten/Depot-Anbindung).
const holdings = [
  { ticker: "MSFT", weight: 38 },
  { ticker: "NVDA", weight: 27 },
  { ticker: "GOOGL", weight: 20 },
  { ticker: "JPM", weight: 15 },
];

const SECTORS = [...new Set(sampleStocks.map((s) => s.sector))].sort();

/* ---------- Aktien-Detailseite ---------- */

const EVENT_TYPE_STYLE = {
  Earnings: { dot: "bg-[var(--primary)]", text: "text-[var(--primary)]", bg: "bg-[var(--tile)]", border: "border-[var(--primary)]/40" },
  Dividende: { dot: "bg-[var(--emerald-soft)]", text: "text-[var(--emerald-soft)]", bg: "bg-[var(--emerald)]/15", border: "border-[var(--emerald)]/40" },
  HV: { dot: "bg-[var(--amber-soft)]", text: "text-[var(--amber-soft)]", bg: "bg-[var(--amber)]/15", border: "border-[var(--amber)]/40" },
};

function formatEventDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(iso) {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function StockDetailPage({ onBack, ticker, watchlist, onToggleWatchlist }) {
  return <ScreeningDetail ticker={ticker} onBack={onBack} watchlist={watchlist} onToggleWatchlist={onToggleWatchlist} />;
}

/* ---------- Watchlist-Seite ---------- */

function WatchlistPage({ watchlist, onBack, onToggleWatchlist }) {
  const list = useScreeningList();
  // Titel ohne Eintrag in der Prüfliste trotzdem zeigen („nicht geprüft“)
  const items = watchlist.map(
    (t) =>
      list.byTicker.get(t) || {
        ticker: t,
        name: sampleStocks.find((s) => s.ticker === t)?.name || t,
        assetType: "stock",
        hasResult: false,
        status: "nicht_geprueft",
      }
  );
  const attention = items.filter((s) => s.status !== "konform");
  return (
    <div className="font-body text-left">
      <header className="flex page items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <button type="button" onClick={onBack} className="-my-3 inline-flex min-h-[44px] items-center hover:text-[var(--text)]">Tazkiyah</button>
        <span>/</span>
        <span className="text-[var(--text)]">Watchlist</span>
      </header>
      <main className="page pb-24">
        <h1 className="font-display text-2xl text-[var(--text)]">Deine Watchlist</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {items.length === 0
            ? "Noch keine Aktien gemerkt."
            : "Statuswechsel (z. B. konform → nicht konform) erscheinen hier zuerst."}
        </p>

        {!list.loading && attention.length > 0 && (
          <p className="mt-4 rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-soft)]">
            {attention.length} {attention.length === 1 ? "Titel ist" : "Titel sind"} nicht konform oder noch nicht geprüft.
          </p>
        )}

        <div className="mt-6 grid gap-3">
          {items.map((r) => (
            <ScreeningRow
              key={r.ticker}
              row={r}
              actions={
                <button type="button" onClick={() => onToggleWatchlist(r.ticker)} className="inline-flex min-h-[44px] items-center px-2 text-[var(--red-soft)] hover:underline">
                  Entfernen
                </button>
              }
            />
          ))}
        </div>
      </main>
    </div>
  );
}

/* ---------- Kalenderübersicht ---------- */

function addDaysISO(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// Bestimmt das Datums-Fenster für den Strip je nach Schnellumschalter
function computeDayStripRange(timeframe) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];
  if (timeframe === "week") {
    for (let i = 0; i < 7; i++) days.push(addDaysISO(today, i));
  } else if (timeframe === "nextweek") {
    for (let i = 7; i < 14; i++) days.push(addDaysISO(today, i));
  } else {
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const diff = Math.max(0, Math.round((endOfMonth - today) / 86400000));
    for (let i = 0; i <= diff; i++) days.push(addDaysISO(today, i));
  }
  return days;
}

// "Heute" / "Morgen" / "Donnerstag, 17. Sep" — je nach Abstand zu heute
function dateGroupLabel(iso, isPast) {
  const days = daysUntil(iso);
  if (days === 0) return "Heute";
  if (!isPast && days === 1) return "Morgen";
  if (isPast && days === -1) return "Gestern";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "short" });
}

// Deterministisches Demo-Timing für Earnings (BMO/AMC — Branchenkonvention).
// Bei HV/Dividende gibt es keine sinnvolle Uhrzeit, daher nur für Earnings.
function demoEventTiming(ticker, date) {
  const h = ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + date.length;
  return h % 2 === 0 ? "Vor Börsenöffnung" : "Nach Handelsschluss";
}

function DayTile({ dateISO, count, isToday, isSelected, onClick }) {
  const d = new Date(dateISO + "T00:00:00");
  const weekday = d.toLocaleDateString("de-DE", { weekday: "short" });
  return (
    <button
      onClick={onClick}
      className={
        "flex min-w-[48px] flex-shrink-0 flex-col items-center gap-1 rounded-xl border px-3.5 py-2.5 transition-colors " +
        (isSelected
          ? "border-[var(--gold)] bg-[var(--gold)]/15"
          : isToday
          ? "border-[var(--gold)]/50 bg-[var(--surface)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--muted)]")
      }
    >
      <span className={"text-sm font-medium " + (isSelected ? "text-[var(--gold-soft)]" : "text-[var(--faint)]")}>
        {weekday}
      </span>
      <span className={"font-[IBM_Plex_Mono] text-sm " + (isSelected ? "text-[var(--gold-soft)]" : "text-[var(--text)]")}>
        {d.getDate()}
      </span>
      <span className="flex h-4 items-center">
        {count > 0 && (
          <span className={"rounded-full px-1.5 text-[13px] leading-none " + (isSelected ? "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--on-primary)]" : "bg-[var(--border)] text-[var(--faint)]")}>
            {count}
          </span>
        )}
      </span>
    </button>
  );
}

function EventCard({ e, showRelevance, onOpenStock }) {
  const style = EVENT_TYPE_STYLE[e.type] || EVENT_TYPE_STYLE.Dividende;

  function handleExportSingle(ev) {
    ev.stopPropagation();
    const ics = generateICS([e], `${e.ticker} · ${e.label}`);
    downloadICS(`tazkiyah-${e.ticker}-${e.date}`, ics);
  }

  return (
    <div
      onClick={() => onOpenStock(e.ticker)}
      className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--bg-deep)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex-shrink-0 rounded-lg bg-[var(--bg-deep)] px-2 py-1 font-[IBM_Plex_Mono] text-sm text-[var(--text)]">
          {e.ticker}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--text)]">{e.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={"rounded-full border px-2 py-0.5 text-sm " + style.bg + " " + style.border + " " + style.text}>
              {e.type === "HV" ? "Hauptversammlung" : e.type}
            </span>
            {e.type === "Earnings" && (
              <span className="text-sm text-[var(--faint)]">{demoEventTiming(e.ticker, e.date)}</span>
            )}
            {showRelevance && e.inWatchlist && (
              <span className="rounded-full border border-[var(--gold)]/40 px-2 py-0.5 text-sm text-[var(--gold-soft)]">★ Watchlist</span>
            )}
            {showRelevance && e.inPortfolio && (
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-sm text-[var(--muted)]">Portfolio</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="font-[IBM_Plex_Mono] text-sm text-[var(--faint)]">{formatEventDate(e.date)}</span>
        <button
          onClick={handleExportSingle}
          title="Als .ics herunterladen (Apple/Google Kalender)"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[var(--faint)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          aria-label="Termin exportieren"
        >
          ⤓
        </button>
      </div>
    </div>
  );
}

function CalendarPage({ watchlist, onBack, onOpenStock }) {
  const [scope, setScope] = useState(watchlist.length > 0 ? "watchlist" : "alle");
  const [timeframe, setTimeframe] = useState("week"); // week | nextweek | month
  const [selectedDay, setSelectedDay] = useState(null);
  const [showPast, setShowPast] = useState(false);

  const portfolioTickers = holdings.map((h) => h.ticker);

  let tickers;
  if (scope === "watchlist") tickers = watchlist;
  else if (scope === "portfolio") tickers = portfolioTickers;
  else tickers = sampleStocks.map((s) => s.ticker);

  const stocksInScope = sampleStocks.filter((s) => tickers.includes(s.ticker));

  const allEvents = stocksInScope.flatMap((s) =>
    (s.events?.timeline || []).map((e) => ({
      ...e,
      ticker: s.ticker,
      name: s.name,
      inWatchlist: watchlist.includes(s.ticker),
      inPortfolio: portfolioTickers.includes(s.ticker),
    }))
  );

  const today = todayISO();
  const upcoming = allEvents.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = allEvents.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date));

  const dayStripDates = computeDayStripRange(timeframe);
  const rangeSet = new Set(dayStripDates);
  const countsByDay = dayStripDates.reduce((acc, d) => {
    acc[d] = upcoming.filter((e) => e.date === d).length;
    return acc;
  }, {});

  const eventsToShow = showPast
    ? past
    : selectedDay
    ? upcoming.filter((e) => e.date === selectedDay)
    : upcoming.filter((e) => rangeSet.has(e.date));

  const grouped = eventsToShow.reduce((groups, e) => {
    (groups[e.date] = groups[e.date] || []).push(e);
    return groups;
  }, {});

  const SCOPE_OPTIONS = [
    { key: "watchlist", label: `Watchlist (${watchlist.length})` },
    { key: "portfolio", label: `Portfolio (${portfolioTickers.length})` },
    { key: "alle", label: `Alle Titel (${sampleStocks.length})` },
  ];
  const TIMEFRAME_OPTIONS = [
    { key: "week", label: "Diese Woche" },
    { key: "nextweek", label: "Nächste Woche" },
    { key: "month", label: "Monat" },
  ];

  return (
    <div className="font-body">
      <header className="flex page items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <button type="button" onClick={onBack} className="-my-3 inline-flex min-h-[44px] items-center hover:text-[var(--text)]">Tazkiyah</button>
        <span>/</span>
        <span className="text-[var(--text)]">Kalender</span>
      </header>
      <main className="page pb-24">
        <h1 className="font-display text-2xl text-[var(--text)]">Termin-Kalender</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Hauptversammlungen, Earnings-Calls und Dividendenstichtage — alle Termine sind Demo-Daten.
        </p>
        <p className="mt-2 text-sm text-[var(--faint)]">
          Für den Kalender-Export empfehlen wir, ausschließlich Titel aus der Watchlist oder dem
          Portfolio auszuwählen — bei „Alle Titel" ist die Anzahl der Einträge für einen
          persönlichen Kalender nicht praktikabel.
        </p>

        {/* Filterleiste (Watchlist/Portfolio/Alle) */}
        <div className="mt-6 flex flex-wrap gap-2">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { setScope(opt.key); setSelectedDay(null); }}
              className={
                "inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm " +
                (scope === opt.key
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Segmented Control: Anstehend / Vergangen + Export */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-[var(--border)] p-1">
            <button
              onClick={() => setShowPast(false)}
              className={"min-h-[44px] rounded-full px-4 text-sm " + (!showPast ? "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--on-primary)]" : "text-[var(--muted)] hover:text-[var(--text)]")}
            >
              Anstehend ({upcoming.length})
            </button>
            <button
              onClick={() => setShowPast(true)}
              className={"min-h-[44px] rounded-full px-4 text-sm " + (showPast ? "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--on-primary)]" : "text-[var(--muted)] hover:text-[var(--text)]")}
            >
              Vergangen ({past.length})
            </button>
          </div>

          {scope === "alle" ? (
            <p className="max-w-xs text-right text-sm text-[var(--faint)]">
              Export ist auf Watchlist und Portfolio beschränkt. Bereich oben wechseln, um zu exportieren.
            </p>
          ) : (
            <button
              onClick={() => {
                const ics = generateICS(upcoming, `Tazkiyah — ${SCOPE_OPTIONS.find((o) => o.key === scope).label}`);
                downloadICS(`tazkiyah-termine-${scope}-${today}`, ics);
              }}
              disabled={upcoming.length === 0}
              className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-[var(--border)] px-4 text-sm text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:text-[var(--muted)]"
            >
              ⤓ Alle anstehenden Termine exportieren (.ics)
            </button>
          )}
        </div>

        {!showPast && (
          <>
            {/* Schnellumschalter */}
            <div className="mt-5 flex gap-2">
              {TIMEFRAME_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setTimeframe(opt.key); setSelectedDay(null); }}
                  className={
                    "min-h-[44px] rounded-full px-3 text-sm " +
                    (timeframe === opt.key ? "bg-[var(--surface)] text-[var(--text)]" : "text-[var(--faint)] hover:text-[var(--muted)]")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Horizontaler Datums-Strip */}
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {dayStripDates.map((d) => (
                <DayTile
                  key={d}
                  dateISO={d}
                  count={countsByDay[d]}
                  isToday={d === today}
                  isSelected={selectedDay === d}
                  onClick={() => setSelectedDay(selectedDay === d ? null : d)}
                />
              ))}
            </div>
          </>
        )}

        {/* Timeline */}
        {eventsToShow.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center text-sm text-[var(--muted)]">
            {showPast
              ? "Keine vergangenen Termine in diesem Bereich."
              : scope === "watchlist" && watchlist.length === 0
              ? "Deine Watchlist ist leer — füge Titel hinzu, um hier ihre Termine zu sehen."
              : "Keine anstehenden Termine im gewählten Zeitraum."}
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => (showPast ? b.localeCompare(a) : a.localeCompare(b)))
              .map(([date, events]) => (
                <div key={date}>
                  <p className="mb-2.5 text-sm text-[var(--faint)] font-medium">
                    {dateGroupLabel(date, showPast)}
                  </p>
                  <div className="space-y-2">
                    {events.map((e, i) => (
                      <EventCard key={i} e={e} showRelevance={scope === "alle"} onOpenStock={onOpenStock} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- Berichte-Seite ---------- */

// DEMO-INHALTE: Diese vier Berichte sind von Hand geschrieben, um die
// Struktur/UI zu zeigen — noch KEINE echte automatische Generierung.
// Sobald das automatisiert läuft (siehe Roadmap: wöchentlicher Bericht),
// ersetzt eine echte Datenquelle (Supabase-Tabelle "weekly_reports") dieses
// Array. Die 6-Monats-Aufbewahrungslogik unten funktioniert schon jetzt
// unabhängig davon, ob die Daten hier oder aus einer echten Quelle kommen.
//
// Struktur je Bericht: tldr (Kurzfassung), makroPolitik (Fließtext),
// indices (3 Kapitalmarkt-Referenzwerte: DAX, MSCI World, Sharia-Welt-Proxy),
// aktienFokus (Fließtext), ausblick (Fließtext), sourceNote (Quellenzeile).
// Der "Was bedeutet grenzwertig?"-Erklärkasten ist bewusst NICHT Teil der
// einzelnen Berichte, sondern wird unten als feste, immer gleiche Box
// gerendert — er ist Bildungsinhalt, kein wöchentlich wechselnder Fakt.
const mockReports = [
  {
    date: "18. September 2026",
    isoDate: "2026-09-18",
    title: "Wochenbericht: 14.–18. September 2026",
    tldr: "Eine öffentliche Warnung aus der KI-Branche vor zu schnellem Entwicklungstempo löste einen spürbaren Ausverkauf bei Halbleiter- und KI-nahen Aktien aus. Mitten in diese Nervosität hinein hob die US-Notenbank Fed ihren Leitzins erstmals seit Juli 2023 wieder an — um 25 Basispunkte auf 3,75–4,00 %. Die Reaktion der Märkte fiel gemischt aus: erste Erleichterung, aber mit klaren Grenzen.",
    makroPolitik:
      "Auslöser der Woche war ein öffentlich gewordener Aufruf von Anthropic-Chef Dario Amodei, das Tempo der KI-Fähigkeitsentwicklung zu drosseln — eine Position, die auch andere prominente Stimmen aus der Branche aufgriffen. Die Folge: Der Philadelphia Semiconductor Index rutschte an einem einzelnen Handelstag um fast 6 % ab und bewegte sich auf Monatssicht in einen technischen Bärenmarkt. Mitten in diese Marktnervosität fiel am 16. September die mit Spannung erwartete Fed-Zinsentscheidung: Die US-Notenbank hob ihr Leitzinsband einstimmig um 25 Basispunkte auf 3,75–4,00 % an — die erste Zinserhöhung seit Juli 2023. Der aktualisierte \u201eDot Plot\u201c signalisierte zudem, dass ein Großteil der Notenbanker im weiteren Jahresverlauf mit mindestens einer weiteren Anhebung rechnet. Hintergrund der restriktiveren Haltung: Die US-Verbraucherpreise waren im August um 3,4 % gestiegen. Zusätzlich belasteten neue deutsche Erzeugerpreisdaten die Stimmung: Sie lagen im August um 4,6 % über Vorjahresniveau, vor allem getrieben von Energiepreisen.",
    indices: [
      { name: "DAX", value: "≈ 25.400", change: "≈ −2 % ggü. Vorwoche", direction: "down", note: "Näherungswert aus einer Kursmomentaufnahme, kein exakter Wochenschluss." },
      { name: "MSCI World", value: "≈ 4.987", change: "leicht negativ (18.09.)", direction: "down", note: "Stand einer Kursabfrage vom 18. September." },
      { name: "Sharia-Welt (Proxy)", value: "—", change: "überdurchschnittlich belastet", direction: "down", note: "iShares MSCI World Islamic ETF — Daten folgen mit Produktivanbindung." },
    ],
    aktienFokus:
      "Im Zentrum der Woche standen Nvidia, Broadcom und AMD: Nvidia gab an mehreren Handelstagen in Folge nach, unter anderem am Montag um rund 3 %. Analysten von Lynx Equities Strategies und Bernstein bewerteten den Ausverkauf als überzogen: Anzeichen für eine tatsächlich sinkende Hardware-Nachfrage in der Lieferkette seien nicht erkennbar. Goldman Sachs bestätigte seine Kaufempfehlung für Nvidia mit einem Kursziel von 300 US-Dollar.",
    ausblick:
      "Am 20. September stehen mit den Landtagswahlen in Berlin und Mecklenburg-Vorpommern zwei weitere politische Stimmungstests an. Zudem veröffentlicht das ifo-Institut am 24. September sein Geschäftsklima für September, und Moody's nimmt am 18. September ein Rating-Review für Deutschland und Griechenland vor.",
    sourceNote: "Quellen: finanznachrichten.de · sharedeals.de · LBBW Research · tradingkey.com · ms-aktuell · wallstreet-online · Yahoo Finance",
  },
  {
    date: "11. September 2026",
    isoDate: "2026-09-11",
    title: "Wochenbericht: 7.–11. September 2026",
    tldr: "Die Europäische Zentralbank hob ihren Einlagensatz um 25 Basispunkte auf 2,50 % an — Reaktion auf eine im August auf 3,3 % gestiegene Euroraum-Inflation. Am Ende der Woche bestätigten auch die US-Verbraucherpreise für August mit 3,4 % im Jahresvergleich anhaltenden Preisdruck.",
    makroPolitik:
      "Die EZB hob am 10. September ihren Einlagensatz um 25 Basispunkte auf 2,50 % an. Grund war der anhaltende Inflationsdruck im Euroraum: Die Verbraucherpreise waren im August laut Eurostat-Schnellschätzung auf 3,3 % gestiegen, nach 2,9 % im Juli — deutlich über dem EZB-Ziel von 2,0 %. Haupttreiber blieb die Energie, die im Jahresvergleich um mehr als 14 % teurer wurde. Nur einen Tag später, am 11. September, bestätigten die US-Verbraucherpreise für August mit einem Anstieg von 0,4 % gegenüber dem Vormonat und 3,4 % im Jahresvergleich das Bild hartnäckiger Inflation. Am Wochenanfang hatte zudem die Landtagswahl in Sachsen-Anhalt stattgefunden, die bundespolitisch als Stimmungstest beobachtet wurde. Gegen Ende der Woche mehrten sich erste kritische Stimmen aus der KI-Branche selbst zum Entwicklungstempo neuer Modelle — ein Thema, das die Märkte in der Folgewoche deutlich stärker beschäftigen sollte.",
    indices: [
      { name: "DAX", value: "—", change: "leicht belastet", direction: "flat", note: "Kein verlässlicher Wochenschlusswert für diesen Zeitraum verfügbar." },
      { name: "MSCI World", value: "—", change: "spürbar, moderat", direction: "flat", note: "Zinsentscheidungen sorgten für Bewegung ohne größere Ausschläge." },
      { name: "Sharia-Welt (Proxy)", value: "—", change: "n/a", direction: "flat", note: "iShares MSCI World Islamic ETF — Daten folgen mit Produktivanbindung." },
    ],
    aktienFokus:
      "Gegen Ende der Woche kündigte sich bereits eine Diskussion an, die in der Folgewoche zum bestimmenden Thema wurde: Aus der KI-Branche selbst kamen Stimmen, die vor einem zu hohen Entwicklungstempo warnten — mit spürbaren Folgen für Halbleiter- und KI-nahe Aktien ab der darauffolgenden Woche.",
    ausblick:
      "Die kommende Woche bringt mit der Fed-Zinsentscheidung am 16. September das geldpolitische Hauptereignis des Monats — begleitet von neuen Leitzinsprojektionen des FOMC.",
    sourceNote: "Quellen: Raisin (EZB-Zinsprognose) · ms-aktuell · LBBW Research",
  },
  {
    date: "04. September 2026",
    isoDate: "2026-09-04",
    title: "Wochenbericht: 31. Aug.–4. Sep. 2026",
    tldr: "Nach dem Rekordhoch der Vorwoche zeigte sich der DAX zum Monatswechsel konsolidierend. Der Monat August schloss für den deutschen Leitindex bei 26.258,11 Punkten. International richtete sich der Blick auf den US-Arbeitsmarktbericht zum Wochenschluss.",
    makroPolitik:
      "Der DAX beendete den Handelsmonat August 2026 bei 26.258,11 Punkten — ein Stand unterhalb des Allzeithochs vom 28. August, was auf gewisse Gewinnmitnahmen nach dem Rekordlauf hindeutet. Wirtschaftspolitisch stand die Woche im Zeichen der Vorbereitung auf zwei zentrale Termine: den US-Arbeitsmarktbericht für August (veröffentlicht am 4. September) sowie die bevorstehende EZB-Sitzung Mitte September. In Deutschland rückte zudem die Landtagswahl in Sachsen-Anhalt am 6. September in den Blick der politischen Berichterstattung, da sie als Stimmungstest vor der Bundespolitik galt.",
    indices: [
      { name: "DAX", value: "26.258,11", change: "Monatsschluss August", direction: "flat", note: "Konsolidierung nach dem Allzeithoch der Vorwoche." },
      { name: "MSCI World", value: "—", change: "seitwärts", direction: "flat", note: "Kein verlässlicher Wochenschlusswert für diesen Zeitraum verfügbar." },
      { name: "Sharia-Welt (Proxy)", value: "—", change: "n/a", direction: "flat", note: "iShares MSCI World Islamic ETF — Daten folgen mit Produktivanbindung." },
    ],
    aktienFokus:
      "Für diese Woche liegt keine belastbare Quellenlage zu einzelnen Kursbewegungen vor. Dieser Abschnitt wird in der Produktivversion automatisiert aus den Kursbewegungen der auf Tazkiyah gescreenten Titel gespeist.",
    ausblick:
      "Die kommende Woche bringt gleich mehrere Schwergewichte: die EZB-Zinsentscheidung am 10. September inklusive neuer Stabsprojektionen sowie die US-Inflationsdaten für August am 11. September.",
    sourceNote: "Quellen: Statista (DAX-Monatsentwicklung) · LBBW Research",
  },
  {
    date: "28. August 2026",
    isoDate: "2026-08-28",
    title: "Wochenbericht: 24.–28. August 2026",
    tldr: "Die Finanzmärkte richteten sich ganz auf das jährliche Notenbanker-Symposium in Jackson Hole aus, bei dem der neue Fed-Vorsitzende Kevin Warsh am Freitag seine Antrittsrede hielt. Der DAX nutzte die insgesamt eher vorsichtig-positive Aufnahme für einen Sprung auf ein neues Allzeithoch.",
    makroPolitik:
      "Im Zentrum der Woche stand das Jackson-Hole-Symposium der Federal Reserve Bank of Kansas City vom 27. bis 29. August, unter dem Titel \u201eFinancial Innovation: Implications for Payments and Policy\u201c. Besondere Aufmerksamkeit galt dem Freitag, da Kevin Warsh dort erstmals in seiner neuen Rolle als Fed-Vorsitzender auftrat — in einem Umfeld aus einer über dem Notenbankziel liegenden Inflation und einem sich abkühlenden Arbeitsmarkt. Vorab hatte der US-Kerninflationsindikator PCE für Juli mit 3,7 % im Jahresvergleich die Erwartungen leicht übertroffen, was die Erwartungen an Warshs Tonfall zusätzlich schärfte.",
    indices: [
      { name: "DAX", value: "26.569,99", change: "Allzeithoch (Schluss)", direction: "up", note: "Intraday sogar 26.618,74 Punkte — neuer Rekord am Freitag, 28.08." },
      { name: "MSCI World", value: "—", change: "freundlich", direction: "up", note: "Kein verlässlicher Wochenschlusswert für diesen Zeitraum verfügbar." },
      { name: "Sharia-Welt (Proxy)", value: "—", change: "technologiegetrieben", direction: "flat", note: "iShares MSCI World Islamic ETF — Daten folgen mit Produktivanbindung." },
    ],
    aktienFokus:
      "Für diese Woche liegt keine belastbare Quellenlage zu einzelnen Kursbewegungen vor, die über allgemeine Marktberichterstattung hinausgeht. Dieser Abschnitt wird in der Produktivversion automatisiert aus den Kursbewegungen der auf Tazkiyah gescreenten Titel gespeist.",
    ausblick:
      "Im Fokus steht der US-Arbeitsmarktbericht für August, der am 4. September veröffentlicht wird und wichtige Hinweise auf das weitere Tempo der US-Geldpolitik liefern dürfte.",
    sourceNote: "Quellen: Federal Reserve Bank of Kansas City · Wikipedia (DAX) · LBBW Research",
  },
];

const indexDirectionClasses = {
  up: "text-[var(--emerald-soft)]",
  down: "text-[var(--red-soft)]",
  flat: "text-[var(--amber-soft)]",
};

// Berichte bleiben 6 Monate abrufbar, danach werden sie hier ausgeblendet.
// Bei einer echten, automatisiert befüllten Datenquelle würde diese Filterung
// serverseitig (z.B. in der Datenbank-Abfrage) passieren, nicht im Frontend —
// hier reicht das für den aktuellen Demo-Stand.
const REPORT_RETENTION_DAYS = 182;

function ReportsPage({ onBack }) {
  const [selectedReport, setSelectedReport] = useState(null);
  const [liveReports, setLiveReports] = useState(null); // null = noch am Laden
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    supabase
      .from("weekly_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) {
          // Noch kein automatisch generierter Bericht vorhanden (z.B. weil
          // der Cron-Job noch nicht gelaufen ist) -> Demo-Inhalte zeigen,
          // klar gekennzeichnet, statt einer leeren Seite.
          setLiveReports(mockReports);
          setUsingFallback(true);
          return;
        }
        setLiveReports(
          data.map((r) => ({
            title: r.week_label,
            date: new Date(r.report_date).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }),
            isoDate: r.report_date,
            tldr: r.tldr,
            makroPolitik: r.makro_politik,
            indices: r.indices || [],
            aktienFokus: r.aktien_fokus,
            ausblick: r.ausblick,
            sourceNote: r.source_note,
          }))
        );
        setUsingFallback(false);
      });
  }, []);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - REPORT_RETENTION_DAYS);
  const visibleReports = (liveReports || []).filter((r) => new Date(r.isoDate) >= cutoff);

  if (selectedReport) {
    const r = selectedReport;
    return (
      <div className="font-body">
        <header className="flex page items-center gap-3 py-6 text-sm text-[var(--muted)]">
          <button type="button" onClick={onBack} className="-my-3 inline-flex min-h-[44px] items-center hover:text-[var(--text)]">Tazkiyah</button>
          <span>/</span>
          <button type="button" onClick={() => setSelectedReport(null)} className="-my-3 inline-flex min-h-[44px] items-center hover:text-[var(--text)]">Berichte</button>
          <span>/</span>
          <span className="text-[var(--text)]">{r.title}</span>
        </header>
        <main className="page pb-24">
          <button
            onClick={() => setSelectedReport(null)}
            className="mb-4 text-sm text-[var(--faint)] hover:text-[var(--primary)]"
          >
            ← Alle Berichte
          </button>
          <h1 className="font-display text-2xl text-[var(--text)]">{r.title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{r.date} · Automatisch erstellt</p>

          <section className="mt-8 rounded-2xl border-l-[3px] border-[var(--gold)] bg-[var(--surface)] px-5 py-4">
            <p className="mb-2 font-display text-sm text-[var(--gold-soft)]">Das Wichtigste in Kürze</p>
            <p className="text-sm leading-relaxed text-[var(--text-soft)]">{r.tldr}</p>
          </section>

          <section className="mt-8">
            <h2 className="font-display border-b border-[var(--border)] pb-2.5 text-lg text-[var(--text)]">
              Makro &amp; Politik der Woche
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-soft)]">{r.makroPolitik}</p>
          </section>

          <section className="mt-8">
            <h2 className="font-display border-b border-[var(--border)] pb-2.5 text-lg text-[var(--text)]">
              Index-Entwicklung
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {r.indices.map((idx) => (
                <div key={idx.name} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                  <p className="text-sm text-[var(--muted)]">{idx.name}</p>
                  <p className="mt-2 font-[IBM_Plex_Mono] text-lg text-[var(--text)]">{idx.value}</p>
                  <p className={"mt-1 font-[IBM_Plex_Mono] text-sm " + indexDirectionClasses[idx.direction]}>
                    {idx.change}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--faint)]">{idx.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="font-display border-b border-[var(--border)] pb-2.5 text-lg text-[var(--text)]">
              Aktien &amp; ETFs im Fokus
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-soft)]">{r.aktienFokus}</p>
          </section>

          <section className="mt-8 rounded-2xl border border-[var(--amber)]/40 bg-[var(--amber)]/10 px-5 py-4">
            <p className="mb-2 font-display text-sm text-[var(--amber-soft)]">Kurz erklärt: Was bedeutet „grenzwertig"?</p>
            <p className="text-sm leading-relaxed text-[var(--text-soft)]">
              Ein Titel gilt bei Tazkiyah als grenzwertig, wenn er die grundsätzliche Geschäftstätigkeits-Prüfung besteht,
              aber bei einer Finanzkennzahl — etwa Verschuldung oder Cash-Quote — nahe an der 30-%-Schwelle liegt.
              Sobald das automatische Warnsystem für Statusänderungen live ist, werden solche Fälle hier künftig konkret benannt.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="font-display border-b border-[var(--border)] pb-2.5 text-lg text-[var(--text)]">
              Ausblick auf die kommende Woche
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-soft)]">{r.ausblick}</p>
          </section>

          <p className="mt-8 text-sm text-[var(--faint)]">
            {r.sourceNote || "Demo-Inhalt zu Illustrationszwecken"} · Keine Anlageberatung · Berichte bleiben 6 Monate abrufbar.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="font-body">
      <header className="flex page items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <button type="button" onClick={onBack} className="-my-3 inline-flex min-h-[44px] items-center hover:text-[var(--text)]">Tazkiyah</button>
        <span>/</span>
        <span className="text-[var(--text)]">Berichte</span>
      </header>
      <main className="page pb-24">
        <h1 className="font-display text-2xl text-[var(--text)]">Wöchentliche Berichte</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Automatisch erstellt, jeden Montag aktualisiert · Berichte bleiben 6 Monate abrufbar.
        </p>
        {usingFallback && (
          <p className="mt-2 text-sm text-[var(--faint)]">
            Noch kein automatisch generierter Bericht vorhanden — die folgenden Berichte sind Demo-Inhalte.
          </p>
        )}
        {liveReports === null ? (
          <p className="mt-8 text-sm text-[var(--muted)]">Lade Berichte …</p>
        ) : (
          <div className="mt-6 grid gap-3">
            {visibleReports.map((r) => (
              <button
                key={r.title}
                onClick={() => setSelectedReport(r)}
                className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--bg-deep)]"
              >
                <div className="pr-6">
                  <p className="text-sm text-[var(--text)]">{r.title}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-[var(--muted)]">{r.tldr}</p>
                </div>
                <span className="shrink-0 text-sm text-[var(--faint)]">Lesen →</span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- Akademie (Einstieg, Broker-Vergleich, Glossar, Methodik) ---------- */

const topFragen = [
  {
    q: "Sind alle Technologie-Aktien automatisch konform?",
    a: "Nein. Auch bei Tech-Unternehmen wird jede Aktie einzeln geprüft, unabhängig von der Branche. Neben der Tätigkeit zählen Kennzahlen wie die zinstragenden Schulden und das zinstragende Geld im Verhältnis zur Marktkapitalisierung. Ein Unternehmen mit unproblematischer Branche kann daran scheitern, zum Beispiel weil es stark fremdfinanziert ist.",
  },
  {
    q: "Warum sind ETFs schwieriger zu screenen als Einzelaktien?",
    a: "Ein ETF hält oft hunderte Einzeltitel, deren Zusammensetzung sich laufend ändert. Für eine saubere Prüfung müsste theoretisch jede enthaltene Position einzeln gescreent werden. Speziell dafür gibt es sogenannte Islamic ETFs, bei denen das Screening bereits im Fondsmanagement eingebaut ist.",
  },
  {
    q: "Was passiert, wenn eine bisher konforme Aktie plötzlich nicht mehr konform ist?",
    a: "Unternehmen verändern sich — neue Schulden, ein neues Geschäftsfeld, eine Übernahme. Screening ist deshalb kein einmaliger Check, sondern sollte regelmäßig wiederholt werden. Die Watchlist-Funktion ist genau dafür gedacht: Statusänderungen sichtbar zu machen, statt sie zu verpassen.",
  },
  {
    q: "Muss ich bei jeder Dividende Zakat UND Purification zahlen?",
    a: "Das sind zwei getrennte Verpflichtungen. Purification bereinigt den unzulässigen Anteil einer ansonsten erlaubten Dividende (meist unter 5%). Zakat ist die jährliche Pflichtabgabe auf das Gesamtvermögen oberhalb eines Schwellenwerts (Nisab) — unabhängig davon, ob bereits purifiziert wurde.",
  },
  {
    q: "Sind Wachstumsaktien ohne Dividende automatisch unproblematischer?",
    a: "Nicht zwangsläufig. Die Screening-Kriterien (Branche, Verschuldung, Zinserträge) gelten unabhängig davon, ob überhaupt eine Dividende gezahlt wird. Eine dividendenlose Aktie kann trotzdem hoch verschuldet oder in einer ausgeschlossenen Branche tätig sein.",
  },
  {
    q: "Können klassische Anleihen (Bonds) halal sein?",
    a: "Klassische, zinstragende Anleihen gelten als Riba-basiert und damit nicht konform. Die islamkonforme Alternative sind Sukuk — strukturiert über tatsächliche Vermögenswerte oder Beteiligungen statt über einen garantierten Zins.",
  },
  {
    q: "Sind Kryptowährungen halal?",
    a: "Hier gibt es unter Gelehrten keine einheitliche Position: Manche sehen Kryptowährungen grundsätzlich als zulässiges digitales Vermögen, andere äußern Bedenken wegen hoher Unsicherheit (Gharar) oder rein spekulativer Nutzung. Tazkiyah screent aktuell bewusst keine Kryptowerte — auch weil die Meinungen hier deutlich weiter auseinandergehen als bei Aktien.",
  },
  {
    q: "Warum schließen manche Screening-Standards mehr Branchen aus als andere?",
    a: "Es gibt nicht den einen globalen Standard — AAOIFI, der Dow Jones Islamic Market Index und andere Gremien setzen leicht unterschiedliche Grenzwerte und Ausschlusslisten. Tazkiyah orientiert sich an AAOIFI und macht die Kriterien transparent, damit du sie selbst nachvollziehen kannst.",
  },
  {
    q: "Ist Leerverkauf (Short Selling) mit islamischen Prinzipien vereinbar?",
    a: "Klassischer Leerverkauf gilt bei den meisten Gelehrten als problematisch, da ein Vermögenswert verkauft wird, den man (noch) nicht besitzt — das berührt Prinzipien wie Gharar. Es gibt strukturell anders aufgebaute Alternativen, die diskutiert werden, klassisches Short Selling gilt aber überwiegend als nicht zulässig.",
  },
];

const glossarAZ = [
  { term: "AAOIFI", def: "Accounting and Auditing Organization for Islamic Financial Institutions — das Gremium, dessen Standards Tazkiyah für das Screening zugrunde legt." },
  { term: "Aktie", def: "Ein Anteilsschein an einem Unternehmen. Hält man eine Aktie, ist man Miteigentümer und partizipiert an Gewinn und Verlust." },
  { term: "Anleihe (Bond)", def: "Ein festverzinsliches Wertpapier — der Anleger leiht dem Emittenten Geld gegen einen garantierten Zins. Klassische Anleihen gelten als Riba-basiert und damit nicht konform." },
  { term: "Benchmark", def: "Eine Vergleichsgröße, meist ein Index, an der die Wertentwicklung einer Anlage oder eines Portfolios gemessen wird." },
  { term: "Bilanzsumme", def: "Die Summe aller Vermögenswerte eines Unternehmens laut Bilanz — Ausgangspunkt für viele Kennzahlen, u. a. die Verschuldungsquote." },
  { term: "Blue Chip", def: "Eine große, etablierte, häufig gehandelte Aktie mit langer Historie — gilt meist als vergleichsweise stabil, ist aber nicht automatisch Sharia-konform." },
  { term: "Cashflow (Free Cash Flow)", def: "Der Betrag, der einem Unternehmen nach Investitionen tatsächlich an liquiden Mitteln verbleibt — ein Indikator für finanzielle Substanz unabhängig vom bilanziellen Gewinn." },
  { term: "DJIM (Dow Jones Islamic Market Index)", def: "Einer der bekanntesten globalen Islamic-Investing-Indizes, mit eigenen Screening-Kriterien, die sich in Details von AAOIFI unterscheiden können." },
  { term: "Diversifikation", def: "Die Streuung von Investitionen über mehrere Werte, Branchen oder Regionen, um das Risiko einzelner Positionen abzufedern." },
  { term: "Dividende", def: "Ein Teil des Unternehmensgewinns, der an die Aktionäre ausgeschüttet wird. Kann einen kleinen, unzulässigen Anteil enthalten — siehe Purification." },
  { term: "Dividendenrendite", def: "Die jährliche Dividende im Verhältnis zum aktuellen Aktienkurs, meist in Prozent angegeben." },
  { term: "EPS (Gewinn je Aktie)", def: "Earnings per Share — der Unternehmensgewinn geteilt durch die Anzahl ausstehender Aktien." },
  { term: "ETF", def: "Ein Fonds, der einen Index oder Korb von Wertpapieren nachbildet und wie eine Aktie an der Börse gehandelt wird." },
  { term: "Ex-Dividende-Tag", def: "Der Stichtag, ab dem eine Aktie ohne Anspruch auf die nächste Dividendenzahlung gehandelt wird." },
  { term: "Fiqh al-Muamalat", def: "Der Teilbereich des islamischen Rechts, der wirtschaftliche und finanzielle Transaktionen regelt — die rechtliche Grundlage hinter den Sharia-Screening-Kriterien." },
  { term: "Fiskaljahr", def: "Der Zwölf-Monats-Zeitraum, den ein Unternehmen für seine Finanzberichterstattung nutzt — muss nicht mit dem Kalenderjahr übereinstimmen." },
  { term: "Fractional Shares (Teilaktien)", def: "Bruchteile einer Aktie — ermöglichen es, auch mit kleinem Budget in teure Einzeltitel zu investieren." },
  { term: "Free Float", def: "Der Anteil der Aktien eines Unternehmens, der frei an der Börse gehandelt wird, ohne fest gebundene Großaktionäre." },
  { term: "Gharar", def: "Übermäßige Unsicherheit oder Mehrdeutigkeit in einem Geschäft. Gilt neben Riba als zentrales Ausschlussprinzip im islamischen Finanzwesen." },
  { term: "Growth Stock (Wachstumsaktie)", def: "Eine Aktie, deren Wert vor allem auf erwartetem zukünftigem Wachstum beruht, oft mit wenig oder keiner Dividende." },
  { term: "Halal", def: "Wörtlich „erlaubt“. Im Anlagekontext der Begriff für Anlagen, die nach islamischen Grundsätzen zulässig sind. Tazkiyah vergibt ihn nicht als Bewertung, sondern zeigt, ob eine Aktie die Prüfungen nach den AAOIFI-Standards besteht (konform, nicht konform, nicht geprüft). Ob eine Anlage für dich zulässig ist, entscheidest du, gegebenenfalls mit Rat eines Gelehrten." },
  { term: "Haram", def: "Wörtlich 'verboten'. Das Gegenstück zu Halal — bezeichnet Geschäftsfelder oder Praktiken, die nach islamischen Grundsätzen unzulässig sind." },
  { term: "IPO (Börsengang)", def: "Initial Public Offering — der erste Verkauf von Unternehmensanteilen an die Öffentlichkeit über die Börse." },
  { term: "ISIN", def: "International Securities Identification Number — eine weltweit eindeutige Kennung für ein Wertpapier, unabhängig vom Börsenplatz." },
  { term: "Ijara", def: "Eine islamische Leasing-Struktur: Der Eigentümer vermietet einen Vermögenswert gegen feste Zahlungen, statt einen verzinsten Kredit zu vergeben." },
  { term: "KGV (P/E-Ratio)", def: "Kurs-Gewinn-Verhältnis — der Aktienkurs geteilt durch den Gewinn je Aktie. Ein gängiges, aber grobes Bewertungsmaß." },
  { term: "Klumpenrisiko", def: "Die Gefahr, dass ein Portfolio zu stark auf wenige Werte, Branchen oder Regionen konzentriert ist und dadurch überdurchschnittlich schwankt." },
  { term: "Konform", def: "Alle Prüfungen nach den AAOIFI-Standards (SS 21, 27 und 35), die Tazkiyah durchführt, sind bestanden. Das ist keine Anlageempfehlung und kein Rechtsgutachten (Fatwa)." },
  { term: "Liquidität", def: "Wie leicht sich ein Vermögenswert kurzfristig in Bargeld umwandeln lässt, ohne größere Wertverluste." },
  { term: "Marktkapitalisierung", def: "Der Gesamtwert aller ausstehenden Aktien eines Unternehmens (Aktienkurs × Anzahl Aktien). Dient als Bezugsgröße für Verschuldungs- und Cash-Quote im Screening." },
  { term: "Maysir", def: "Glücksspiel bzw. Spekulation ohne wirtschaftliche Substanz — neben Riba und Gharar ein weiteres zentrales Ausschlussprinzip im islamischen Finanzwesen." },
  { term: "Mudarabah", def: "Ein islamisches Gewinnbeteiligungsmodell: Ein Kapitalgeber stellt Geld, ein Unternehmer die Arbeit — Gewinne werden nach vereinbartem Schlüssel geteilt, Verluste trägt primär der Kapitalgeber." },
  { term: "Murabaha", def: "Ein Kostenaufschlag-Verkauf: Der Verkäufer nennt offen Einkaufspreis und Marge, statt Zinsen zu berechnen — eine gängige Struktur im islamischen Handelsfinanzwesen." },
  { term: "Musharakah", def: "Eine Partnerschaft, bei der mehrere Parteien gemeinsam Kapital einbringen und Gewinn wie Verlust anteilig tragen — Grundlage vieler islamischer Beteiligungsmodelle." },
  { term: "Nicht geprüft", def: "Keine Prüfung ist durchgefallen, aber mindestens eine steht noch aus oder ließ sich mit den vorhandenen Daten nicht abschließen. Auf der Detailseite steht, was fehlt." },
  { term: "Nicht konform", def: "Mindestens eine Prüfung ist nicht bestanden, zum Beispiel weil die zinstragenden Schulden über dem Grenzwert liegen. Auf der Detailseite steht, welche." },
  { term: "Nisab", def: "Der Vermögens-Schwellenwert, ab dem Zakat fällig wird. Liegt das Gesamtvermögen darunter, entfällt die Zakat-Pflicht für den Zeitraum." },
  { term: "Portfolio", def: "Die Gesamtheit der Anlagen einer Person, bei Tazkiyah mit dem Status je Position." },
  { term: "Purification (Dividenden-Reinigung)", def: "Das Abtrennen des unzulässigen Ertragsanteils (meist Zinserträge) einer ansonsten erlaubten Dividende — traditionell durch Spende dieses Anteils." },
  { term: "Qard Hasan", def: "Ein zinsloses, wohltätiges Darlehen im islamischen Finanzwesen — der Kreditgeber erwartet ausschließlich die Rückzahlung des Nennbetrags." },
  { term: "Rebalancing", def: "Das planmäßige Zurücksetzen eines Portfolios auf eine Ziel-Gewichtung, nachdem sich die Kurse einzelner Positionen unterschiedlich entwickelt haben." },
  { term: "Riba", def: "Zins — im islamischen Finanzwesen grundsätzlich verboten, da ein garantierter Gewinn ohne unternehmerisches Risiko als ausbeuterisch gilt. Zentrales Ausschlusskriterium beim Screening." },
  { term: "Sharia-Screening", def: "Die zweistufige Prüfung einer Aktie: zuerst das Geschäftsmodell (Branche), danach die Finanzkennzahlen (u. a. Verschuldung, Cash-Quote) gegen definierte Grenzwerte." },
  { term: "Short Selling (Leerverkauf)", def: "Der Verkauf eines geliehenen Wertpapiers in der Erwartung fallender Kurse. Gilt wegen des Verkaufs nicht besessener Vermögenswerte bei den meisten Gelehrten als problematisch." },
  { term: "Sparplan", def: "Eine regelmäßige, meist monatliche Investition eines festen Betrags — unabhängig vom aktuellen Kurs." },
  { term: "Sukuk", def: "Die islamkonforme Alternative zur klassischen Anleihe — strukturiert über reale Vermögenswerte oder Beteiligungen statt über einen garantierten Zins." },
  { term: "TER (Total Expense Ratio)", def: "Die jährliche Gesamtkostenquote eines Fonds oder ETFs, angegeben in Prozent des verwalteten Vermögens." },
  { term: "Takaful", def: "Islamische Versicherung auf Basis gegenseitiger Beistandsleistung — als Alternative zu klassischen, zinsbasierten Versicherungsmodellen." },
  { term: "Value Stock (Substanzaktie)", def: "Eine Aktie, die im Verhältnis zu ihren fundamentalen Kennzahlen (z. B. KGV) als unterbewertet gilt." },
  { term: "Verschuldungsquote", def: "Das Verhältnis von Schulden zur Marktkapitalisierung. Bei Tazkiyah/AAOIFI-Orientierung gilt eine Aktie ab 30% in der Regel als nicht mehr konform." },
  { term: "Volatilität", def: "Ein Maß für die Schwankungsbreite eines Kurses über einen bestimmten Zeitraum — höhere Volatilität bedeutet größere Kursausschläge in beide Richtungen." },
  { term: "WKN", def: "Wertpapierkennnummer — eine in Deutschland gebräuchliche, sechsstellige Kennung für ein Wertpapier, neben der international gültigen ISIN." },
  { term: "Waqf", def: "Eine islamische Stiftung — Vermögen wird dauerhaft für einen wohltätigen oder gemeinnützigen Zweck gebunden." },
  { term: "Zakat", def: "Die jährliche Pflichtabgabe auf bestimmtes Vermögen oberhalb des Nisab. Unabhängig von der Dividenden-Purification und meist einmal jährlich auf das Gesamtvermögen berechnet." },
];

const einstiegsSteps = [
  { title: "1. Grundbegriffe verstehen", text: "Aktie, ETF, Dividende, Sparplan — bevor es um Halal-Kriterien geht, hilft ein Blick ins Glossar weiter unten. Niemand muss alles auf einmal verstehen." },
  { title: "2. Broker auswählen", text: "Ein Depot ist Voraussetzung fürs Investieren. Tazkiyah empfiehlt keinen bestimmten Anbieter — der Vergleich unten zeigt nur Kriterien, keine Wertung. Achte besonders auf schariakonforme Kontoführung, falls dir das wichtig ist." },
  { title: "3. Screening verstehen", text: "Bevor du eine Aktie kaufst, prüf ihren Status im Screener und lies die Begründung auf der Detailseite. Bei „Nicht geprüft“ steht dort, welche Prüfung noch aussteht. Zu jeder Regel führt die Quellenangabe auf eine eigene Erklärseite." },
  { title: "4. Klein anfangen", text: "Ein Sparplan mit kleinen, regelmäßigen Beträgen ist oft sinnvoller als eine einzelne große Investition — gerade am Anfang, wenn Marktschwankungen noch ungewohnt sind." },
  { title: "5. Portfolio im Blick behalten", text: "Nutze die Watchlist, um deine Titel im Blick zu behalten, und prüfe ihren Status regelmäßig. Unternehmen können sich verändern, deshalb wird der Status mit neuen Quartals- und Jahresabschlüssen neu berechnet." },
  { title: "6. Dividenden bereinigen", text: "Sobald du Dividenden erhältst, hilf dir der Reinheits-Rechner dabei, den Spendenanteil zu schätzen — ein fester Bestandteil vieler Muslim-Investment-Routinen." },
];

const brokerCompare = [
  { name: "Broker A", sparplan: true, teilaktien: true, shariaKonto: false, kosten: "niedrig" },
  { name: "Broker B", sparplan: true, teilaktien: false, shariaKonto: true, kosten: "mittel" },
  { name: "Broker C", sparplan: false, teilaktien: true, shariaKonto: false, kosten: "niedrig" },
];

const literaturItems = [
  { title: "The Art of Islamic Banking and Finance", author: "Yahia Abdul-Rahman", note: "Praxisnaher Einstieg in die Prinzipien hinter zinsfreiem Wirtschaften." },
  { title: "Islamic Finance: Principles and Practice", author: "Hans Visser", note: "Akademischer, aber verständlicher Überblick über Instrumente und Regelwerke wie AAOIFI." },
  { title: "Understanding Islamic Finance", author: "Muhammad Ayub", note: "Umfangreiches Nachschlagewerk, eher für alle, die tiefer einsteigen wollen." },
];

const vertiefenItems = [
  {
    title: "Islamischer Kontext",
    text: "Riba (Zins) gilt als ausbeuterisch, weil er einen garantierten Gewinn ohne unternehmerisches Risiko verspricht. Gharar (übermäßige Unsicherheit) betrifft Geschäfte mit unklaren Bedingungen — beides zusammen erklärt, warum klassische Banken, Versicherer und stark verschuldete Firmen ausgeschlossen werden, nicht nur einzelne Kennzahl-Grenzwerte.",
  },
  {
    title: "Risiken & Chancen",
    text: "Konforme Aktien sind nicht automatisch risikoärmer: Die Ausschlusskriterien führen oft zu einer Konzentration auf bestimmte Sektoren (z. B. Technologie, Gesundheit), was Klumpenrisiken erzeugen kann. Gleichzeitig kann der niedrigere Verschuldungsgrad vieler konformer Unternehmen in Krisenzeiten für mehr finanzielle Stabilität sorgen. Beides gehört zur ehrlichen Einordnung.",
  },
];

const AKADEMIE_TABS = ["Einstieg", "Broker-Vergleich", "Glossar", "Methodik", "Vertiefen"];


function AkademiePage({ onBack }) {
  const [tab, setTab] = useState("Einstieg");
  const [open, setOpen] = useState(0);

  return (
    <div className="font-body">
      <header className="flex page items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <button type="button" onClick={onBack} className="-my-3 inline-flex min-h-[44px] items-center hover:text-[var(--text)]">Tazkiyah</button>
        <span>/</span>
        <span className="text-[var(--text)]">Akademie</span>
      </header>
      <main className="page pb-24">
        <h1 className="font-display text-3xl text-[var(--text)]">Akademie</h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Grundlagen, Vergleiche und Erklärungen — unabhängig davon, wo du dein Depot führst.
        </p>

        <div className="mt-6 flex flex-wrap gap-x-2 border-b border-[var(--border)]">
          {AKADEMIE_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "-mb-px min-h-[44px] border-b-2 px-1 text-sm " +
                (tab === t ? "border-[var(--gold)] text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]")
              }
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Einstieg" && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {einstiegsSteps.map((s) => (
              <div key={s.title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-sm text-[var(--text)]">{s.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{s.text}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "Broker-Vergleich" && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-sm text-[var(--muted)] font-medium">
                  <th className="px-5 py-3">Broker</th>
                  <th className="px-5 py-3">Sparplanfähig</th>
                  <th className="px-5 py-3">Teilaktien</th>
                  <th className="px-5 py-3">Schariakonforme Kontoführung</th>
                  <th className="px-5 py-3">Kosten</th>
                </tr>
              </thead>
              <tbody>
                {brokerCompare.map((b) => (
                  <tr key={b.name} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-5 py-3 text-[var(--text)]">{b.name}</td>
                    <td className="px-5 py-3 text-[var(--muted)]">{b.sparplan ? "Ja" : "Nein"}</td>
                    <td className="px-5 py-3 text-[var(--muted)]">{b.teilaktien ? "Ja" : "Nein"}</td>
                    <td className="px-5 py-3 text-[var(--muted)]">{b.shariaKonto ? "Ja (swap-free)" : "Nicht bekannt"}</td>
                    <td className="px-5 py-3 text-[var(--muted)]">{b.kosten}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-[var(--border)] px-5 py-3 text-sm text-[var(--faint)]">
              Neutraler Vergleich — Tazkiyah erhält keine Provision und empfiehlt keinen Anbieter. „Swap-free" bedeutet: keine Zinsgutschrift/-belastung bei über Nacht gehaltenen Positionen.
            </p>
          </div>
        )}

        {tab === "Glossar" && (
          <div className="mt-6 space-y-10">
            <div>
              <p className="mb-3 text-sm text-[var(--muted)] font-medium">Top-Fragen</p>
              <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--gold)]/30 bg-[var(--surface)]">
                {topFragen.map((item, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setOpen(open === i ? -1 : i)}
                      className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left text-sm text-[var(--text)]"
                    >
                      <span>{item.q}</span>
                      <span className="flex-shrink-0 text-[var(--gold-soft)]">{open === i ? "−" : "+"}</span>
                    </button>
                    {open === i && <p className="px-5 pb-4 text-sm leading-relaxed text-[var(--muted)]">{item.a}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm text-[var(--muted)] font-medium">A–Z Glossar</p>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1">
                {Object.entries(
                  glossarAZ.reduce((groups, item) => {
                    const letter = item.term[0].toUpperCase();
                    (groups[letter] = groups[letter] || []).push(item);
                    return groups;
                  }, {})
                ).map(([letter, items]) => (
                  <div key={letter} className="border-b border-[var(--border)] px-4 py-4 last:border-0">
                    <p className="mb-2 font-[IBM_Plex_Mono] text-sm text-[var(--gold-soft)]">{letter}</p>
                    <div className="space-y-3">
                      {items.map((item) => (
                        <div key={item.term}>
                          <p className="text-sm text-[var(--text)]">{item.term}</p>
                          <p className="mt-0.5 text-sm leading-relaxed text-[var(--muted)]">{item.def}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "Methodik" && (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-sm leading-relaxed text-[var(--text-soft)]">
              Das Screening folgt den AAOIFI Shari'ah Standards Nr. 21, 27 und 35. Jede Aktie durchläuft vier Stufen:
              Tätigkeit (ist das Hauptgeschäft erlaubt, und was sagt die Satzung zum Zweck?), Kennzahlen (zinstragende
              Schulden, zinstragende Einlagen und verbotene Einnahmen im Verhältnis zur Marktkapitalisierung bzw. zu den
              Einnahmen), Vermögen (Anteil realer Vermögenswerte) und Aktie und Produkt (Aktiengattung und ausgeschlossene
              Produkte). Besteht eine Aktie alle Prüfungen, ist sie konform. Fällt eine durch, ist sie nicht konform. Steht
              noch eine Prüfung aus, ist sie nicht geprüft. Zu jeder Prüfung nennen wir die Fundstelle im Standard und
              erklären sie auf einer eigenen Seite.{" "}
              <a href={routes.methodik()} className="text-[var(--primary)] underline underline-offset-2">
                Alle Regeln im Überblick
              </a>
            </p>
            <p className="mt-3 text-sm text-[var(--faint)]">Automatisch berechnet · Keine Anlageberatung</p>
          </div>
        )}

        {tab === "Vertiefen" && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {vertiefenItems.map((v) => (
                <div key={v.title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-sm text-[var(--text)]">{v.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{v.text}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-3 text-sm text-[var(--muted)] font-medium">Literaturempfehlungen</p>
              <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                {literaturItems.map((b) => (
                  <div key={b.title} className="px-5 py-4">
                    <p className="text-sm text-[var(--text)]">{b.title}</p>
                    <p className="text-sm text-[var(--muted)]">{b.author}</p>
                    <p className="mt-1 text-sm text-[var(--faint)]">{b.note}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm text-[var(--faint)]">
                Auswahl ohne Kooperation oder Provision — dient nur der Orientierung.
              </p>
            </div>
          </div>
        )}

        <AskQuestionBox />
      </main>
    </div>
  );
}

// Bewusst klein und unauffällig gehalten, keine "KI-Chat"-Sprache.
// Fragen landen in Supabase (academy_questions). Besucher dürfen nur einreichen, nicht
// lesen, deshalb kein .select() nach dem insert. Die Datenbank drosselt zusätzlich.
const QUESTION_MIN = 5;
const QUESTION_MAX = 500;
const QUESTION_COOLDOWN_MS = 30_000;
// Nur im Arbeitsspeicher: gilt für diese Sitzung, bis die Seite neu geladen wird.
let lastQuestionSentAt = 0;

function AskQuestionBox() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("ready"); // ready | sending | sent | error
  const [errorText, setErrorText] = useState("");
  const [coolingDown, setCoolingDown] = useState(() => Date.now() - lastQuestionSentAt < QUESTION_COOLDOWN_MS);

  useEffect(() => {
    if (!coolingDown) return undefined;
    const rest = QUESTION_COOLDOWN_MS - (Date.now() - lastQuestionSentAt);
    const timer = setTimeout(() => setCoolingDown(false), Math.max(rest, 0));
    return () => clearTimeout(timer);
  }, [coolingDown]);

  const trimmed = question.trim();
  const canSend = trimmed.length >= QUESTION_MIN && status !== "sending" && !coolingDown;

  async function send() {
    if (!canSend) return;
    setStatus("sending");
    setErrorText("");
    let error = null;
    try {
      ({ error } = await supabase.from("academy_questions").insert({ question: trimmed, page: "akademie" }));
    } catch (e) {
      error = e;
    }
    if (error) {
      const throttled = /throttle/i.test(String(error.message || ""));
      setErrorText(
        throttled
          ? "Gerade kommen sehr viele Fragen an. Bitte versuch es später noch einmal."
          : "Deine Frage konnte nicht gesendet werden. Bitte versuch es später noch einmal."
      );
      setStatus("error"); // Text bleibt im Feld stehen
      return;
    }
    lastQuestionSentAt = Date.now();
    setCoolingDown(true);
    setQuestion("");
    setStatus("sent");
  }

  return (
    <div className="mt-10 border-t border-[var(--border)] pt-6">
      <label htmlFor="academy-question" className="text-sm text-[var(--faint)]">Frage nicht gefunden?</label>
      <form
        className="mt-2 flex max-w-md items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="min-w-0 flex-1">
          <input
            id="academy-question"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (status === "sent" || status === "error") setStatus("ready");
            }}
            placeholder="Frag nach…"
            minLength={QUESTION_MIN}
            maxLength={QUESTION_MAX}
            aria-describedby="academy-question-count academy-question-note"
            className="field w-full"
          />
          <p id="academy-question-count" className="mt-1 text-right text-sm text-[var(--faint)]">
            {question.length} / {QUESTION_MAX}
          </p>
        </div>
        <button
          type="submit"
          disabled={!canSend}
          className="btn-secondary flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "sending" ? "Wird gesendet …" : "Senden"}
        </button>
      </form>
      <div role="status" aria-live="polite">
        {status === "sent" && <p className="mt-2 text-sm text-[var(--ok-text)]">Danke, deine Frage ist angekommen.</p>}
        {status === "error" && <p className="mt-2 text-sm text-[var(--bad-text)]">{errorText}</p>}
      </div>
      <p id="academy-question-note" className="mt-2 max-w-md text-sm text-[var(--muted)]">
        Wir beantworten Fragen nicht einzeln. Häufige Fragen nehmen wir in die Akademie und das FAQ auf. Bitte keine persönlichen Daten eingeben.
      </p>
    </div>
  );
}

function SectorsPage({ onBack }) {
  const list = useScreeningList();
  const bySector = SECTORS.map((sector) => {
    const items = list.rows.filter((r) => r.sector === sector);
    const konform = items.filter((r) => r.status === "konform").length;
    return { sector, total: items.length, konform };
  });
  return (
    <div className="font-body">
      <header className="flex page items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <button type="button" onClick={onBack} className="-my-3 inline-flex min-h-[44px] items-center hover:text-[var(--text)]">Tazkiyah</button>
        <span>/</span>
        <span className="text-[var(--text)]">Sektoren</span>
      </header>
      <main className="page pb-24">
        <h1 className="font-display text-2xl text-[var(--text)]">Sektor-Übersicht</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Wie viele geprüfte Titel je Branche konform sind.</p>
        <div className="mt-6 grid gap-3">
          {bySector.map((b) => (
            <div key={b.sector} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-[var(--text)]">{b.sector}</span>
                <span className="text-[var(--muted)]">{list.loading ? "…" : `${b.konform} von ${b.total} konform`}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
                <div className="h-full rounded-full bg-[var(--emerald)]" style={{ width: `${b.total ? (b.konform / b.total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

/* ---------- Vergleichsseite ---------- */

function ComparePage({ tickers, onBack }) {
  const list = useScreeningList();
  const items = sampleStocks.filter((s) => tickers.includes(s.ticker));
  // TODO Schritt 3: Kennzahlen (B1, B2, B3) aus den Screening-Ergebnissen vergleichen
  const rows = [
    { label: "Status", get: (s) => <StatusBadge status={list.byTicker.get(s.ticker)?.status ?? "nicht_geprueft"} /> },
    { label: "Begründung", get: (s) => (list.byTicker.get(s.ticker) ? reasonLine(list.byTicker.get(s.ticker)) : "Wird demnächst geprüft.") },
    { label: "Kurs (Beispielwert)", get: (s) => s.price },
    { label: "Sektor", get: (s) => s.sector },
  ];
  return (
    <div className="font-body">
      <header className="flex page items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <button type="button" onClick={onBack} className="-my-3 inline-flex min-h-[44px] items-center hover:text-[var(--text)]">Tazkiyah</button>
        <span>/</span>
        <span className="text-[var(--text)]">Vergleichen</span>
      </header>
      <main className="page pb-24">
        <h1 className="font-display text-2xl text-[var(--text)]">Aktien vergleichen</h1>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Wähle im Screener bis zu 3 Aktien zum Vergleichen aus.</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-5 py-3 text-left text-sm text-[var(--muted)] font-medium"> </th>
                  {items.map((s) => (
                    <th key={s.ticker} className="px-5 py-3 text-left font-[IBM_Plex_Mono] text-[var(--text)]">{s.ticker}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-5 py-3 text-sm text-[var(--muted)]">{r.label}</td>
                    {items.map((s) => (
                      <td key={s.ticker} className="px-5 py-3 text-[var(--text-soft)]">{r.get(s)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- Navigation (Kopfleiste, siehe components/SiteHeader.jsx) ---------- */

const NAV_GROUPS = [
  {
    key: "screener",
    label: "Screener",
    page: "screener",
    children: [
      { label: "Alle Aktien", page: "screener", reset: true },
      { type: "heading", label: "Status" },
      ...STATUS_ORDER.map((st) => ({ type: "filter", label: STATUS_TEXT[st], filter: { type: "status", value: st } })),
      { type: "heading", label: "Sektor" },
      ...SECTORS.map((sec) => ({ type: "filter", label: sec, filter: { type: "sector", value: sec } })),
      { label: "Sektor-Explorer", page: "sectors" },
      { label: "Vergleichen", page: "compare" },
    ],
  },
  {
    key: "portfolio",
    label: "Portfolio",
    page: "portfolio",
    children: [
      { label: "Übersicht", page: "portfolio" },
      { label: "Reinheits-Rechner", page: "portfolio", anchor: "rechner" },
      { label: "Kalender", page: "calendar" },
    ],
  },
  {
    key: "berichte",
    label: "Berichte",
    page: "reports",
    children: [
      { label: "PDF-Berichte", page: "reports" },
    ],
  },
];

/* ---------- Root ---------- */

// Seiten, die über die Hash-Adresse geöffnet werden (siehe src/lib/hashRoute.js)
const ROUTED_PAGES = ["screener", "detail", "criterion", "methodik"];

export default function TazkiyahPrototype() {
  const [page, setPage] = useState("home"); // home | screener | detail | criterion | methodik | portfolio | watchlist | reports | faq | sectors | compare | …
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [criterionId, setCriterionId] = useState(null);
  const [session, setSession] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Session beim Start laden, plus auf Login/Logout reagieren.
  // PASSWORD_RECOVERY feuert automatisch, wenn ein Nutzer über den Link aus
  // der "Passwort vergessen"-E-Mail in der App landet — dann zeigen wir
  // sofort das Formular zum Setzen eines neuen Passworts.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") setShowResetPassword(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;
  const wl = useWatchlist(["NVDA"], { storageKey: "amanah-watchlist", userId });
  const [compareTickers, setCompareTickers] = useState([]);
  const [activeAnchor, setActiveAnchor] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);
  const [presetFilter, setPresetFilter] = useState(null);

  function toggleCompare(ticker) {
    setCompareTickers((prev) =>
      prev.includes(ticker) ? prev.filter((t) => t !== ticker) : prev.length >= 3 ? prev : [...prev, ticker]
    );
  }
  function openStock(ticker) {
    navigate(routes.stock(ticker));
  }

  // Seiten mit Hash-Adresse: Hauptseite, Detailseite, Erklärseite, Methodik.
  // Alle übrigen Seiten laufen weiter über den page-Zustand.
  const route = useHashRoute();
  const methodikAnchorRef = React.useRef(null);
  useEffect(() => {
    if (!route) return; // Sprungmarke wie #screener, keine Seite
    if (route.name === "stock") {
      setSelectedTicker(route.ticker);
      setPage("detail");
      setActiveAnchor(null);
    } else if (route.name === "criterion") {
      setCriterionId(route.id);
      setPage("criterion");
      setActiveAnchor(null);
    } else if (route.name === "screener") {
      setPage("screener");
      setActiveAnchor(null);
    } else if (route.name === "methodik") {
      setPage("methodik");
      setActiveAnchor(methodikAnchorRef.current);
      methodikAnchorRef.current = null;
    } else {
      // "#/": von einer Adress-Seite zurück zur Startseite; page-Seiten (Watchlist usw.) bleiben
      setPage((p) => (ROUTED_PAGES.includes(p) ? "home" : p));
    }
  }, [route]);

  // Klick in der Navigation: zur Seite navigieren, optional zu einem Abschnitt scrollen
  // und/oder einen Status-/Sektor-Filter im Screener vorbelegen
  function goTo(targetPage, anchor, filter) {
    if (targetPage === "methodik") {
      if (page === "methodik") setActiveAnchor(anchor || null);
      else methodikAnchorRef.current = anchor || null;
      navigate(routes.methodik());
    } else if (targetPage === "home" || targetPage === "screener") {
      navigate(targetPage === "home" ? routes.home() : routes.screener());
      if (page === targetPage) window.scrollTo({ top: 0, behavior: "smooth" });
      setPage(targetPage);
      setActiveAnchor(null);
    } else {
      // Seite ohne eigene Adresse: Adresse auf "#/" setzen, damit "Zurück" zur vorigen Adresse führt
      pushHashSilently(routes.home());
      setPage(targetPage);
      setActiveAnchor(anchor || null);
    }
    if (filter) {
      setActiveFilter(filter.type === "all" ? null : filter);
      setPresetFilter({ ...filter, ts: Date.now() });
    }
  }

  // Filter aus der Navigation → Vorgabe für die Screener-Liste
  const screenerPreset = presetFilter
    ? {
        ts: presetFilter.ts,
        ...(presetFilter.type === "status" ? { statuses: [presetFilter.value] } : {}),
        ...(presetFilter.type === "sector" ? { sector: presetFilter.value } : {}),
      }
    : null;

  return (
    <div className="app-root min-h-screen w-full bg-[var(--bg)] text-[var(--text)] antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Source+Sans+3:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        /* Tazkiyah Design B „Hell und ruhig“ (entschieden 05.10.2026) — einziges Theme, kein Dark Mode */
        :root {
          color-scheme: light;
          --bg: #F5F2E9;
          --bg-deep: #EFEADD;
          --surface: #FFFFFF;
          --track: #EFEADD;
          --border: #E2DBC9;
          --text: #1B241F;
          --text-soft: #3A433D;
          --muted: #4F5751;
          --faint: #656B66;      /* Vorgabe #6B716C, minimal dunkler für 4,5 : 1 auf --bg */
          --gold: #B08A3E;
          --gold-soft: #836527;  /* Vorgabe #8A6A2C, minimal dunkler für 4,5 : 1 auf --bg */
          --emerald: #2E7A55;
          --emerald-soft: #1D5E41;
          --red: #C0533F;
          --red-soft: #9A3426;
          --amber: #B07A1F;
          --amber-soft: #7A5410;
          --primary: #1F5A43;
          --primary-hover: #123B2B;
          --on-primary: #FFFFFF;
          --footer: #13231C;
          --footer-text: #CFD6CF;
          --footer-link: #E2C27A;
          /* Feste Werte aus der Gestaltungsvorgabe, damit keine Farbe außerhalb der Variablen steht */
          --line: #ECE6D6;          /* Trennlinien in Karten */
          --control-border: #D6CEB9; /* Ränder von Feldern, Chips, Zweitknöpfen */
          --field: #FBFAF6;          /* Hintergrund von Eingabefeldern */
          --header-border: #DDD6C4;
          --ok-bg: #E3F0E8;   --ok-text: #1D5E41;
          --bad-bg: #F6E3DF;  --bad-text: #9A3426;  --bad-border: #E8C3BA; --bad-strong: #7A2A1F;
          --none-bg: #ECECE8; --none-text: #555A55; --none-strong: #3A3F3B;
          --on-primary-soft: #F2F5F1; --on-primary-muted: #C9D9CF;
          --tile: #E6EFE9;    --tile-gold: #F4ECD9;
          --note-bg: #FBF5E6; --note-border: #EADBB5;
          --logo-dot: #D9B45F;
          /* TradingView-Widgets (Kurs-Chart auf der Detailseite). Werden beim Laden ausgelesen. */
          --tv-line: var(--primary);
          --tv-area-top: rgba(31, 90, 67, 0.16);
          --tv-area-bottom: rgba(31, 90, 67, 0.01);
          --tv-grid: rgba(27, 36, 31, 0.06);
          --tv-scale-text: var(--muted);
          --tv-text: var(--text);
          --tv-bg: var(--surface);
          --tv-up: var(--emerald);
          --tv-down: var(--red);
        }

        /* Inhaltsbreite: höchstens 1160 px, mittig, 40 px Innenabstand (Handy 20 px).
           In der Komponenten-Ebene, damit Utilities wie max-w-2xl (Formulare) sie übersteuern. */
        @layer components {
          .page { width: 100%; max-width: 1160px; margin-inline: auto; padding-inline: 40px; box-sizing: border-box; }
          @media (max-width: 640px) { .page { padding-inline: 20px; } }

          /* Grundbausteine */
          .btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; min-height: 48px; padding: 14px 26px; border-radius: 10px; background: var(--primary); color: var(--on-primary); font-weight: 600; font-size: 16px; line-height: 1.2; }
          .btn-primary:hover { background: var(--primary-hover); }
          .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; min-height: 48px; padding: 14px 26px; border-radius: 10px; background: var(--surface); color: var(--text); border: 1px solid var(--control-border); font-weight: 600; font-size: 16px; line-height: 1.2; }
          .btn-secondary:hover { border-color: var(--primary); }
          .field { min-height: 50px; padding: 0 14px; border-radius: 10px; background: var(--field); border: 1px solid var(--control-border); color: var(--text); font-size: 16px; }
          .field:focus { border-color: var(--primary); }
          .chip { display: inline-flex; align-items: center; gap: .4rem; min-height: 44px; padding: 0 16px; border-radius: 999px; background: var(--surface); border: 1px solid var(--control-border); color: var(--text); font-size: 15px; font-weight: 500; }
          .chip[aria-pressed="true"] { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
          .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 24px; }
          .icon-tile { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: 12px; background: var(--tile); color: var(--primary); }
          .icon-tile-gold { background: var(--tile-gold); color: var(--gold-soft); }
          .sr-only-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        }

        /* Sichtbarer Fokus für alles Klickbare */
        :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

        .font-display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
        .font-body { font-family: 'Source Sans 3', system-ui, sans-serif; }
        .app-root { font-family: 'Source Sans 3', system-ui, sans-serif; font-size: 17px; line-height: 1.6; }
      `}</style>

      <SiteHeader
        page={page}
        navGroups={NAV_GROUPS}
        activeFilter={activeFilter}
        onGo={goTo}
        watchlistCount={wl.watchlist.length}
        watchlistMax={wl.maxSize}
        compareCount={compareTickers.length}
        session={session}
        onOpenAuth={() => setShowAuth(true)}
        onSignOut={() => supabase.auth.signOut()}
      />

      {showAuth && <AuthPanel onClose={() => setShowAuth(false)} />}
      {showResetPassword && <ResetPasswordPanel onDone={() => setShowResetPassword(false)} />}

      <div>
        {page === "home" && <StartPage onGo={goTo} />}
        {page === "screener" && (
          <ScreenerPage
            sectors={SECTORS}
            preset={screenerPreset}
            watchlist={wl.watchlist}
            onToggleWatchlist={wl.toggle}
            compareTickers={compareTickers}
            onToggleCompare={toggleCompare}
          />
        )}
        {page === "portfolio" && <PortfolioPage onBack={() => goTo("home")} anchor={activeAnchor} />}
        {page === "detail" && selectedTicker && (
          <StockDetailPage
            ticker={selectedTicker}
            onBack={() => goTo("screener")}
            watchlist={wl.watchlist}
            onToggleWatchlist={wl.toggle}
          />
        )}
        {page === "criterion" && criterionId && <CriterionPage id={criterionId} onBack={() => goTo("home")} />}
        {page === "watchlist" && (
          <WatchlistPage
            watchlist={wl.watchlist}
            onBack={() => goTo("home")}
            onToggleWatchlist={wl.toggle}
          />
        )}
        {page === "calendar" && (
          <CalendarPage watchlist={wl.watchlist} onBack={() => goTo("home")} onOpenStock={openStock} />
        )}
        {page === "reports" && <ReportsPage onBack={() => goTo("home")} />}
        {page === "faq" && <AkademiePage onBack={() => goTo("home")} />}
        {page === "methodik" && <MethodikPage onBack={() => goTo("home")} anchor={activeAnchor} />}
        {page === "sectors" && <SectorsPage onBack={() => goTo("home")} />}
        {page === "compare" && <ComparePage tickers={compareTickers} onBack={() => goTo("home")} />}
        {page === "profile" && <ProfilePage session={session} onGo={goTo} />}
        {page === "security" && <SecurityPage session={session} onGo={goTo} />}
        {page === "settings" && <SettingsPage session={session} onGo={goTo} />}
        {page === "privacy" && <PrivacyPage session={session} onGo={goTo} />}

        {/* Fußzeile über die volle Breite */}
        <footer className="mt-20 bg-[var(--footer)] py-8">
          <div className="page">
            <BasisLine variant="footer" />
          </div>
        </footer>
      </div>

      <Toast toast={wl.toast} onDismiss={wl.dismissToast} />

      {/* Floating Vergleichs-Leiste */}
      {compareTickers.length > 0 && page !== "compare" && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-3">
          <span className="text-sm text-[var(--muted)]">{compareTickers.length} zum Vergleich ausgewählt</span>
          <button
            onClick={() => goTo("compare")}
            className="rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)]"
          >
            Vergleichen ansehen
          </button>
        </div>
      )}
    </div>
  );
}
