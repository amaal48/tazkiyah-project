import React, { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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
import ScreeningDetail from "./components/screening/ScreeningDetail.jsx";
import CriterionPage from "./components/screening/CriterionPage.jsx";
import { STATUS_ORDER, STATUS_TEXT, reasonLine } from "./components/screening/format.js";

/* ============================================================
   TAZKIYAH — Basis-Prototyp
   Enthält: Startseite + Aktien-Detailseite in einer Datei,
   per einfachem State-Switch navigierbar (als Grundlage gedacht,
   nicht als fertiges Routing).
   ============================================================ */

/* ---------- Gemeinsame Bausteine ---------- */

// Signatur-Element: achtzackiger Stern (Khatam) als Logo. Bewusst ohne Zahl und Ring,
// damit er nicht wie eine Bewertung wirkt.
function LogoMark({ size = 30 }) {
  const c = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter * 0.55;
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    pts.push(`${c + r * Math.cos(a)},${c + r * Math.sin(a)}`);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <path d={`M${pts.join("L")}Z`} fill="var(--bg)" stroke="var(--gold-soft)" strokeWidth="1.2" />
    </svg>
  );
}

/* ---------- Kurs-Chart mit Zeitfiltern ----------
   generateMockSeries() erzeugt Demo-Kursreihen. fetchPriceHistory() ist die
   Stelle, an der eine echte Marktdaten-API angebunden wird — siehe Hinweise
   am Ende der Datei / im Chat für konkrete Anbieter und Anbindung. */

const CHART_RANGES = [
  { key: "1D", label: "1T", days: 1, intraday: true },
  { key: "1W", label: "1W", days: 7 },
  { key: "1M", label: "1M", days: 30 },
  { key: "1Y", label: "1J", days: 365 },
  { key: "5Y", label: "5J", days: 1825 },
  { key: "MAX", label: "Max", days: 3650 },
];

// Fixer Näherungskurs für die Dollar->Euro-Anzeige (EZB-Referenzkurs, Stand 04.09.2026:
// 1 € = 1,1622 $ → 1 $ ≈ 0,86 €). KEINE Live-Umrechnung — für ein fertiges Produkt
// sollte hier ein echter FX-Endpoint (z.B. exchangerate.host, Twelve Data "currency_conversion")
// angebunden werden, idealerweise mit demselben Caching-Muster wie price-history.js.
const USD_EUR_RATE = 0.86;

function parseEuro(str) {
  return parseFloat(str.replace(/\./g, "").replace(",", ".").replace("$", "").replace("€", "").trim());
}
function parsePercent(str) {
  return parseFloat(str.replace("%", "").replace(",", "."));
}

// Deterministischer Pseudo-Zufallswert (gleiches Ticker+Range ergibt immer dieselbe Kurve)
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Intraday-Serie (1T): stündliche Punkte über einen Handelstag (9-17:30 Uhr Xetra-Fenster
// als Orientierung), statt nur zwei Datenpunkten — sonst sieht "1T" wie eine gerade Linie aus.
function generateIntradaySeries(ticker, currentPrice) {
  const seedBase = ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + 1;
  const rand = seededRandom(seedBase);
  const points = [];
  let price = currentPrice * (0.985 + rand() * 0.01);
  const hours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "17:30"];
  for (let i = 0; i < hours.length; i++) {
    price = price + (rand() - 0.48) * currentPrice * 0.004;
    points.push({ date: hours[i], price: Number(price.toFixed(2)) });
  }
  points[points.length - 1].price = currentPrice;
  return points;
}

