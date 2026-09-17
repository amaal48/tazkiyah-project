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
import { ShariaDetailWidget } from "./components/ShariaDetailWidget";
import { getMarketStatus } from "./utils/germanTradingCalendar";

/* ============================================================
   TAZKIYAH — Basis-Prototyp
   Enthält: Startseite + Aktien-Detailseite in einer Datei,
   per einfachem State-Switch navigierbar (als Grundlage gedacht,
   nicht als fertiges Routing).
   ============================================================ */

/* ---------- Gemeinsame Bausteine ---------- */

// Signatur-Element: achtzackiger Stern (Khatam) als Compliance-Badge
function ComplianceStar({ score = 92, size = 56, label = "Halal" }) {
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;
  const starPath = (cx, cy, rOuter, rInner) => {
    let pts = [];
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = (Math.PI / 8) * i - Math.PI / 2;
      pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
    }
    return `M${pts.join("L")}Z`;
  };
  const cx = size / 2;
  const cy = size / 2;
  return (
    <div className="relative inline-flex flex-col items-center gap-1.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--border)" strokeWidth="2" />
        <circle
          cx={cx} cy={cy} r={radius} fill="none" stroke="var(--gold)" strokeWidth="2"
          strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <path d={starPath(cx, cy, radius - 8, (radius - 8) * 0.55)} fill="var(--bg)" stroke="var(--gold-soft)" strokeWidth="1" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size * 0.22} fontFamily="IBM Plex Mono, monospace" fill="var(--gold-soft)">
          {score}
        </text>
      </svg>
      {label && <span className="text-[10px] tracking-[0.15em] uppercase text-[var(--muted)]">{label}</span>}
    </div>
  );
}

const CRITERIA_INFO = [
  ["Kerngeschäft", "Prüft, ob das Hauptgeschäft der Firma in einer erlaubten Branche liegt (z. B. keine Bank, kein Alkohol, keine Rüstung)."],
  ["Nebeneinnahmen", "Auch bei erlaubten Firmen darf nur ein kleiner Teil des Umsatzes aus unzulässigen Quellen wie Zinsen stammen."],
  ["Wesentlicher Umsatz", "Prüft, ob ein Großteil des Umsatzes aus unzulässigen Geschäftsfeldern wie dem Zinsgeschäft stammt."],
  ["Fondsbasis", "Bei ETFs/Fonds wird geprüft, in welche Branchen die zugrunde liegenden Werte investieren."],
  ["konventionellen Banken", "Prüft, ob der Fonds Anteile an klassischen, zinsbasierten Banken hält."],
  ["einzeln gescreent", "Jede einzelne Position im Fonds wird separat nach den gleichen Kriterien geprüft."],
];
function getCriterionInfo(label) {
  const hit = CRITERIA_INFO.find(([key]) => label.includes(key));
  return hit ? hit[1] : "Teil der Sharia-Screening-Prüfung.";
}

function Criterion({ b }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className={"mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] " +
        (b.pass ? "bg-[var(--emerald)]/20 text-[var(--emerald-soft)]" : "bg-[var(--red)]/20 text-[var(--red-soft)]")}>
        {b.pass ? "✓" : "✕"}
      </span>
      <span className="text-[var(--text-soft)]">{b.label}</span>
      <span
        title={getCriterionInfo(b.label)}
        className="ml-auto flex h-4 w-4 flex-shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--border)] text-[9px] text-[var(--faint)] hover:border-[var(--muted)] hover:text-[var(--muted)]"
      >
        ?
      </span>
    </li>
  );
}

function getWhyText(stock) {
  if (stock.assetType === "ETF") {
    return "Halal, weil alle enthaltenen Positionen bereits bei der Index-Aufnahme einzeln nach Sharia-Kriterien geprüft werden — die Konformität ergibt sich aus der Indexmethodik, nicht aus einer fondsweiten Finanzkennzahl.";
  }
  if (stock.status === "Nicht Halal") {
    const failedBiz = stock.business.find((b) => !b.pass);
    if (failedBiz) return `Nicht Halal, weil: ${failedBiz.label}.`;
    const failedRatio = stock.financials.find((f) => f.value > f.max);
    if (failedRatio) return `Nicht Halal, weil ${failedRatio.label} bei ${failedRatio.value}% liegt (erlaubt: max. ${failedRatio.max}%).`;
    return "Diese Aktie erfüllt mindestens ein Ausschlusskriterium.";
  }
  if (stock.status === "Grenzwertig") {
    return stock.note || "Mindestens eine Kennzahl liegt nah am AAOIFI-Grenzwert und sollte regelmäßig neu geprüft werden.";
  }
  return "Alle Geschäftsmodell- und Finanz-Kriterien liegen innerhalb der AAOIFI-Grenzwerte.";
}

const STATUS_STYLES = {
  "Halal": { text: "text-[var(--emerald-soft)]", bg: "bg-[var(--emerald)]/15", border: "border-[var(--emerald)]/40", dot: "bg-[var(--emerald-soft)]" },
  "Grenzwertig": { text: "text-[var(--amber-soft)]", bg: "bg-[var(--amber)]/15", border: "border-[var(--amber)]/40", dot: "bg-[var(--amber-soft)]" },
  "Nicht Halal": { text: "text-[var(--red-soft)]", bg: "bg-[var(--red)]/15", border: "border-[var(--red)]/40", dot: "bg-[var(--red-soft)]" },
};