function generateMockSeries(ticker, days, currentPrice) {
  const seedBase = ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + days;
  const rand = seededRandom(seedBase);
  const points = [];
  let price = currentPrice * (0.92 + rand() * 0.06);
  const today = new Date();
  // Bei langen Zeiträumen nicht jeden einzelnen Tag berechnen (unnötig für die Optik,
  // kostet nur Performance) — stattdessen auf ca. 180 Stützpunkte verdichten.
  const step = Math.max(1, Math.floor(days / 180));
  for (let i = days; i >= 0; i -= step) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    price = Math.max(price + (rand() - 0.485) * currentPrice * 0.012 * step, currentPrice * 0.35);
    points.push({ date: d.toISOString().slice(0, 10), price: Number(price.toFixed(2)) });
  }
  points[points.length - 1].price = currentPrice; // heutiger Kurs bleibt exakt
  return points;
}

// Versucht die echte API-Route; fällt bei Fehler (z.B. Function noch nicht
// eingerichtet, kein API-Key, ISIN fehlt) automatisch auf Demo-Daten zurück,
// damit die App auch ohne Backend-Setup lauffähig bleibt.
async function fetchPriceHistory(ticker, rangeKey, currentPrice) {
  const range = CHART_RANGES.find((r) => r.key === rangeKey);

  try {
    const res = await fetch(`/api/price-history?symbol=${ticker}&range=${rangeKey}`);
    if (!res.ok) throw new Error("API nicht erreichbar");
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("Keine Daten");
    return data;
  } catch (err) {
    // Fallback: Demo-Daten (z.B. während der lokalen Entwicklung ohne Vercel-Function)
    await new Promise((r) => setTimeout(r, 150));
    return range.intraday ? generateIntradaySeries(ticker, currentPrice) : generateMockSeries(ticker, range.days, currentPrice);
  }
}