function StatusPill({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES["Nicht Halal"];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] tracking-wide uppercase border ${s.bg} ${s.text} ${s.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function RatioBar({ label, value, max }) {
  const pct = Math.min(100, (value / max) * 100);
  const over = value > max;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="font-[IBM_Plex_Mono]">
          <span className={over ? "text-[var(--red-soft)]" : "text-[var(--emerald-soft)]"}>Dein Wert: {value}%</span>
          <span className="text-[var(--faint)]"> · Erlaubt: max. {max}%</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
        <div className={"h-full rounded-full " + (over ? "bg-[var(--red-soft)]" : "bg-[var(--emerald)]")} style={{ width: `${pct}%` }} />
      </div>
    </div>
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
        <div className="flex gap-1 rounded-full border border-[var(--border)] p-1">
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

// Echte Screening-Ergebnisse aus eurer CSV (503 Unternehmen) statt Fantasie-Daten.
const sampleStocks = ALL_STOCKS;

// Portfolio-Beispiel: 4 real vorhandene Titel mit angenommenen Gewichtungen
// (die Gewichtung selbst ist weiterhin frei erfunden — echte Portfolios kommen
// erst mit Nutzerkonten/Depot-Anbindung).
const holdings = ["MSFT", "NVDA", "GOOGL", "JPM"]
  .map((t) => sampleStocks.find((s) => s.ticker === t))
  .filter(Boolean)
  .map((s, i) => ({ ticker: s.ticker, weight: [38, 27, 20, 15][i], status: s.status }));

/* ---------- Startseite ---------- */

function StockCard({ s, expanded, onToggle }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--emerald)]/60">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <div className="flex items-center gap-4">
          <ComplianceStar score={s.score} size={48} label={s.status === "Halal" ? "Halal" : s.status === "Grenzwertig" ? "Prüfen" : "Nicht Halal"} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-[IBM_Plex_Mono] text-sm text-[var(--text)] tracking-wide">{s.ticker}</span>
              {s.assetType === "ETF" && (
                <span className="rounded-full border border-[var(--gold)]/40 px-1.5 py-0.5 text-[10px] uppercase text-[var(--gold-soft)]">ETF</span>
              )}
              <StatusPill status={s.status} />
            </div>
            <p className="mt-1 text-[15px] text-[var(--text)]/90">{s.name}</p>
            <p className="text-xs text-[var(--muted)]">
              {s.sector}{s.assetType !== "ETF" && ` · Verschuldung ${s.debt}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right" title={`Original: ${s.price}`}>
            <p className="font-[IBM_Plex_Mono] text-sm text-[var(--text)]">
              {(parseEuro(s.price) * USD_EUR_RATE).toFixed(2).replace(".", ",")} €
            </p>
            <p className={"font-[IBM_Plex_Mono] text-xs " + (s.up ? "text-[var(--emerald-soft)]" : "text-[var(--red-soft)]")}>{s.change}</p>
          </div>
          <span className={"text-[var(--faint)] transition-transform " + (expanded ? "rotate-180" : "")}>⌄</span>
        </div>
      </button>

      {expanded && (
        <div className="grid gap-6 border-t border-[var(--border)] px-5 py-5 md:grid-cols-2">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Geschäftsmodell-Screen</p>
            <ul className="space-y-2">
              {s.business.map((b, i) => <Criterion key={i} b={b} />)}
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              {s.assetType === "ETF" ? "Screening-Methodik" : "Finanz-Ratios (AAOIFI-Grenzwerte)"}
            </p>
            {s.assetType === "ETF" ? (
              <p className="text-xs leading-relaxed text-[var(--text-soft)]">
                Bei ETFs wird jede enthaltene Position bereits bei der Index-Aufnahme einzeln
                gescreent — die Konformität steckt in der Indexmethodik, nicht in einer
                fondsweiten Kennzahl.
              </p>
            ) : (
              <div className="space-y-3">{s.financials.map((f, i) => <RatioBar key={i} {...f} />)}</div>
            )}
            {s.purification != null && (
              <p className="mt-4 text-xs text-[var(--muted)]">
                Spendenanteil auf Dividenden: geschätzt{" "}
                <span className="text-[var(--gold-soft)] font-[IBM_Plex_Mono]">{s.purification}%</span>{" "}
                zur Bereinigung unzulässiger Nebeneinnahmen.
              </p>
            )}
            {s.note && (
              <p className="mt-4 rounded-lg border border-[var(--amber)]/40 bg-[var(--amber)]/10 px-3 py-2 text-xs text-[var(--amber-soft)]">
                ⚠ {s.note}
              </p>
            )}
            <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-soft)]">
              <span className="font-medium text-[var(--text)]">Warum {s.status}? </span>
              {getWhyText(s)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const SECTORS = [...new Set(sampleStocks.map((s) => s.sector))].sort();
const STATUSES = ["Halal", "Grenzwertig", "Nicht Halal"];

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-xs transition-colors " +
        (active
          ? "border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold-soft)]"
          : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--emerald)]/60")
      }
    >
      {children}
    </button>
  );
}

function HomePage({ onOpenStock, onNavigate, watchlist, onToggleWatchlist, compareTickers, onToggleCompare, presetFilter }) {
  const [query, setQuery] = useState("");
  const [expandedTicker, setExpandedTicker] = useState("MSFT");
  const [dividend, setDividend] = useState("1000");

  // Screener: Suche + Filter (Schritt 1 aus dem UX-Plan)
  const [screenerQuery, setScreenerQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeStatuses, setActiveStatuses] = useState([]);
  const [activeSectors, setActiveSectors] = useState([]);
  const [maxDebt, setMaxDebt] = useState(70);
  const [sortBy, setSortBy] = useState("score");
  const [showFilters, setShowFilters] = useState(false);

  // Von der Sidebar gesetzter Status-/Sektor-Filter übernehmen
  React.useEffect(() => {
    if (!presetFilter) return;
    setShowFilters(true);
    if (presetFilter.type === "status") setActiveStatuses([presetFilter.value]);
    if (presetFilter.type === "sector") setActiveSectors([presetFilter.value]);
  }, [presetFilter]);

  const toggleStatus = (s) =>
    setActiveStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const toggleSector = (s) =>
    setActiveSectors((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const suggestions = screenerQuery
    ? sampleStocks.filter(
        (s) =>
          s.ticker.toLowerCase().includes(screenerQuery.toLowerCase()) ||
          s.name.toLowerCase().includes(screenerQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  const filteredStocks = sampleStocks
    .filter((s) => (screenerQuery ? suggestions.includes(s) : true))
    .filter((s) => (activeStatuses.length ? activeStatuses.includes(s.status) : true))
    .filter((s) => (activeSectors.length ? activeSectors.includes(s.sector) : true))
    .filter((s) => (s.debt === "—" || s.debt === "–" ? true : parseInt(s.debt) <= maxDebt))
    .sort((a, b) => {
      if (sortBy === "score") return b.score - a.score;
      if (sortBy === "az") return a.name.localeCompare(b.name);
      if (sortBy === "price") return parseEuro(b.price) - parseEuro(a.price);
      if (sortBy === "debt") return parseFloat(a.debt) - parseFloat(b.debt);
      return 0;
    });

  // Pagination: bei über 500 Titeln nicht alles auf einmal rendern
  const [visibleCount, setVisibleCount] = useState(30);
  const [shariaModalTicker, setShariaModalTicker] = useState(null);
  useEffect(() => {
    setVisibleCount(30);
  }, [screenerQuery, activeStatuses, activeSectors, maxDebt, sortBy]);
  const visibleStocks = filteredStocks.slice(0, visibleCount);

  const activeFilterChips = [
    ...activeStatuses.map((s) => ({ type: "status", value: s })),
    ...activeSectors.map((s) => ({ type: "sector", value: s })),
    ...(maxDebt < 70 ? [{ type: "debt", value: `Verschuldung ≤ ${maxDebt}%` }] : []),
  ];

  function removeFilterChip(chip) {
    if (chip.type === "status") toggleStatus(chip.value);
    if (chip.type === "sector") toggleSector(chip.value);
    if (chip.type === "debt") setMaxDebt(70);
  }

  const halalWeight = holdings.filter((h) => h.status === "Halal").reduce((sum, h) => sum + h.weight, 0);
  const purificationRate = 0.018;
  const dividendNum = parseFloat(dividend.replace(",", ".")) || 0;
  const purifyAmount = (dividendNum * purificationRate).toFixed(2);

  return (
    <div className="font-body">
      {/* HEADER (Navigation liegt jetzt in der linken Sidebar) */}
      <header className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <ComplianceStar score={100} size={34} label="" />
          <span className="font-display text-lg tracking-wide">Tazkiyah</span>
        </div>
        <button className="rounded-full border border-[var(--gold)]/50 px-4 py-2 text-sm text-[var(--gold-soft)] transition-colors hover:bg-[var(--gold)]/10">
          Kostenlos starten
        </button>
      </header>

      {/* HERO */}
      <section className="bg-lattice relative mx-auto max-w-[1440px] px-6 pb-20 pt-12">
        <div className="grid items-center gap-12 md:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="mb-4 text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
              Halal Investieren · Datenbasierte Aktienanalyse
            </p>
            <h1 className="font-display text-5xl leading-[1.1] tracking-tight text-[var(--text)] md:text-6xl">
              Investiere nach deinen Werten.
              <br />
              <span className="text-[var(--gold-soft)]">Entscheide mit Daten.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--muted)]">
              Tazkiyah prüft jede Aktie nach Sharia-Kriterien und liefert dir
              verständliche Markteinschätzungen — auch mit kleinem Budget.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setScreenerQuery(query);
                setShowSuggestions(true);
                document.getElementById("screener")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="mt-8 flex max-w-lg items-center rounded-full border border-[var(--border)] bg-[var(--surface)] pl-5 pr-1.5 py-1.5"
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Aktie, ETF oder ISIN suchen…"
                className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
              />
              <button type="submit" className="rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-medium text-[var(--bg)] transition-opacity hover:opacity-90">
                Prüfen
              </button>
            </form>
            <p className="mt-3 text-xs text-[var(--faint)]">z. B. „NVDA", „ICLN" oder „DE0005557508"</p>

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted)]">
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[var(--gold)]" /> Unabhängig von Brokern
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[var(--gold)]" /> Keine Pflicht zur Depoteröffnung
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[var(--gold)]" /> Keine Produktbindung
              </span>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="relative flex h-72 w-72 items-center justify-center rounded-full border border-[var(--border)]">
              <div className="absolute h-56 w-56 rounded-full border border-[var(--border)]" />
              <ComplianceStar score={94} size={160} label="Ø Portfolio-Score" />
            </div>
          </div>
        </div>
      </section>

      {/* TOP-LISTEN */}
      <section className="mx-auto max-w-[1440px] px-6 pb-4 pt-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { title: "Top nach Score", desc: "Höchste Sharia-Scores zuerst", action: () => { setActiveStatuses(["Halal"]); setSortBy("score"); } },
            { title: "Grenzwertige Titel", desc: "Kennzahlen knapp über dem Limit — regelmäßig neu prüfen", action: () => { setActiveStatuses(["Grenzwertig"]); setSortBy("score"); } },
            { title: "Niedrigste Verschuldung", desc: "Solideste Bilanzen zuerst", action: () => { setActiveStatuses(["Halal"]); setSortBy("debt"); } },
          ].map((tile) => (
            <a
              key={tile.title}
              href="#screener"
              onClick={tile.action}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-5 transition-colors hover:border-[var(--emerald)]/60"
            >
              <p className="text-[15px] text-[var(--text)]">{tile.title}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{tile.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* SCREENER: Sticky Search + Filter + dreistufige Ergebnisliste */}
      <section id="screener" className="mx-auto max-w-[1440px] px-6 py-16">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Screener</p>
            <h2 className="font-display mt-2 text-2xl text-[var(--text)]">Aktien durchsuchen</h2>
            <p className="mt-1 text-xs text-[var(--faint)]">
              Volle Filterung nach Status, Sektor & Verschuldung · Kurse sind Demo-Werte, Score ist eine vereinfachte Kennzahl aus Verschuldung/Cash-Quote
            </p>
          </div>
        </div>

        {/* Sticky Search */}
        <div className="sticky top-0 z-20 -mx-6 bg-[var(--bg)]/95 px-6 py-3 backdrop-blur">
          <div className="relative">
            <div className="flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-3">
              <input
                value={screenerQuery}
                onChange={(e) => { setScreenerQuery(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Ticker, Firmenname oder ISIN suchen…"
                className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
              />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={
                  "flex-shrink-0 rounded-full border px-4 py-1.5 text-xs " +
                  (showFilters ? "border-[var(--gold)] text-[var(--gold-soft)]" : "border-[var(--border)] text-[var(--muted)]")
                }
              >
                Filter {activeFilterChips.length > 0 && `(${activeFilterChips.length})`}
              </button>
            </div>

            {/* Live-Vorschläge während des Tippens */}
            {showSuggestions && screenerQuery && (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
                {suggestions.length === 0 && (
                  <p className="px-5 py-4 text-sm text-[var(--faint)]">Keine Treffer für „{screenerQuery}"</p>
                )}
                {suggestions.map((s) => (
                  <button
                    key={s.ticker}
                    onMouseDown={() => onOpenStock(s.ticker)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-[var(--track)]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-[IBM_Plex_Mono] text-xs text-[var(--muted)]">{s.ticker}</span>
                      <span className="text-sm text-[var(--text)]">{s.name}</span>
                    </div>
                    <StatusPill status={s.status} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filter-Panel (aufklappbar) */}
        {showFilters && (
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <FilterChip key={s} active={activeStatuses.includes(s)} onClick={() => toggleStatus(s)}>
                      {s}
                    </FilterChip>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Sektor</p>
                <div className="flex flex-wrap gap-2">
                  {SECTORS.map((s) => (
                    <FilterChip key={s} active={activeSectors.includes(s)} onClick={() => toggleSector(s)}>
                      {s}
                    </FilterChip>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  <span>Verschuldung ≤</span>
                  <span className="font-[IBM_Plex_Mono] normal-case tracking-normal text-[var(--gold-soft)]">{maxDebt}%</span>
                </div>
                <input
                  type="range" min="0" max="70" value={maxDebt}
                  onChange={(e) => setMaxDebt(parseInt(e.target.value))}
                  className="w-full accent-[var(--gold)]"
                />
                <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  <span>Sortierung</span>
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none"
                >
                  <option value="score">Nach Score</option>
                  <option value="price">Nach Kurs</option>
                  <option value="debt">Nach Verschuldung (aufsteigend)</option>
                  <option value="az">Alphabetisch</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Aktive Filter-Chips */}
        {activeFilterChips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {activeFilterChips.map((chip, i) => (
              <button
                key={i}
                onClick={() => removeFilterChip(chip)}
                className="flex items-center gap-1.5 rounded-full border border-[var(--emerald)]/40 bg-[var(--emerald)]/10 px-3 py-1 text-xs text-[var(--emerald-soft)]"
              >
                {chip.value} <span className="text-[var(--emerald-soft)]/70">✕</span>
              </button>
            ))}
            <button
              onClick={() => { setActiveStatuses([]); setActiveSectors([]); setMaxDebt(70); }}
              className="text-xs text-[var(--faint)] hover:text-[var(--muted)]"
            >
              Alle zurücksetzen
            </button>
          </div>
        )}

        {/* Ergebnisliste */}
        <div className="mt-6 mb-3 flex items-center justify-between">
          <p className="text-xs text-[var(--faint)]">
            {filteredStocks.length} {filteredStocks.length === 1 ? "Titel" : "Titel"} gefunden
            {filteredStocks.length > visibleStocks.length && ` · ${visibleStocks.length} angezeigt`}
          </p>
        </div>
        <div className="grid gap-3">
          {filteredStocks.length === 0 && (
            <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center text-sm text-[var(--muted)]">
              Keine Aktien passen zu den aktuellen Filtern.
            </p>
          )}
          {visibleStocks.map((s) => (
            <div key={s.ticker}>
              <StockCard
                s={s}
                expanded={expandedTicker === s.ticker}
                onToggle={() => setExpandedTicker(expandedTicker === s.ticker ? null : s.ticker)}
              />
              <div className="ml-2 mt-1 flex items-center gap-4 text-xs">
                <button onClick={() => onOpenStock(s.ticker)} className="text-[var(--faint)] hover:text-[var(--muted)]">
                  Zur Detailseite →
                </button>
                <button onClick={() => setShariaModalTicker(s.ticker)} className="text-[var(--faint)] hover:text-[var(--muted)]">
                  Sharia-Details
                </button>
                <button
                  onClick={() => onToggleWatchlist(s.ticker)}
                  className={watchlist.includes(s.ticker) ? "text-[var(--gold-soft)]" : "text-[var(--faint)] hover:text-[var(--muted)]"}
                >
                  {watchlist.includes(s.ticker) ? "✓ In Watchlist" : "+ Watchlist"}
                </button>
                <label className="flex items-center gap-1.5 text-[var(--faint)] hover:text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={compareTickers.includes(s.ticker)}
                    onChange={() => onToggleCompare(s.ticker)}
                    className="accent-[var(--gold)]"
                  />
                  Vergleichen
                </label>
              </div>
            </div>
          ))}
        </div>
        {filteredStocks.length > visibleStocks.length && (
          <div className="mt-5 flex justify-center">
            <button
              onClick={() => setVisibleCount((c) => c + 30)}
              className="rounded-full border border-[var(--border)] px-5 py-2 text-sm text-[var(--muted)] hover:border-[var(--gold)]/50 hover:text-[var(--gold-soft)]"
            >
              Weitere {Math.min(30, filteredStocks.length - visibleStocks.length)} von {filteredStocks.length - visibleStocks.length} laden
            </button>
          </div>
        )}
      </section>

      {/* PORTFOLIO */}
      <section id="portfolio" className="mx-auto max-w-[1440px] px-6 pb-16">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Portfolio</p>
        <h2 className="font-display mt-2 text-2xl text-[var(--text)]">Deine Portfolio-Reinheit</h2>
        <div className="mt-6 grid gap-8 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 md:grid-cols-[auto_1fr] md:p-8">
          <div className="flex flex-shrink-0 justify-center">
            <ComplianceStar score={halalWeight} size={120} label="Halal-Anteil" />
          </div>
          <div>
            <div className="mb-4 h-3 w-full overflow-hidden rounded-full bg-[var(--track)]">
              {holdings.map((h) => (
                <div
                  key={h.ticker}
                  className={"float-left h-full " + (h.status === "Halal" ? "bg-[var(--emerald)]" : "bg-[var(--red)]")}
                  style={{ width: `${h.weight}%` }}
                  title={`${h.ticker} · ${h.weight}%`}
                />
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {holdings.map((h) => (
                <div key={h.ticker} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                  <span className="font-[IBM_Plex_Mono] text-[var(--text)]">{h.ticker}</span>
                  <span className="text-[var(--muted)]">{h.weight}% Gewichtung</span>
                  <StatusPill status={h.status} />
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-[var(--muted)]">
              {holdings.filter((h) => h.status !== "Halal").length} Position mit Klärungsbedarf —
              reduziere sie oder gleiche sie über den Reinheits-Rechner aus.
            </p>
          </div>
        </div>
      </section>

      {/* REINHEITS-RECHNER */}
      <section id="rechner" className="mx-auto max-w-[1440px] px-6 pb-16">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Werkzeug</p>
        <h2 className="font-display mt-2 text-2xl text-[var(--text)]">Reinheits-Rechner für Dividenden</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Auch bei Halal-konformen Aktien enthalten Dividenden oft einen kleinen Anteil aus
          unzulässigen Nebeneinnahmen (z. B. Zinserträge). Dieser Anteil sollte gespendet werden.
        </p>
        <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:flex-row sm:items-center sm:justify-between md:p-8">
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--muted)]">Erhaltene Dividende</span>
            <div className="flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-4 py-2">
              <span className="mr-1 text-[var(--muted)]">€</span>
              <input
                value={dividend}
                onChange={(e) => setDividend(e.target.value)}
                className="w-24 bg-transparent font-[IBM_Plex_Mono] text-sm text-[var(--text)] focus:outline-none"
              />
            </div>
          </div>
          <div className="h-px w-full bg-[var(--border)] sm:h-10 sm:w-px" />
          <div className="text-right sm:text-left">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Geschätzter Spendenanteil</p>
            <p className="font-[IBM_Plex_Mono] text-2xl text-[var(--gold-soft)]">{purifyAmount} €</p>
          </div>
        </div>
      </section>

      {/* MARKTBERICHT (vormals "KI-Agent") */}
      <section id="bericht" className="mx-auto max-w-[1440px] px-6 pb-24">
        <div className="rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--bg)] p-8 md:p-10">
          <div className="grid gap-10 md:grid-cols-[1fr_1fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Marktbericht</p>
              <h2 className="font-display mt-2 text-2xl text-[var(--text)]">Diese Woche im Überblick</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-[var(--muted)]">
                Halal-konforme KI-Infrastrukturwerte zeigen relative Stärke gegenüber dem
                Gesamtmarkt. Clean-Energy-ETFs profitieren von sinkenden Finanzierungskosten.
                Bei Halal-Fintechs bleibt die Verschuldungsquote im Sektor stabil unter 20%.
              </p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.15em] text-[var(--faint)]">
                Automatisch erstellt · Keine Anlageberatung
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["KI-Infrastruktur", "Clean Energy", "Halal-Fintech"].map((tag) => (
                  <span key={tag} className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                    {tag}
                  </span>
                ))}
              </div>
              <button className="mt-7 rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-medium text-[var(--bg)] hover:opacity-90">
                Vollständigen Bericht lesen
              </button>
            </div>
            <div className="flex flex-col justify-center gap-4 border-t border-[var(--border)] pt-6 md:border-l md:border-t-0 md:pl-10 md:pt-0">
              {[
                { label: "Geprüfte Werte", value: sampleStocks.length.toLocaleString("de-DE") },
                { label: "Ø Sharia-Score", value: `${Math.round(sampleStocks.reduce((sum, s) => sum + s.score, 0) / sampleStocks.length)} / 100` },
                { label: "Davon Halal", value: `${sampleStocks.filter((s) => s.status === "Halal").length}` },
              ].map((stat) => (
                <div key={stat.label} className="flex items-baseline justify-between">
                  <span className="text-sm text-[var(--muted)]">{stat.label}</span>
                  <span className="font-[IBM_Plex_Mono] text-lg text-[var(--gold-soft)]">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-[1440px] px-6 pb-10 text-xs text-[var(--faint)]">
        Tazkiyah · Screening orientiert an AAOIFI-Standards · Unabhängig, keine Depot- oder Produktbindung · Keine Anlageberatung
      </footer>

      {shariaModalTicker && (
        <ShariaDetailWidget
          stock={sampleStocks.find((s) => s.ticker === shariaModalTicker)}
          variant="modal"
          open
          onClose={() => setShariaModalTicker(null)}
        />
      )}
    </div>
  );
}

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

function StockDetailPage({ onBack, ticker, watchlist, onToggleWatchlist, onOpenStock }) {
  const [showSignup, setShowSignup] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const stock = sampleStocks.find((s) => s.ticker === ticker) || sampleStocks[0];
  const saved = watchlist.includes(stock.ticker);
  const priceNum = parseEuro(stock.price);
  const dayPct = parsePercent(stock.change);
  const dayAbs = (priceNum * dayPct) / (100 + dayPct);
  const marketStatus = getMarketStatus("XETRA");

  useEffect(() => {
    setLastUpdated(new Date());
  }, [ticker]);

  function handleSave() {
    if (!saved) setShowSignup(true);
    else onToggleWatchlist(stock.ticker);
  }

  function confirmSignupAndSave() {
    onToggleWatchlist(stock.ticker);
    setShowSignup(false);
  }

  const similarStocks = sampleStocks
    .filter((s) => s.sector === stock.sector && s.status === "Halal" && s.ticker !== stock.ticker)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return (
    <div className="font-body">
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-6 text-sm text-[var(--muted)]">
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Screener</span>
        <span>/</span>
        <span className="text-[var(--text)]">{stock.ticker}</span>
        <div className="ml-auto flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-1.5">
          <input defaultValue={stock.ticker} className="w-40 bg-transparent text-sm text-[var(--text)] focus:outline-none" placeholder="Suchen…" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24">
        <div className="flex flex-col items-start justify-between gap-6 border-b border-[var(--border)] pb-8 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-[IBM_Plex_Mono] text-lg tracking-wide text-[var(--text)]">{stock.ticker}</span>
              {stock.assetType === "ETF" && (
                <span className="rounded-full border border-[var(--gold)]/40 px-1.5 py-0.5 text-[10px] uppercase text-[var(--gold-soft)]">ETF</span>
              )}
              <StatusPill status={stock.status} />
            </div>
            <h1 className="font-display mt-1 text-3xl text-[var(--text)]">{stock.name}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">{stock.sector}</p>
            <div className="mt-4 flex items-baseline gap-3">
              <span className="font-[IBM_Plex_Mono] text-2xl text-[var(--text)]">{(priceNum * USD_EUR_RATE).toFixed(2).replace(".", ",")} €</span>
              <span className="font-[IBM_Plex_Mono] text-sm text-[var(--faint)]">≈ {stock.price}</span>
              <span className={"font-[IBM_Plex_Mono] text-sm " + (stock.up ? "text-[var(--emerald-soft)]" : "text-[var(--red-soft)]")}>
                {stock.up ? "+" : ""}{dayPct.toFixed(2)}% ({stock.up ? "+" : ""}{(dayAbs * USD_EUR_RATE).toFixed(2).replace(".", ",")} €) heute
              </span>
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--faint)]">
              <span>
                Zuletzt aktualisiert: {lastUpdated ? lastUpdated.toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—"} · Demo-Kurs · Euro-Wert: fixer Näherungskurs (1 $ ≈ {USD_EUR_RATE} €, Stand Sept. 2026), keine Live-Umrechnung — Originalwährung ist $, da US-notiert
              </span>
              <span
                className={
                  "rounded-full border px-2 py-0.5 " +
                  (marketStatus.open ? "border-[var(--emerald)]/40 text-[var(--emerald-soft)]" : "border-[var(--border)] text-[var(--faint)]")
                }
              >
                {marketStatus.venue}: {marketStatus.open ? "Geöffnet" : "Geschlossen"}
              </span>
            </p>
          </div>
          <ComplianceStar score={stock.score} size={88} label="Sharia-Score" />
        </div>

        {/* ECKDATEN — feste Feldreihenfolge PRO ASSET-TYP (Aktie vs. ETF haben unterschiedliche
            sinnvolle Kennzahlen, aber innerhalb eines Typs ist die Struktur bei jedem Titel gleich) */}
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
          {(stock.assetType === "ETF"
            ? [
                { label: "ISIN", value: stock.eckdaten?.isin ?? "–" },
                { label: "WKN", value: stock.eckdaten?.wkn ?? "–" },
                { label: "Sektor", value: stock.eckdaten?.sector ?? "–" },
                { label: "Replikation", value: stock.eckdaten?.replication ?? "–" },
                { label: "TER (Kosten p.a.)", value: stock.eckdaten?.ter ?? "–" },
                { label: "Anzahl Positionen", value: stock.eckdaten?.holdingsCount ?? "–" },
                { label: "Ausschüttung", value: stock.eckdaten?.dividendYield ?? "–" },
                { label: "Sparplanfähig", value: stock.eckdaten?.sparplanfaehig ?? "–" },
              ]
            : [
                { label: "Marktkap.", value: stock.eckdaten?.marketCapEUR ?? "–", original: stock.eckdaten?.marketCap },
                { label: "Sektor", value: stock.eckdaten?.sector ?? "–" },
                { label: "Branche", value: stock.eckdaten?.industry ?? "–" },
                { label: "KGV", value: stock.eckdaten?.peRatio ?? "–" },
                { label: "EV/EBITDA", value: stock.eckdaten?.evEbitda ?? "–" },
                { label: "EPS-Wachstum", value: stock.eckdaten?.epsGrowth ?? "–" },
                { label: "Dividendenrendite", value: stock.eckdaten?.dividendYield ?? "–" },
                { label: "52W-Range", value: stock.eckdaten?.week52RangeEUR ?? "–", original: stock.eckdaten?.week52Range },
              ]
          ).map((f) => (
            <div key={f.label} className="bg-[var(--surface)] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--faint)]">{f.label}</p>
              <p
                className="mt-1 truncate text-sm text-[var(--text)]"
                title={f.original ? `Original: ${f.original}` : f.value}
              >
                {f.value}
              </p>
            </div>
          ))}
        </div>
        {stock.assetType !== "ETF" && stock.eckdaten && (
          <p className="mt-1.5 text-[10px] text-[var(--faint)]">
            Marktkap. & 52W-Range in € umgerechnet (fixer Näherungskurs, s.o.) — Originalwerte in $ beim Überfahren mit der Maus (Tooltip)
          </p>
        )}
        {stock.assetType === "ETF" && (
          <p className="mt-1.5 text-[10px] text-[var(--faint)]">
            ISIN/WKN/TER/Replikation sind echte, verifizierte Fondsdaten — nur der Kurs ist wie bei den Aktien ein Demo-Wert.
          </p>
        )}

        {/* UNTERNEHMENSPROFIL — feste Position, jede Aktie hat diesen Block */}
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <p className="mb-1.5 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Unternehmensprofil</p>
          <p className="text-sm leading-relaxed text-[var(--text-soft)]">{stock.profile ?? "Kein Profil hinterlegt."}</p>
        </div>

        <StockChart stock={stock} />

        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={handleSave} className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-medium text-[var(--bg)] hover:opacity-90">
            {saved ? "In der Watchlist ✓" : "Zur Watchlist hinzufügen"}
          </button>
          <button onClick={handleSave} className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text)] hover:border-[var(--emerald)]/60">
            Ins Portfolio buchen
          </button>
        </div>

        {/* TERMINE & EVENTS — feste Sektion, identisch bei jeder Aktie */}
        <div className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Termine & Events</p>
            <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--faint)]">Demo-Termine</span>
          </div>
          <p className="mb-5 text-[11px] text-[var(--faint)]">
            Platzhalterdaten — noch keine echte Kalenderanbindung.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.15em] text-[var(--faint)]">Hauptversammlung</p>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3">
                <div>
                  <p className="text-sm text-[var(--text)]">{formatEventDate(stock.events.agm.date)}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {stock.events.agm.status === "Bevorstehend"
                      ? `in ${daysUntil(stock.events.agm.date)} Tagen`
                      : "kürzlich stattgefunden"}
                  </p>
                </div>
                <span
                  className={
                    "rounded-full border px-2.5 py-1 text-[11px] " +
                    (stock.events.agm.status === "Bevorstehend"
                      ? "border-[var(--gold)]/40 text-[var(--gold-soft)]"
                      : "border-[var(--border)] text-[var(--faint)]")
                  }
                >
                  {stock.events.agm.status}
                </span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.15em] text-[var(--faint)]">Earnings & Konferenzen</p>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3">
                <div>
                  <p className="text-sm text-[var(--text)]">{formatEventDate(stock.events.nextEarnings.date)}</p>
                  <p className="text-xs text-[var(--muted)]">Quartalszahlen (Earnings Call)</p>
                </div>
                <span className="rounded-full border border-[var(--emerald)]/40 px-2.5 py-1 text-[11px] text-[var(--emerald-soft)]">
                  in {daysUntil(stock.events.nextEarnings.date)} Tagen
                </span>
              </div>
            </div>
          </div>

          <p className="mb-2 mt-6 text-[11px] uppercase tracking-[0.15em] text-[var(--faint)]">Kompakte Terminübersicht</p>
          <div className="space-y-2">
            {stock.events.timeline.map((e, i) => {
              const style = EVENT_TYPE_STYLE[e.type] || EVENT_TYPE_STYLE.Dividende;
              return (
                <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
                  <span className={"h-1.5 w-1.5 flex-shrink-0 rounded-full " + style.dot} />
                  <span className="w-24 flex-shrink-0 font-[IBM_Plex_Mono] text-xs text-[var(--muted)]">{formatEventDate(e.date)}</span>
                  <span className={style.text}>{e.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-10 grid gap-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:grid-cols-2 md:p-8">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Geschäftsmodell-Screen</p>
            <ul className="space-y-2">
              {stock.business.map((b, i) => <Criterion key={i} b={b} />)}
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              {stock.assetType === "ETF" ? "Screening-Methodik" : "Finanz-Ratios (AAOIFI-Grenzwerte)"}
            </p>
            {stock.assetType === "ETF" ? (
              <p className="text-sm leading-relaxed text-[var(--text-soft)]">
                Finanzkennzahlen wie Verschuldungsquote gelten für einzelne Unternehmen, nicht für
                einen Fonds als Ganzes. Bei ETFs wird stattdessen jede enthaltene Position bereits
                bei der Index-Aufnahme einzeln gescreent — die Konformität steckt in der
                Indexmethodik selbst, nicht in einer fondsweiten Kennzahl.
              </p>
            ) : (
              <div className="space-y-3">{stock.financials.map((f, i) => <RatioBar key={i} {...f} />)}</div>
            )}
            {stock.purification != null && (
              <p className="mt-4 text-xs text-[var(--muted)]">
                Spendenanteil auf Dividenden: geschätzt{" "}
                <span className="font-[IBM_Plex_Mono] text-[var(--gold-soft)]">{stock.purification}%</span>
                {" "}·{" "}
                <span className="cursor-pointer text-[var(--gold-soft)] hover:underline">Zum Reinheits-Rechner</span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <p className="text-sm text-[var(--text-soft)]">
            <span className="font-medium text-[var(--text)]">Warum {stock.status}? </span>
            {getWhyText(stock)}
          </p>
        </div>

        {/* Einschätzung (vormals "KI-Einschätzung") */}
        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--bg)] p-6 md:p-8">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Einschätzung</p>
            <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--faint)]">Automatisch erstellt</span>
          </div>
          <p className="text-[15px] leading-relaxed text-[var(--text-soft)]">{stock.insight}</p>
        </div>

        {similarStocks.length > 0 && (
          <div className="mt-10">
            <p className="mb-4 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Ähnliche, konforme Alternativen</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {similarStocks.map((s) => (
                <button
                  key={s.ticker}
                  onClick={() => onOpenStock && onOpenStock(s.ticker)}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left hover:border-[var(--emerald)]/60"
                >
                  <ComplianceStar score={s.score} size={36} label="" />
                  <div>
                    <p className="font-[IBM_Plex_Mono] text-sm text-[var(--text)]">{s.ticker}</p>
                    <p className="text-xs text-[var(--muted)]">{s.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {showSignup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-7">
            <ComplianceStar score={100} size={40} label="" />
            <h3 className="font-display mt-4 text-xl text-[var(--text)]">Konto erstellen, um zu speichern</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Damit deine Watchlist und dein Portfolio erhalten bleiben, brauchen wir kurz eine E-Mail-Adresse.
            </p>
            <input
              placeholder="E-Mail-Adresse"
              className="mt-4 w-full rounded-full border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
            />
            <button
              onClick={confirmSignupAndSave}
              className="mt-3 w-full rounded-full bg-[var(--gold)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] hover:opacity-90"
            >
              Konto erstellen
            </button>
            <button onClick={() => setShowSignup(false)} className="mt-2 w-full rounded-full px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]">
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Root ---------- */

/* ---------- Watchlist-Seite ---------- */

function WatchlistPage({ watchlist, onBack, onOpenStock, onToggleWatchlist }) {
  const [expandedTicker, setExpandedTicker] = useState(null);
  const items = sampleStocks.filter((s) => watchlist.includes(s.ticker));
  return (
    <div className="font-body">
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-6 text-sm text-[var(--muted)]">
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
        <span>/</span>
        <span className="text-[var(--text)]">Watchlist</span>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-24">
        <h1 className="font-display text-2xl text-[var(--text)]">Deine Watchlist</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {items.length === 0
            ? "Noch keine Aktien gemerkt."
            : "Status-Änderungen (z. B. Halal → Grenzwertig) erscheinen hier zuerst."}
        </p>

        {items.some((s) => s.status !== "Halal") && (
          <div className="mt-4 space-y-2">
            {items.filter((s) => s.status !== "Halal").map((s) => (
              <div
                key={s.ticker}
                className="flex items-center justify-between rounded-xl border border-[var(--amber)]/40 bg-[var(--amber)]/10 px-4 py-3 text-sm"
              >
                <span className="text-[var(--amber-soft)]">
                  ⚠ {s.ticker} steht aktuell auf <strong>{s.status}</strong> — {getWhyText(s)}
                </span>
                <button onClick={() => onOpenStock(s.ticker)} className="flex-shrink-0 text-xs text-[var(--amber-soft)] hover:underline">
                  Prüfen →
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 grid gap-3">
          {items.map((s) => (
            <div key={s.ticker}>
              <StockCard
                s={s}
                expanded={expandedTicker === s.ticker}
                onToggle={() => setExpandedTicker(expandedTicker === s.ticker ? null : s.ticker)}
              />
              <div className="ml-2 mt-1 flex gap-4 text-xs">
                <button onClick={() => onOpenStock(s.ticker)} className="text-[var(--faint)] hover:text-[var(--muted)]">
                  Zur Detailseite →
                </button>
                <button onClick={() => onToggleWatchlist(s.ticker)} className="text-[var(--red-soft)] hover:underline">
                  Entfernen
                </button>
              </div>
            </div>
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
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-6 text-sm text-[var(--muted)]">
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
        <span>/</span>
        <span className="text-[var(--text)]">Kalender</span>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-24">
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
// ersetzt eine echte Datenquelle (vermutlich eine Supabase-Tabelle) dieses
// Array. Die 6-Monats-Aufbewahrungslogik unten funktioniert schon jetzt
// unabhängig davon, ob die Daten hier oder aus einer echten Quelle kommen.
const mockReports = [
  {
    date: "27. Juli 2026",
    isoDate: "2026-07-27",
    title: "Wochenbericht KW 30",
    highlight: "KI-Infrastruktur weiter stark",
    marktueberblick:
      "Die Kapitalmärkte zeigten sich in KW 30 überwiegend risikofreudig. Technologie- und Halbleiterwerte setzten ihren Aufwärtstrend fort, getrieben von anhaltend hoher Nachfrage nach KI-Infrastruktur. Defensive Sektoren wie Versorger blieben demgegenüber zurück.",
    entwicklungen: [
      "Mehrere große Halbleiterhersteller meldeten Umsatzzahlen über den Erwartungen der Analysten.",
      "Die Rendite zehnjähriger US-Staatsanleihen blieb weitgehend stabil.",
      "Energiepreise gaben leicht nach, nachdem Lagerbestände stärker als erwartet gestiegen waren.",
    ],
    screeningUpdates: ["Keine Statusänderungen bei den 20 meistbeobachteten Titeln in dieser Woche."],
    sektorFokus:
      "Technologie bleibt der Sektor mit dem höchsten Anteil Halal-konformer Titel in unserem Datensatz — vor allem, weil viele Unternehmen niedrige Verschuldungsquoten aufweisen.",
  },
  {
    date: "20. Juli 2026",
    isoDate: "2026-07-20",
    title: "Wochenbericht KW 29",
    highlight: "Neu als Halal eingestuft: 4 Titel",
    marktueberblick:
      "Eine ruhigere Handelswoche mit geringerer Schwankungsbreite als zuletzt. Im Fokus standen vor allem Neueinstufungen im Rahmen der turnusmäßigen Screening-Aktualisierung.",
    entwicklungen: [
      "Vier zuvor als \u201eGrenzwertig\u201c eingestufte Titel erfüllen nach aktuellen Bilanzdaten wieder die 30%-Grenzwerte und gelten nun als Halal.",
      "Ein Titel wechselte von \u201eHalal\u201c zu \u201eGrenzwertig\u201c aufgrund gestiegener Verschuldung im letzten Quartalsbericht.",
    ],
    screeningUpdates: [
      "4 Titel neu als Halal eingestuft (vorher: Grenzwertig)",
      "1 Titel neu als Grenzwertig eingestuft (vorher: Halal)",
    ],
    sektorFokus: "Die Neueinstufungen verteilten sich über Konsumgüter- und Industriewerte, kein klarer Sektor-Schwerpunkt.",
  },
  {
    date: "13. Juli 2026",
    isoDate: "2026-07-13",
    title: "Wochenbericht KW 28",
    highlight: "Clean-Energy-ETFs mit Zuflüssen",
    marktueberblick:
      "Nachhaltigkeits- und Clean-Energy-Themen rückten wieder stärker in den Fokus institutioneller Anleger, nachdem mehrere Länder neue Förderprogramme angekündigt hatten.",
    entwicklungen: [
      "Clean-Energy-ETFs verzeichneten laut Marktbeobachtern die höchsten wöchentlichen Mittelzuflüsse seit mehreren Monaten.",
      "Rohstoffpreise für Industriemetalle, die in der Energiewende eine Rolle spielen, zogen leicht an.",
    ],
    screeningUpdates: ["Keine Statusänderungen bei den 20 meistbeobachteten Titeln in dieser Woche."],
    sektorFokus: "Grundstoffe und Industrie profitierten am stärksten vom gestiegenen Interesse an Energiewende-Themen.",
  },
  {
    date: "06. Juli 2026",
    isoDate: "2026-07-06",
    title: "Wochenbericht KW 27",
    highlight: "Ø Sharia-Score leicht gestiegen",
    marktueberblick:
      "Zum Start des dritten Quartals zeigte sich der Gesamtmarkt freundlich. Der durchschnittliche Sharia-Score über alle erfassten Titel stieg leicht an — vor allem, weil mehrere Unternehmen ihre Verschuldung im letzten Geschäftsjahr reduziert haben.",
    entwicklungen: [
      "Der durchschnittliche Sharia-Score über alle 504 erfassten Titel liegt aktuell bei 71 Punkten (Vorwoche: 69).",
      "Mehrere Quartalsberichte zeigten branchenübergreifend sinkende Verschuldungsquoten.",
    ],
    screeningUpdates: [],
    sektorFokus: "Kein einzelner Sektor sticht hervor — der Anstieg verteilt sich breit über mehrere Branchen.",
  },
];

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
            highlight: r.highlight,
            marktueberblick: r.marktueberblick,
            entwicklungen: r.entwicklungen || [],
            screeningUpdates: r.screening_updates || [],
            sektorFokus: r.sektor_fokus,
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
        <header className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-6 text-sm text-[var(--muted)]">
          <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
          <span>/</span>
          <span onClick={() => setSelectedReport(null)} className="cursor-pointer hover:text-[var(--text)]">Berichte</span>
          <span>/</span>
          <span className="text-[var(--text)]">{r.title}</span>
        </header>
        <main className="mx-auto max-w-3xl px-6 pb-24">
          <button
            onClick={() => setSelectedReport(null)}
            className="mb-4 text-sm text-[var(--faint)] hover:text-[var(--gold-soft)]"
          >
            ← Alle Berichte
          </button>
          <h1 className="font-display text-2xl text-[var(--text)]">{r.title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{r.date} · Automatisch erstellt</p>

          <section className="mt-8">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--faint)]">Marktüberblick</p>
            <p className="text-sm leading-relaxed text-[var(--text-soft)]">{r.marktueberblick}</p>
          </section>

          <section className="mt-8">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--faint)]">Wichtige Entwicklungen</p>
            <ul className="space-y-2">
              {r.entwicklungen.map((e, i) => (
                <li key={i} className="flex gap-2 text-sm text-[var(--text-soft)]">
                  <span className="text-[var(--gold-soft)]">•</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </section>

          {r.screeningUpdates.length > 0 && (
            <section className="mt-8">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--faint)]">Screening-Updates</p>
              <ul className="space-y-2">
                {r.screeningUpdates.map((e, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[var(--text-soft)]">
                    <span className="text-[var(--emerald-soft)]">•</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--faint)]">Sektor im Fokus</p>
            <p className="text-sm text-[var(--text-soft)]">{r.sektorFokus}</p>
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
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-6 text-sm text-[var(--muted)]">
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
        <span>/</span>
        <span className="text-[var(--text)]">Berichte</span>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-24">
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
                <div>
                  <p className="text-sm text-[var(--text)]">{r.title}</p>
                  <p className="text-xs text-[var(--muted)]">{r.date} · {r.highlight}</p>
                </div>
                <span className="text-xs text-[var(--faint)]">Lesen →</span>
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
    q: "Sind alle Technologie-Aktien automatisch halal?",
    a: "Nein. Auch bei Tech-Unternehmen wird jede Aktie einzeln geprüft — vor allem die Verschuldungsquote. Manche große Tech-Konzerne gelten trotz unproblematischer Branche als Grenzwertig, weil sie stark fremdfinanziert sind.",
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
  { term: "Grenzwertig", def: "Tazkiyahs mittlere Status-Stufe: Mindestens eine Kennzahl liegt knapp über dem AAOIFI-Grenzwert. Weder klar konform noch klar ausgeschlossen — sollte regelmäßig neu geprüft werden." },
  { term: "Growth Stock (Wachstumsaktie)", def: "Eine Aktie, deren Wert vor allem auf erwartetem zukünftigem Wachstum beruht, oft mit wenig oder keiner Dividende." },
  { term: "Halal", def: "Wörtlich 'erlaubt'. Im Anlagekontext: eine Aktie oder ein Fonds, der alle Geschäftsmodell- und Finanzkriterien des Screenings erfüllt." },
  { term: "Haram", def: "Wörtlich 'verboten'. Das Gegenstück zu Halal — bezeichnet Geschäftsfelder oder Praktiken, die nach islamischen Grundsätzen unzulässig sind." },
  { term: "IPO (Börsengang)", def: "Initial Public Offering — der erste Verkauf von Unternehmensanteilen an die Öffentlichkeit über die Börse." },
  { term: "ISIN", def: "International Securities Identification Number — eine weltweit eindeutige Kennung für ein Wertpapier, unabhängig vom Börsenplatz." },
  { term: "Ijara", def: "Eine islamische Leasing-Struktur: Der Eigentümer vermietet einen Vermögenswert gegen feste Zahlungen, statt einen verzinsten Kredit zu vergeben." },
  { term: "KGV (P/E-Ratio)", def: "Kurs-Gewinn-Verhältnis — der Aktienkurs geteilt durch den Gewinn je Aktie. Ein gängiges, aber grobes Bewertungsmaß." },
  { term: "Klumpenrisiko", def: "Die Gefahr, dass ein Portfolio zu stark auf wenige Werte, Branchen oder Regionen konzentriert ist und dadurch überdurchschnittlich schwankt." },
  { term: "Liquidität", def: "Wie leicht sich ein Vermögenswert kurzfristig in Bargeld umwandeln lässt, ohne größere Wertverluste." },
  { term: "Marktkapitalisierung", def: "Der Gesamtwert aller ausstehenden Aktien eines Unternehmens (Aktienkurs × Anzahl Aktien). Dient als Bezugsgröße für Verschuldungs- und Cash-Quote im Screening." },
  { term: "Maysir", def: "Glücksspiel bzw. Spekulation ohne wirtschaftliche Substanz — neben Riba und Gharar ein weiteres zentrales Ausschlussprinzip im islamischen Finanzwesen." },
  { term: "Mudarabah", def: "Ein islamisches Gewinnbeteiligungsmodell: Ein Kapitalgeber stellt Geld, ein Unternehmer die Arbeit — Gewinne werden nach vereinbartem Schlüssel geteilt, Verluste trägt primär der Kapitalgeber." },
  { term: "Murabaha", def: "Ein Kostenaufschlag-Verkauf: Der Verkäufer nennt offen Einkaufspreis und Marge, statt Zinsen zu berechnen — eine gängige Struktur im islamischen Handelsfinanzwesen." },
  { term: "Musharakah", def: "Eine Partnerschaft, bei der mehrere Parteien gemeinsam Kapital einbringen und Gewinn wie Verlust anteilig tragen — Grundlage vieler islamischer Beteiligungsmodelle." },
  { term: "Nisab", def: "Der Vermögens-Schwellenwert, ab dem Zakat fällig wird. Liegt das Gesamtvermögen darunter, entfällt die Zakat-Pflicht für den Zeitraum." },
  { term: "Portfolio", def: "Die Gesamtheit der Anlagen einer Person — bei Tazkiyah inklusive einer aggregierten Halal-Reinheits-Ansicht über alle Positionen hinweg." },
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
  { title: "3. Screening verstehen", text: "Bevor du eine Aktie kaufst, prüf ihren Status im Screener und lies die 'Warum'-Begründung auf der Detailseite. Bei 'Grenzwertig' lohnt sich ein zweiter Blick vor dem Kauf." },
  { title: "4. Klein anfangen", text: "Ein Sparplan mit kleinen, regelmäßigen Beträgen ist oft sinnvoller als eine einzelne große Investition — gerade am Anfang, wenn Marktschwankungen noch ungewohnt sind." },
  { title: "5. Portfolio im Blick behalten", text: "Nutze die Watchlist, um Statusänderungen (z. B. Halal → Grenzwertig) nicht zu verpassen, und prüfe die Portfolio-Reinheit regelmäßig — Unternehmen können sich verändern." },
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
    text: "Halal-konforme Aktien sind nicht automatisch risikoärmer — die Ausschlusskriterien führen oft zu einer Konzentration auf bestimmte Sektoren (z. B. Technologie, Gesundheit), was Klumpenrisiken erzeugen kann. Gleichzeitig bringt der niedrigere Verschuldungsgrad vieler konformer Unternehmen tendenziell mehr finanzielle Stabilität in Krisenzeiten mit sich — beides gehört zur ehrlichen Einordnung.",
  },
];

const AKADEMIE_TABS = ["Einstieg", "Broker-Vergleich", "Glossar", "Methodik", "Vertiefen"];


function AkademiePage({ onBack }) {
  const [tab, setTab] = useState("Einstieg");
  const [open, setOpen] = useState(0);

  return (
    <div className="font-body">
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-6 text-sm text-[var(--muted)]">
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
        <span>/</span>
        <span className="text-[var(--text)]">Akademie</span>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-24">
        <h1 className="font-display text-3xl text-[var(--text)]">Akademie</h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Grundlagen, Vergleiche und Erklärungen — unabhängig davon, wo du dein Depot führst.
        </p>

        <div className="mt-6 flex gap-2 border-b border-[var(--border)]">
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
              Das Screening orientiert sich an AAOIFI-Standards und prüft jede Aktie in zwei
              Schritten: zuerst das Geschäftsmodell (z. B. Ausschluss von Banken, Alkohol,
              Glücksspiel), danach die Finanzkennzahlen (Verschuldung, zinstragende Erträge und
              Einlagen — jeweils im Verhältnis zur Marktkapitalisierung). Liegt eine Kennzahl über
              dem Grenzwert, gilt der Titel als nicht konform; liegt sie knapp darunter, als
              Grenzwertig. Die genaue Berechnung ist auf jeder Aktien-Detailseite einsehbar.
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
  const bySector = SECTORS.map((sector) => {
    const items = sampleStocks.filter((s) => s.sector === sector);
    const halal = items.filter((s) => s.status === "Halal").length;
    return { sector, total: items.length, halal };
  });
  return (
    <div className="font-body">
      <header className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-6 text-sm text-[var(--muted)]">
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
        <span>/</span>
        <span className="text-[var(--text)]">Sektoren</span>
      </header>
      <main className="mx-auto max-w-4xl px-6 pb-24">
        <h1 className="font-display text-2xl text-[var(--text)]">Sektor-Übersicht</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Wie viele geprüfte Titel je Branche konform sind.</p>
        <div className="mt-6 grid gap-3">
          {bySector.map((b) => (
            <div key={b.sector} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-[var(--text)]">{b.sector}</span>
                <span className="text-[var(--muted)]">{b.halal} / {b.total} Halal</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
                <div className="h-full rounded-full bg-[var(--emerald)]" style={{ width: `${b.total ? (b.halal / b.total) * 100 : 0}%` }} />
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
  const items = sampleStocks.filter((s) => tickers.includes(s.ticker));
  const rows = [
    { label: "Status", get: (s) => <StatusPill status={s.status} /> },
    { label: "Score", get: (s) => s.score },
    { label: "Kurs", get: (s) => s.price },
    { label: "Verschuldung", get: (s) => s.debt },
    { label: "Sektor", get: (s) => s.sector },
  ];
  return (
    <div className="font-body">
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-6 text-sm text-[var(--muted)]">
        <span onClick={onBack} className="cursor-pointer hover:text-[var(--text)]">Tazkiyah</span>
        <span>/</span>
        <span className="text-[var(--text)]">Vergleichen</span>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-24">
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
    page: "home",
    anchor: "screener",
    children: [
      { label: "Alle Aktien", page: "home", anchor: "screener" },
      { type: "heading", label: "Status" },
      { type: "filter", label: "Halal", filter: { type: "status", value: "Halal" } },
      { type: "filter", label: "Grenzwertig", filter: { type: "status", value: "Grenzwertig" } },
      { type: "filter", label: "Nicht Halal", filter: { type: "status", value: "Nicht Halal" } },
      { type: "heading", label: "Sektor" },
      ...SECTORS.map((sec) => ({ type: "filter", label: sec, filter: { type: "sector", value: sec } })),
      { label: "Sektor-Explorer", page: "sectors" },
      { label: "Vergleichen", page: "compare" },
    ],
  },
  {
    key: "portfolio",
    label: "Portfolio",
    page: "home",
    anchor: "portfolio",
    children: [
      { label: "Übersicht", page: "home", anchor: "portfolio" },
      { label: "Reinheits-Rechner", page: "home", anchor: "rechner" },
      { label: "Kalender", page: "calendar" },
    ],
  },
  {
    key: "berichte",
    label: "Berichte",
    page: "reports",
    children: [
      { label: "Marktbericht", page: "home", anchor: "bericht" },
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
        <div className="flex items-center gap-3 overflow-hidden">
          <ComplianceStar score={100} size={30} label="" />
          {!collapsed && <span className="font-display whitespace-nowrap text-base tracking-wide">Tazkiyah</span>}
        </div>
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
            { label: "Screener", page: "home", anchor: "screener" },
            { label: "Portfolio", page: "home", anchor: "portfolio" },
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
                        child.type === "filter" ? onGo("home", "screener", child.filter) : onGo(child.page, child.anchor)
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

export default function TazkiyahPrototype() {
  const [page, setPage] = useState("home"); // home | detail | watchlist | reports | faq | sectors | compare
  const [selectedTicker, setSelectedTicker] = useState("NVDA");
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
  const [pendingAnchor, setPendingAnchor] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);
  const [presetFilter, setPresetFilter] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function toggleCompare(ticker) {
    setCompareTickers((prev) =>
      prev.includes(ticker) ? prev.filter((t) => t !== ticker) : prev.length >= 3 ? prev : [...prev, ticker]
    );
  }
  function openStock(ticker) {
    setSelectedTicker(ticker);
    setPage("detail");
    setActiveAnchor(null);
  }

  // Sidebar-Klick: zur Seite navigieren, optional zu einem Abschnitt scrollen
  // und/oder einen Status-/Sektor-Filter im Screener vorbelegen
  function goTo(targetPage, anchor, filter) {
    if (targetPage === "home" && anchor) {
      if (page === "home") {
        document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
      } else {
        setPendingAnchor(anchor);
        setPage("home");
      }
      setActiveAnchor(anchor);
    } else {
      setPage(targetPage);
      setActiveAnchor(null);
    }
    if (filter) {
      setActiveFilter(filter);
      setPresetFilter({ ...filter, ts: Date.now() });
    }
  }

  React.useEffect(() => {
    if (page === "home" && pendingAnchor) {
      const el = document.getElementById(pendingAnchor);
      if (el) el.scrollIntoView({ behavior: "smooth" });
      setPendingAnchor(null);
    }
  }, [page, pendingAnchor]);

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
        {page === "home" && (
          <HomePage
            onOpenStock={openStock}
            onNavigate={(p) => goTo(p)}
            watchlist={wl.watchlist}
            onToggleWatchlist={wl.toggle}
            compareTickers={compareTickers}
            onToggleCompare={toggleCompare}
            presetFilter={presetFilter}
          />
        )}
        {page === "detail" && (
          <StockDetailPage
            ticker={selectedTicker}
            onBack={() => goTo("home")}
            watchlist={wl.watchlist}
            onToggleWatchlist={wl.toggle}
            onOpenStock={openStock}
          />
        )}
        {page === "watchlist" && (
          <WatchlistPage
            watchlist={wl.watchlist}
            onBack={() => goTo("home")}
            onOpenStock={openStock}
            onToggleWatchlist={wl.toggle}
          />
        )}
        {page === "calendar" && (
          <CalendarPage watchlist={wl.watchlist} onBack={() => goTo("home")} onOpenStock={openStock} />
        )}
        {page === "reports" && <ReportsPage onBack={() => goTo("home")} />}
        {page === "faq" && <AkademiePage onBack={() => goTo("home")} />}
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