// Formatiert die X-Achsen-/Tooltip-Beschriftung je nach Zeitraum unterschiedlich fein
function formatChartLabel(dateStr, rangeKey) {
  if (rangeKey === "1D") return dateStr; // schon "HH:mm"
  const d = new Date(dateStr + "T00:00:00");
  if (rangeKey === "5Y" || rangeKey === "MAX") {
    return d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function StockChart({ stock }) {
  const [range, setRange] = useState("1M");
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentPrice = parseEuro(stock.price);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPriceHistory(stock.ticker, range, currentPrice).then((data) => {
      if (!cancelled) {
        setSeries(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock.ticker, range]);

  const first = series[0]?.price;
  const last = series[series.length - 1]?.price;
  const changeAbs = first != null ? (last - first) * USD_EUR_RATE : 0;
  const changePct = first ? ((last - first) / first) * 100 : 0; // Prozent ist währungsunabhängig
  const up = changeAbs >= 0;
  const color = up ? "var(--emerald-soft)" : "var(--red-soft)";
  const seriesEUR = series.map((p) => ({ ...p, price: Number((p.price * USD_EUR_RATE).toFixed(2)) }));

  return (
    <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          {loading ? (
            <span className="text-sm text-[var(--faint)]">Lade Kursdaten…</span>
          ) : (
            <>
              <span className={"font-[IBM_Plex_Mono] text-lg " + (up ? "text-[var(--emerald-soft)]" : "text-[var(--red-soft)]")}>
                {up ? "+" : ""}{changePct.toFixed(2)}%
              </span>
              <span className="ml-2 text-xs text-[var(--muted)]">
                ({up ? "+" : ""}{changeAbs.toFixed(2).replace(".", ",")} €) im gewählten Zeitraum
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1 rounded-full border border-[var(--border)] p-1">
          {CHART_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={
                "rounded-full px-3 py-1 text-xs font-[IBM_Plex_Mono] " +
                (range === r.key ? "bg-[var(--gold)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-56 items-center justify-center text-xs text-[var(--faint)]">Lade Kursdaten…</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={seriesEUR} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="chartFade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => formatChartLabel(v, range)}
              tick={{ fill: "var(--faint)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "var(--faint)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={54}
              tickFormatter={(v) => `${v.toFixed(0)} €`}
            />
            <Tooltip
              contentStyle={{ background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--muted)" }}
              labelFormatter={(v) => formatChartLabel(v, range)}
              formatter={(v) => [`${v.toFixed(2).replace(".", ",")} €`, "Kurs"]}
            />
            <Area type="monotone" dataKey="price" stroke={color} fill="url(#chartFade)" strokeWidth={2} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--faint)]">
        <span>Quelle: Demo-Daten (Platzhalter) · Anzeige in € umgerechnet, Original in $ (US-notiert)</span>
      </div>
    </div>
  );
}

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
  Earnings: { dot: "bg-[#8B9EE8]", text: "text-[#8B9EE8]", bg: "bg-[#3B4C7C]/15", border: "border-[#3B4C7C]/40" },
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

// Kurs und Kursverlauf aus stocks.js sind Platzhalter und werden nur so gekennzeichnet gezeigt
function PriceSection({ stock }) {
  const priceNum = parseEuro(stock.price);
  const dayPct = parsePercent(stock.change);
  const dayAbs = (priceNum * dayPct) / (100 + dayPct);
  return (
    <section className="mt-12 border-t border-[var(--border)] pt-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Kurs</p>
        <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-soft)]">Beispielwerte</span>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <span className="font-[IBM_Plex_Mono] text-2xl text-[var(--text)]">{(priceNum * USD_EUR_RATE).toFixed(2).replace(".", ",")} €</span>
        <span className="font-[IBM_Plex_Mono] text-sm text-[var(--faint)]">≈ {stock.price}</span>
        <span className={"font-[IBM_Plex_Mono] text-sm " + (stock.up ? "text-[var(--emerald-soft)]" : "text-[var(--red-soft)]")}>
          {stock.up ? "+" : ""}{dayPct.toFixed(2)}% ({stock.up ? "+" : ""}{(dayAbs * USD_EUR_RATE).toFixed(2).replace(".", ",")} €) heute
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--faint)]">
        Beispielwerte, keine echten Kurse. Euro-Wert über festen Näherungskurs (1 $ ≈ {USD_EUR_RATE} €).
      </p>
      <StockChart stock={stock} />
    </section>
  );
}

function StockDetailPage({ onBack, ticker, watchlist, onToggleWatchlist }) {
  const stock = sampleStocks.find((s) => s.ticker === ticker) || null;
  return (
    <ScreeningDetail
      ticker={ticker}
      onBack={onBack}
      watchlist={watchlist}
      onToggleWatchlist={onToggleWatchlist}
      priceSection={stock ? <PriceSection stock={stock} /> : null}
    />
  );
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
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
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
                <button type="button" onClick={() => onToggleWatchlist(r.ticker)} className="text-[var(--red-soft)] hover:underline">
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
        "flex flex-shrink-0 flex-col items-center gap-1 rounded-xl border px-3.5 py-2.5 transition-colors " +
        (isSelected
          ? "border-[var(--gold)] bg-[var(--gold)]/15"
          : isToday
          ? "border-[var(--gold)]/50 bg-[var(--surface)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--muted)]")
      }
    >
      <span className={"text-[10px] uppercase tracking-[0.1em] " + (isSelected ? "text-[var(--gold-soft)]" : "text-[var(--faint)]")}>
        {weekday}
      </span>
      <span className={"font-[IBM_Plex_Mono] text-sm " + (isSelected ? "text-[var(--gold-soft)]" : "text-[var(--text)]")}>
        {d.getDate()}
      </span>
      <span className="flex h-3.5 items-center">
        {count > 0 && (
          <span className={"rounded-full px-1.5 text-[9px] " + (isSelected ? "bg-[var(--gold)] text-[var(--bg)]" : "bg-[var(--border)] text-[var(--faint)]")}>
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
      className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-left transition-colors hover:border-[var(--gold)]/40 hover:bg-[var(--bg-deep)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex-shrink-0 rounded-lg bg-[var(--bg-deep)] px-2 py-1 font-[IBM_Plex_Mono] text-xs text-[var(--text)]">
          {e.ticker}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--text)]">{e.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={"rounded-full border px-2 py-0.5 text-[10px] " + style.bg + " " + style.border + " " + style.text}>
              {e.type === "HV" ? "Hauptversammlung" : e.type}
            </span>
            {e.type === "Earnings" && (
              <span className="text-[10px] text-[var(--faint)]">{demoEventTiming(e.ticker, e.date)}</span>
            )}
            {showRelevance && e.inWatchlist && (
              <span className="rounded-full border border-[var(--gold)]/40 px-2 py-0.5 text-[10px] text-[var(--gold-soft)]">★ Watchlist</span>
            )}
            {showRelevance && e.inPortfolio && (
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)]">Portfolio</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="font-[IBM_Plex_Mono] text-xs text-[var(--faint)]">{formatEventDate(e.date)}</span>
        <button
          onClick={handleExportSingle}
          title="Als .ics herunterladen (Apple/Google Kalender)"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[var(--faint)] hover:border-[var(--gold)]/50 hover:text-[var(--gold-soft)]"
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
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
        <span>/</span>
        <span className="text-[var(--text)]">Kalender</span>
      </header>
      <main className="page pb-24">
        <h1 className="font-display text-2xl text-[var(--text)]">Termin-Kalender</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Hauptversammlungen, Earnings-Calls und Dividendenstichtage — alle Termine sind Demo-Daten.
        </p>
        <p className="mt-2 text-xs text-[var(--faint)]">
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
                "rounded-full border px-4 py-1.5 text-sm " +
                (scope === opt.key
                  ? "border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold-soft)]"
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
              className={"rounded-full px-4 py-1.5 text-xs " + (!showPast ? "bg-[var(--gold)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]")}
            >
              Anstehend ({upcoming.length})
            </button>
            <button
              onClick={() => setShowPast(true)}
              className={"rounded-full px-4 py-1.5 text-xs " + (showPast ? "bg-[var(--gold)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]")}
            >
              Vergangen ({past.length})
            </button>
          </div>

          {scope === "alle" ? (
            <p className="max-w-xs text-right text-[11px] text-[var(--faint)]">
              Export ist auf Watchlist und Portfolio beschränkt. Bereich oben wechseln, um zu exportieren.
            </p>
          ) : (
            <button
              onClick={() => {
                const ics = generateICS(upcoming, `Tazkiyah — ${SCOPE_OPTIONS.find((o) => o.key === scope).label}`);
                downloadICS(`tazkiyah-termine-${scope}-${today}`, ics);
              }}
              disabled={upcoming.length === 0}
              className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--gold)]/50 hover:text-[var(--gold-soft)] disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:text-[var(--muted)]"
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
                    "rounded-full px-3 py-1 text-xs " +
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
                  <p className="mb-2.5 text-xs uppercase tracking-[0.2em] text-[var(--faint)]">
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
          <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
          <span>/</span>
          <span onClick={() => setSelectedReport(null)} className="cursor-pointer hover:text-[var(--text)]">Berichte</span>
          <span>/</span>
          <span className="text-[var(--text)]">{r.title}</span>
        </header>
        <main className="page pb-24">
          <button
            onClick={() => setSelectedReport(null)}
            className="mb-4 text-sm text-[var(--faint)] hover:text-[var(--gold-soft)]"
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
                  <p className="text-xs text-[var(--muted)]">{idx.name}</p>
                  <p className="mt-2 font-[IBM_Plex_Mono] text-lg text-[var(--text)]">{idx.value}</p>
                  <p className={"mt-1 font-[IBM_Plex_Mono] text-xs " + indexDirectionClasses[idx.direction]}>
                    {idx.change}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--faint)]">{idx.note}</p>
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

          <p className="mt-8 text-xs text-[var(--faint)]">
            {r.sourceNote || "Demo-Inhalt zu Illustrationszwecken"} · Keine Anlageberatung · Berichte bleiben 6 Monate abrufbar.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="font-body">
      <header className="flex page items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
        <span>/</span>
        <span className="text-[var(--text)]">Berichte</span>
      </header>
      <main className="page pb-24">
        <h1 className="font-display text-2xl text-[var(--text)]">Wöchentliche Berichte</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Automatisch erstellt, jeden Montag aktualisiert · Berichte bleiben 6 Monate abrufbar.
        </p>
        {usingFallback && (
          <p className="mt-2 text-xs text-[var(--faint)]">
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
                className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-left transition-colors hover:border-[var(--gold)]/40 hover:bg-[var(--bg-deep)]"
              >
                <div className="pr-6">
                  <p className="text-sm text-[var(--text)]">{r.title}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">{r.tldr}</p>
                </div>
                <span className="shrink-0 text-xs text-[var(--faint)]">Lesen →</span>
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
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
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
                "border-b-2 px-1 pb-3 text-sm -mb-px " +
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
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{s.text}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "Broker-Vergleich" && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-[0.1em] text-[var(--muted)]">
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
            <p className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--faint)]">
              Neutraler Vergleich — Tazkiyah erhält keine Provision und empfiehlt keinen Anbieter. „Swap-free" bedeutet: keine Zinsgutschrift/-belastung bei über Nacht gehaltenen Positionen.
            </p>
          </div>
        )}

        {tab === "Glossar" && (
          <div className="mt-6 space-y-10">
            <div>
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Top-Fragen</p>
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
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">A–Z Glossar</p>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1">
                {Object.entries(
                  glossarAZ.reduce((groups, item) => {
                    const letter = item.term[0].toUpperCase();
                    (groups[letter] = groups[letter] || []).push(item);
                    return groups;
                  }, {})
                ).map(([letter, items]) => (
                  <div key={letter} className="border-b border-[var(--border)] px-4 py-4 last:border-0">
                    <p className="mb-2 font-[IBM_Plex_Mono] text-xs text-[var(--gold-soft)]">{letter}</p>
                    <div className="space-y-3">
                      {items.map((item) => (
                        <div key={item.term}>
                          <p className="text-sm text-[var(--text)]">{item.term}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{item.def}</p>
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
              <a href={routes.methodik()} className="text-[var(--gold-soft)] underline underline-offset-2">
                Alle Regeln im Überblick
              </a>
            </p>
            <p className="mt-3 text-xs text-[var(--faint)]">Automatisch berechnet · Keine Anlageberatung</p>
          </div>
        )}

        {tab === "Vertiefen" && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {vertiefenItems.map((v) => (
                <div key={v.title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-sm text-[var(--text)]">{v.title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{v.text}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Literaturempfehlungen</p>
              <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                {literaturItems.map((b) => (
                  <div key={b.title} className="px-5 py-4">
                    <p className="text-sm text-[var(--text)]">{b.title}</p>
                    <p className="text-xs text-[var(--muted)]">{b.author}</p>
                    <p className="mt-1 text-xs text-[var(--faint)]">{b.note}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-[var(--faint)]">
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

// Bewusst klein und unauffällig gehalten — keine "KI-Chat"-Sprache, keine
// echte Antwortlogik dahinter, nur ein UI-Baustein für später.
function AskQuestionBox() {
  const [question, setQuestion] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="mt-10 border-t border-[var(--border)] pt-6">
      <p className="text-xs text-[var(--faint)]">Frage nicht gefunden?</p>
      {sent ? (
        <p className="mt-2 text-sm text-[var(--muted)]">Danke — deine Frage wurde vermerkt.</p>
      ) : (
        <div className="mt-2 flex max-w-md items-center gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Frag nach…"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
          />
          <button
            onClick={() => question.trim() && setSent(true)}
            className="flex-shrink-0 rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:border-[var(--gold)]/50 hover:text-[var(--gold-soft)]"
          >
            Senden
          </button>
        </div>
      )}
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
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
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
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
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
                  <th className="px-5 py-3 text-left text-xs uppercase tracking-[0.15em] text-[var(--muted)]"> </th>
                  {items.map((s) => (
                    <th key={s.ticker} className="px-5 py-3 text-left font-[IBM_Plex_Mono] text-[var(--text)]">{s.ticker}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-5 py-3 text-xs text-[var(--muted)]">{r.label}</td>
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

/* ---------- Sidebar-Navigation ---------- */

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

function NavIcon({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className={"transition-transform " + (open ? "rotate-90" : "")}>
      <path d="M3 1L7 5L3 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Sidebar({ page, activeAnchor, activeFilter, onGo, watchlistCount, watchlistMax, compareCount, collapsed, onToggleCollapse, session, onOpenAuth, onSignOut }) {
  const [openGroups, setOpenGroups] = useState({ screener: true });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const toggleGroup = (key) => setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const isActive = (item) =>
    item.page === page && (!item.anchor || item.anchor === activeAnchor);
  const isFilterActive = (item) =>
    activeFilter && item.filter && activeFilter.type === item.filter.type && activeFilter.value === item.filter.value;

  return (
    <aside
      style={{ width: collapsed ? "4rem" : "15rem", transition: "width 200ms ease" }}
      className="fixed left-0 top-0 z-30 flex h-screen flex-shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--bg-deep)]"
    >
      <div className={"flex items-center py-6 " + (collapsed ? "justify-center px-0" : "justify-between px-5")}>
        <a href={routes.home()} onClick={() => onGo("home")} className="flex items-center gap-3 overflow-hidden" aria-label="Tazkiyah, zur Startseite">
          <LogoMark size={30} />
          {!collapsed && <span className="font-display whitespace-nowrap text-base tracking-wide">Tazkiyah</span>}
        </a>
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            aria-label="Sidebar einklappen"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[var(--faint)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <MenuIcon />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={onToggleCollapse}
          aria-label="Sidebar ausklappen"
          className="mx-auto mb-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[var(--faint)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
        >
          <MenuIcon />
        </button>
      )}

      {collapsed ? (
        <div className="mt-2 flex flex-col items-center gap-1">
          {[
            { label: "Start", page: "home" },
            { label: "Screener", page: "screener" },
            { label: "Portfolio", page: "portfolio" },
            { label: "Berichte", page: "reports" },
            { label: "Watchlist", page: "watchlist", badge: watchlistCount },
            { label: "Akademie", page: "faq" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => onGo(item.page, item.anchor)}
              title={item.label}
              className={
                "relative flex h-9 w-9 items-center justify-center rounded-lg text-xs font-[IBM_Plex_Mono] " +
                (isActive(item) ? "bg-[var(--gold)]/15 text-[var(--gold-soft)]" : "text-[var(--text-soft)] hover:bg-[var(--surface)]")
              }
            >
              {item.label.slice(0, 2)}
              {item.badge > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-[var(--gold)] text-[8px] leading-[14px] text-[var(--bg)]">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        <button
          onClick={() => onGo("home")}
          className={
            "mb-1 flex w-full items-center rounded-lg px-3 py-2 text-left text-sm " +
            (page === "home" && !activeAnchor ? "bg-[var(--gold)]/15 text-[var(--gold-soft)]" : "text-[var(--text-soft)] hover:bg-[var(--surface)]")
          }
        >
          Start
        </button>

        {NAV_GROUPS.map((group) => (
          <div key={group.key} className="mb-1">
            <div className="flex items-center">
              <button
                onClick={() => onGo(group.page, group.anchor)}
                className={
                  "flex-1 rounded-lg px-3 py-2 text-left text-sm " +
                  (isActive(group) ? "bg-[var(--gold)]/15 text-[var(--gold-soft)]" : "text-[var(--text-soft)] hover:bg-[var(--surface)]")
                }
              >
                {group.label}
              </button>
              <button
                onClick={() => toggleGroup(group.key)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-[var(--faint)] hover:text-[var(--muted)]"
                aria-label={`${group.label} aufklappen`}
              >
                <NavIcon open={!!openGroups[group.key]} />
              </button>
            </div>
            {openGroups[group.key] && (
              <div className="ml-3 space-y-0.5 border-l border-[var(--border)] pl-3">
                {group.children.map((child, i) =>
                  child.type === "heading" ? (
                    <p key={i} className="px-3 pt-2 text-[10px] uppercase tracking-[0.15em] text-[var(--faint)]">
                      {child.label}
                    </p>
                  ) : (
                    <button
                      key={child.label}
                      onClick={() =>
                        child.type === "filter"
                          ? onGo("screener", null, child.filter)
                          : onGo(child.page, child.anchor, child.reset ? { type: "all" } : undefined)
                      }
                      className={
                        "block w-full truncate rounded-lg px-3 py-1.5 text-left text-[13px] " +
                        (child.type === "filter"
                          ? isFilterActive(child) ? "text-[var(--gold-soft)]" : "text-[var(--muted)] hover:text-[var(--text)]"
                          : isActive(child) ? "text-[var(--gold-soft)]" : "text-[var(--muted)] hover:text-[var(--text)]")
                      }
                    >
                      {child.type === "filter" && "· "}
                      {child.label}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}

        <button
          onClick={() => onGo("watchlist")}
          className={
            "mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm " +
            (page === "watchlist" ? "bg-[var(--gold)]/15 text-[var(--gold-soft)]" : "text-[var(--text-soft)] hover:bg-[var(--surface)]")
          }
        >
          Watchlist
          {watchlistCount > 0 && (
            <span className="rounded-full bg-[var(--gold)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--bg)]">
              {watchlistCount}{watchlistMax ? `/${watchlistMax}` : ""}
            </span>
          )}
        </button>

        <button
          onClick={() => onGo("faq")}
          className={
            "mb-1 flex w-full items-center rounded-lg px-3 py-2 text-left text-sm " +
            (page === "faq" ? "bg-[var(--gold)]/15 text-[var(--gold-soft)]" : "text-[var(--text-soft)] hover:bg-[var(--surface)]")
          }
        >
          Akademie
        </button>

        <button
          onClick={() => onGo("methodik")}
          className={
            "mb-1 flex w-full items-center rounded-lg px-3 py-2 text-left text-sm " +
            (page === "methodik" ? "bg-[var(--gold)]/15 text-[var(--gold-soft)]" : "text-[var(--text-soft)] hover:bg-[var(--surface)]")
          }
        >
          Methodik
        </button>

        {compareCount > 0 && (
          <button
            onClick={() => onGo("compare")}
            className={
              "mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm " +
              (page === "compare" ? "bg-[var(--gold)]/15 text-[var(--gold-soft)]" : "text-[var(--emerald-soft)] hover:bg-[var(--surface)]")
            }
          >
            Vergleich <span className="text-xs">({compareCount})</span>
          </button>
        )}
      </nav>
      )}

      {!collapsed && (
        <div className="border-t border-[var(--border)] px-5 py-4">
          {session ? (
            <div className="relative">
              <button
                onClick={() => setAccountMenuOpen((v) => !v)}
                className="flex w-full items-center justify-between text-xs text-[var(--muted)] hover:text-[var(--text)]"
              >
                <span className="truncate" title={session.user.email}>{session.user.email}</span>
                <span>{accountMenuOpen ? "▲" : "▼"}</span>
              </button>
              {accountMenuOpen && (
                <div className="mt-2 space-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
                  <button
                    onClick={() => { onGo("profile"); setAccountMenuOpen(false); }}
                    className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--faint)] hover:bg-[var(--bg-deep)] hover:text-[var(--gold-soft)]"
                  >
                    Profil
                  </button>
                  <button
                    onClick={() => { onGo("security"); setAccountMenuOpen(false); }}
                    className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--faint)] hover:bg-[var(--bg-deep)] hover:text-[var(--gold-soft)]"
                  >
                    Sicherheit
                  </button>
                  <button
                    onClick={() => { onGo("settings"); setAccountMenuOpen(false); }}
                    className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--faint)] hover:bg-[var(--bg-deep)] hover:text-[var(--gold-soft)]"
                  >
                    Einstellungen
                  </button>
                  <button
                    onClick={() => { onGo("privacy"); setAccountMenuOpen(false); }}
                    className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--faint)] hover:bg-[var(--bg-deep)] hover:text-[var(--gold-soft)]"
                  >
                    Datenschutz
                  </button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button
                    onClick={onSignOut}
                    className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--faint)] hover:bg-[var(--bg-deep)] hover:text-[var(--red-soft)]"
                  >
                    Abmelden
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="w-full rounded-full border border-[var(--border)] py-1.5 text-xs text-[var(--muted)] hover:border-[var(--gold)]/50 hover:text-[var(--gold-soft)]"
            >
              Anmelden / Registrieren
            </button>
          )}
          <p className="mt-2 text-[10px] text-[var(--faint)]">Keine Anlageberatung</p>
        </div>
      )}
    </aside>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

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
  // Auf schmalen Bildschirmen eingeklappt starten, sonst bleibt neben der Sidebar kaum Platz
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  // Wird das Fenster schmal, einklappen (z. B. Drehen des Telefons oder Verkleinern)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = (e) => e.matches && setSidebarCollapsed(true);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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

  // Sidebar-Klick: zur Seite navigieren, optional zu einem Abschnitt scrollen
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

  // Sidebar-Filter → Vorgabe für die Screener-Liste
  const screenerPreset = presetFilter
    ? {
        ts: presetFilter.ts,
        ...(presetFilter.type === "status" ? { statuses: [presetFilter.value] } : {}),
        ...(presetFilter.type === "sector" ? { sector: presetFilter.value } : {}),
      }
    : null;

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--text)] antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        /* Tazkiyah Dark Theme — einziges Theme */
        :root {
          --bg: #0E1613;
          --bg-deep: #0B100E;
          --surface: #121B17;
          --track: #1B2621;
          --border: #26332C;
          --text: #F2EFE9;
          --text-soft: #C9CFC9;
          --muted: #8B978F;
          --faint: #5B6560;
          --gold: #C9A66B;
          --gold-soft: #E4C68A;
          --emerald: #3E7C59;
          --emerald-soft: #8FC9A6;
          --red: #7C3E3E;
          --red-soft: #D68F8F;
          --amber: #8A6A2E;
          --amber-soft: #E0B368;
          --lattice-dot: rgba(201,166,107,0.14);
        }

        /* Inhaltsbreite neben der Sidebar: linksbündig, höchstens 1280 px.
           In der Komponenten-Ebene, damit Utilities wie max-w-2xl (Formulare) sie übersteuern. */
        @layer components {
          .page { width: 100%; max-width: 1280px; margin-inline: 0; padding-inline: clamp(16px, 3vw, 48px); box-sizing: border-box; }
        }

        .font-display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
        .font-body { font-family: 'Inter', sans-serif; }
        .bg-lattice {
          background-image: radial-gradient(circle at 1px 1px, var(--lattice-dot) 1px, transparent 0);
          background-size: 28px 28px;
        }
      `}</style>

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        page={page}
        activeAnchor={activeAnchor}
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

      <div
        style={{ marginLeft: sidebarCollapsed ? "4rem" : "15rem", transition: "margin-left 200ms ease" }}
      >
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
      </div>

      <Toast toast={wl.toast} onDismiss={wl.dismissToast} />

      {/* Floating Vergleichs-Leiste */}
      {compareTickers.length > 0 && page !== "compare" && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-3 shadow-xl">
          <span className="text-xs text-[var(--muted)]">{compareTickers.length} zum Vergleich ausgewählt</span>
          <button
            onClick={() => goTo("compare")}
            className="rounded-full bg-[var(--gold)] px-4 py-1.5 text-xs font-medium text-[var(--bg)] hover:opacity-90"
          >
            Vergleichen ansehen
          </button>
        </div>
      )}
    </div>
  );
}
