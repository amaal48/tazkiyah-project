// src/components/MethodikPage.jsx
//
// Öffentliche Methodik-Seite (J1–J3). Alle Inhalte kommen direkt aus
// src/screening/parameters.js und src/screening/industryRules.js — es gibt
// keinen zweiten, von Hand gepflegten Text, der veralten könnte.
//
// Jeder Parameter hat einen Anker (#methodik-<schlüssel>), damit Info-Symbole
// im Screener direkt auf die passende Stelle verlinken können:
//   onGo("methodik", "methodik-debtMaxPct")

import { useEffect } from "react";
import {
  DEFAULT_PARAMETERS,
  EXCLUDED_PRODUCT_TYPES,
  PARAMETERS_VERSION,
  PRINCIPLE,
  USER_NOTICES,
} from "../screening/parameters.js";
import { INDUSTRY_GROUPS, PROHIBITED_INCOME_CATEGORIES } from "../screening/industryRules.js";
import { ETF_STAGE, EXPLANATIONS, STAGES } from "../screening/explanations.js";
import { routes } from "../lib/hashRoute.js";
import StageDiagram from "./screening/StageDiagram.jsx";
import StatusLegend from "./screening/StatusLegend.jsx";
import { H1_STYLE, NOTICE_NO_ADVICE, shortExplanation } from "./screening/format.js";

// Kurztitel je Parameter (Überschrift des Eintrags)
const TITLES = {
  debtMaxPct: "Zinstragende Schulden",
  depositsMaxPct: "Zinstragende Einlagen und Wertpapiere",
  prohibitedIncomeMaxPct: "Verbotene Einnahmen",
  realAssetsMinPct: "Reale Vermögenswerte",
  balanceBasis: "Welche Abschlüsse zählen",
  marketCapBasis: "Marktkapitalisierung",
  marketCapFromPrice: "Marktkapitalisierung aus Kurs und Aktienzahl",
  leaseQuarterEstimate: "Leasing im Quartal",
  leaseLiabilitiesAsDebt: "Leasingverbindlichkeiten",
  allCashInterestBearing: "Cash und Anlagen",
  realAssetsValuation: "Bewertung der realen Vermögenswerte",
  goodwillCountsAsRealAsset: "Goodwill",
  operatingReceivablesCountAsReal: "Forderungen aus dem laufenden Geschäft",
  intangiblesCountAsRights: "Immaterielle Werte und Nutzungsrechte",
  articlesReview: "Unternehmenszweck laut Satzung",
  goldSilverCurrencyDealers: "Handel mit Gold, Silber oder Währungen",
  manualReviewExpiry: "Gültigkeit manueller Prüfungen",
  prohibitedIncomeBasis: "Zeitraum der Prüfung",
  prohibitedIncomeSources: "Was als verbotene Einnahme zählt",
  requireSegmentReview: "Prüfung der Umsatzsegmente",
  prohibitedIncomeDenominator: "Bezugsgröße",
  purificationFrequency: "Zeitraum und Stichtag",
  zakatDeductLiabilities: "Verbindlichkeiten",
  zakatReceivablesField: "Forderungen",
  zakatFallback: "Unternehmen ohne zakatpflichtiges Vermögen",
  zakatCalculator: "Nisab, Satz und Stichtag",
  ruleG1LookThrough: "Prüfung jeder enthaltenen Aktie",
  ruleG2Synthetic: "Synthetische Nachbildung",
  ruleG3SecuritiesLending: "Wertpapierleihe",
  ruleG4Derivatives: "Derivate",
  ruleG5Purification: "Reinigung bei ETFs",
  etfFundInterestIncome: "Zinserträge des Fonds selbst",
  etfPurificationMinCoveragePct: "Mindestabdeckung",
  etfPurificationUncovered: "Fehlende Bestandteile",
};

// Auch für die Erklärseiten je Prüfung (CriterionPage)
export { TITLES as PARAMETER_TITLES };

// Parameter → Prüfungen, deren parameterRefs ihn enthalten („Verwendet bei:“)
const USED_BY = {};
for (const [cid, e] of Object.entries(EXPLANATIONS)) {
  for (const k of e.parameterRefs) (USED_BY[k] ||= []).push(cid);
}

const SECTIONS = [
  {
    id: "grenzwerte",
    title: "Grenzwerte",
    intro: "Die vier Kennzahlen, an denen jede Aktie gemessen wird. Überschreitet eine davon die Grenze, ist die Aktie nicht konform.",
    keys: ["debtMaxPct", "depositsMaxPct", "prohibitedIncomeMaxPct", "realAssetsMinPct"],
    showLimits: true,
  },
  {
    id: "daten",
    title: "Datengrundlage",
    intro: "Aus welchen Abschlüssen und Bilanzposten die Kennzahlen berechnet werden.",
    keys: ["balanceBasis", "marketCapBasis", "marketCapFromPrice", "leaseLiabilitiesAsDebt", "leaseQuarterEstimate", "allCashInterestBearing", "realAssetsValuation", "operatingReceivablesCountAsReal", "goodwillCountsAsRealAsset", "intangiblesCountAsRights"],
  },
  {
    id: "taetigkeit",
    title: "Tätigkeit des Unternehmens",
    intro: "Die erste Stufe: Ist das Kerngeschäft erlaubt, und nennt die Satzung kein verbotenes Unternehmensziel?",
    keys: ["articlesReview", "goldSilverCurrencyDealers", "manualReviewExpiry"],
    extra: "industries",
  },
  {
    id: "einnahmen",
    title: "Verbotene Einnahmen",
    intro: "Auch erlaubte Unternehmen haben oft kleine verbotene Einnahmen, etwa Zinsen. Zusammen dürfen sie 5 % der Gesamteinnahmen nicht überschreiten.",
    keys: ["prohibitedIncomeBasis", "prohibitedIncomeSources", "requireSegmentReview", "prohibitedIncomeDenominator"],
    extra: "categories",
  },
  {
    id: "reinigung",
    title: "Reinigung (Purification)",
    intro: USER_NOTICES.purificationMechanism,
    keys: ["purificationFrequency"],
    extra: "purification",
  },
  {
    id: "zakat",
    title: "Zakat",
    intro: "Für jede Aktie werden die Werte angegeben, die du für deine Zakat-Berechnung brauchst.",
    keys: ["zakatDeductLiabilities", "zakatReceivablesField", "zakatFallback", "zakatCalculator"],
  },
  {
    id: "etfs",
    title: "ETFs",
    intro: "Ein ETF ist nur so konform wie die Aktien, die er enthält, und wie er selbst wirtschaftet.",
    keys: ["ruleG1LookThrough", "ruleG2Synthetic", "ruleG3SecuritiesLending", "ruleG4Derivatives", "ruleG5Purification", "etfFundInterestIncome", "etfPurificationMinCoveragePct", "etfPurificationUncovered"],
  },
];

// Überschriften-Stile inline: src/index.css (Vite-Vorlage) setzt globale
// h1/h2-Regeln außerhalb der Tailwind-Layer, die Tailwind-Klassen sonst
// überschreiben würden (Farbe, Größe, Abstände). H1 kommt aus screening/format.js.
const H2_STYLE = { fontSize: "1.5rem", color: "var(--text)", margin: 0, letterSpacing: 0, fontWeight: 500, lineHeight: 1.25 };

const PRODUCT_LABELS = {
  margin: "Kauf auf Kredit (Margin)",
  short_sale: "Leerverkauf",
  securities_lending: "Wertpapierleihe und -miete",
  future: "Futures auf Aktien",
  option: "Optionen auf Aktien",
  swap: "Swaps auf Aktien oder Renditen",
  salam: "Salam auf Aktien",
  index_trading: "Handel mit dem Index selbst, auch zur Absicherung",
  index_option: "Optionen auf Indizes",
  index_multiplier: "Kontrakte mit Index-Multiplikator",
  cfd: "Index-CFDs",
  knockout: "Knock-out-Produkte",
  turbo: "Turbo-Zertifikate",
  factor_certificate: "Faktor-Zertifikate",
  index_warrant: "Index-Optionsscheine",
  index_certificate: "Indexzertifikate (Schuldverschreibungen)",
  leveraged_etf: "Gehebelte ETFs",
  inverse_etf: "Inverse ETFs",
  bond: "Anleihen (Alternative: Sukuk)",
};

const HANDLING_LABELS = {
  exclude: "Ausschluss",
  review: "Manuelle Prüfung des Kerngeschäfts",
  b3_focus: "Kein Ausschluss, Prüfung über die Einnahmen",
};

const STEPS = [
  ["Tätigkeit", "Ist das Kerngeschäft erlaubt? Nennt die Satzung ein verbotenes Ziel? Handelt das Unternehmen mit Gold, Silber oder Währungen?"],
  ["Kennzahlen", "Zinstragende Schulden, zinstragende Einlagen und verbotene Einnahmen im Verhältnis zu Marktkapitalisierung bzw. Gesamteinnahmen."],
  ["Vermögensstruktur", "Besteht das Unternehmen zu mindestens einem Drittel aus realen Vermögenswerten und Rechten statt aus Geld und Finanzanlagen? Forderungen aus dem laufenden Geschäft zählen dabei mit (SS 59, 8/1)."],
  ["Wertpapierart", "Stammaktie statt Vorzugsaktie mit finanziellem Vorrang, keine Anleihe."],
];

// Geschütztes Leerzeichen vor „%“, damit „30 %“ nicht umbricht
const nb = (t) => (typeof t === "string" ? t.replace(/ %/g, "\u00a0%") : t);

function formatDate(v) {
  const [y, m, d] = String(v).split(/[-.]/);
  return d ? `${d}.${m}.${y}` : v;
}

function Tag({ tone, children }) {
  const tones = {
    amber: "border-[var(--amber)]/50 text-[var(--amber-soft)]",
    gold: "border-[var(--gold)]/50 text-[var(--gold-soft)]",
  };
  return <span className={"rounded-full border px-2 py-0.5 text-sm " + tones[tone]}>{children}</span>;
}

function ParameterEntry({ id, def, showLimit }) {
  const unit = typeof def.value === "number" ? " %" : "";
  const isMin = id === "realAssetsMinPct";
  return (
    <article id={`methodik-${id}`} className="scroll-mt-24 border-t border-[var(--border)] py-6 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h3 className="font-display text-lg text-[var(--text)]">{TITLES[id] || id}</h3>
        {showLimit && (
          <span className="font-[IBM_Plex_Mono] text-sm text-[var(--gold-soft)]">
            {isMin ? "mindestens " : "höchstens "}
            {String(def.value).replace(".", ",")}
            {unit}
          </span>
        )}
        {def.derivation && <Tag tone="gold">Ableitung, abschaltbar</Tag>}
        {def.pendingConfirmation && <Tag tone="amber">Vorschlag, noch nicht bestätigt</Tag>}
      </div>
      <p className="pt-2 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">{nb(def.method)}</p>
      <dl className="mt-4 grid max-w-[68ch] gap-3 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-[var(--muted)]">Begründung</dt>
        <dd className="leading-relaxed text-[var(--text-soft)]">{nb(def.rationale)}</dd>
        <dt className="text-[var(--muted)]">Alternative</dt>
        <dd className="leading-relaxed text-[var(--text-soft)]">{nb(def.alternative)}</dd>
        <dt className="text-[var(--muted)]">Quelle</dt>
        <dd className="text-[var(--text-soft)]">{def.source}</dd>
        {USED_BY[id] && (
          <>
            <dt className="text-[var(--muted)]">Verwendet bei</dt>
            <dd className="flex flex-wrap gap-x-3 gap-y-1">
              {USED_BY[id].map((cid) => (
                <a key={cid} href={routes.criterion(cid)} className="text-[var(--primary)] underline decoration-[var(--gold)]/40 underline-offset-2">
                  {EXPLANATIONS[cid].name} ({cid})
                </a>
              ))}
            </dd>
          </>
        )}
      </dl>
    </article>
  );
}

export function IndustryGroups() {
  return (
    <div id="methodik-industryGroups" className="scroll-mt-24 mt-8">
      <h3 className="font-display text-lg text-[var(--text)]">Branchen</h3>
      <p className="pt-2 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">
        SS 21, 2/1 nennt als verbotene Haupttätigkeit beispielhaft Alkohol, Schweinefleisch und Riba-Geschäfte. Weitere
        Gruppen ordnen wir unter „und Ähnliches“ ein oder schließen sie nach dem Vorsichtsprinzip aus; das ist jeweils
        gekennzeichnet. Ein Stichwort in der Unternehmensbeschreibung führt nie automatisch zum Ausschluss, sondern zu
        einer manuellen Prüfung.
      </p>
      <ul className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {INDUSTRY_GROUPS.map((g) => (
          <li key={g.id} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2">
              <p className="text-sm text-[var(--text)]">{g.label}</p>
              <p className={"text-sm " + (g.handling === "exclude" ? "text-[var(--red-soft)]" : g.handling === "review" ? "text-[var(--amber-soft)]" : "text-[var(--emerald-soft)]")}>
                {HANDLING_LABELS[g.handling]}
              </p>
            </div>
            <div className="text-sm leading-relaxed text-[var(--text-soft)]">
              <p>{nb(g.rationale)}</p>
              <p className="pt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
                <span>{g.basis}</span>
                <span aria-hidden="true">/</span>
                <span>{g.source}</span>
                {g.interpretation && <Tag tone="amber">Auslegungsfrage</Tag>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IncomeCategories() {
  return (
    <div id="methodik-prohibitedIncomeCategories" className="scroll-mt-24 mt-8">
      <h3 className="font-display text-lg text-[var(--text)]">Was als verbotene Einnahme erfasst wird</h3>
      <p className="pt-2 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">
        Zinserträge aus der Gewinn- und Verlustrechnung werden automatisch gezählt. Alle übrigen Anteile stammen aus einer
        manuellen Prüfung der Umsatzsegmente im Jahresbericht, jeweils mit Quellenangabe.
      </p>
      <ul className="mt-4 grid max-w-[68ch] gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        {Object.entries(PROHIBITED_INCOME_CATEGORIES).map(([id, c]) => (
          <li key={id} className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] py-2">
            <span className="text-[var(--text-soft)]">{c.label}</span>
            {c.interpretation && <Tag tone="amber">Auslegungsfrage</Tag>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PurificationNotes() {
  return (
    <div className="mt-6 max-w-[68ch] space-y-4 text-[15px] leading-relaxed text-[var(--text-soft)]">
      <p className="border-l-2 border-[var(--gold)] pl-4">{USER_NOTICES.purificationUse} (SS 21, 3/4/6/5)</p>
      <p>
        Manche ETF-Anbieter teilen zu jeder Ausschüttung einen eigenen Anteil unreinen Einkommens mit, berechnet auf Basis
        der ausgeschütteten Dividenden. Tazkiyah rechnet nach SS 21, 3/4/6/2 unabhängig davon, ob eine Dividende gezahlt
        wurde. Beide Zahlen können deshalb voneinander abweichen.
      </p>
    </div>
  );
}

export default function MethodikPage({ onBack, anchor }) {
  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0 });
  }, [anchor]);

  const assigned = new Set(SECTIONS.flatMap((s) => s.keys));
  const others = Object.keys(DEFAULT_PARAMETERS).filter((k) => !assigned.has(k));
  const sections = others.length
    ? [...SECTIONS, { id: "weitere", title: "Weitere Parameter", intro: "", keys: others }]
    : SECTIONS;

  const toc = [
    { id: "ablauf", title: "Ablauf der Prüfung" },
    ...sections.map((s) => ({ id: s.id, title: s.title })),
    { id: "produkte", title: "Ausgeschlossene Produkte" },
    { id: "grenzen", title: "Daten und ihre Grenzen" },
  ];

  return (
    <div className="font-body text-left">
      <header className="flex page items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <button onClick={onBack} className="hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
          Tazkiyah
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-[var(--text)]">Methodik</span>
      </header>

      <div className="page pb-28">
        <section className="pb-12 pt-4">
          <h1 className="font-display" style={H1_STYLE}>So prüft Tazkiyah</h1>
          <p className="pt-4 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">
            Tazkiyah prüft Aktien und ETFs in vier Stufen nach den Sharia-Standards der AAOIFI. Jede Entscheidung, die der
            Wortlaut offenlässt, steht auf dieser Seite mit Begründung, verworfener Alternative und Fundstelle.
          </p>
          <p className="pt-4 max-w-[68ch] text-sm leading-relaxed text-[var(--muted)]">
            Grundlage: AAOIFI Shari'ah Standards Nr. 21 (Wertpapiere), Nr. 27 (Indizes) und Nr. 35 (Zakat). Tazkiyah prüft
            nach den Standards der AAOIFI und ist nicht mit der AAOIFI verbunden. {NOTICE_NO_ADVICE}
          </p>
          <p className="pt-4 max-w-[68ch] border-l-2 border-[var(--gold)] pl-4 text-sm leading-relaxed text-[var(--text-soft)]">
            Grundsatz: {nb(PRINCIPLE)}
          </p>
          <p className="pt-4 text-sm text-[var(--muted)]">Stand der Parameter: {formatDate(PARAMETERS_VERSION.slice(0, 10))}</p>
        </section>

        <section id="pruefungen" aria-labelledby="so-wird-geprueft" className="scroll-mt-24 pb-16">
          <h2 id="so-wird-geprueft" className="font-display" style={H2_STYLE}>So wird geprüft</h2>
          <div className="mt-6">
            <StageDiagram />
          </div>
          <div className="mt-6">
            <StatusLegend />
          </div>
          <h2 className="font-display mt-14" style={H2_STYLE}>Alle Prüfungen</h2>
          <div className="mt-6 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {[...STAGES, ETF_STAGE].map((stage) => (
              <div key={stage.id}>
                <p className="text-sm text-[var(--text)]">
                  Stufe {stage.id} · {stage.title}
                  {stage.id === ETF_STAGE.id && <span className="text-[var(--muted)]"> (nur ETFs)</span>}
                </p>
                <ul className="mt-2 divide-y divide-[var(--border)] border-y border-[var(--border)]">
                  {stage.criteria.map((cid) => (
                    <li key={cid} className="py-2.5">
                      <a href={routes.criterion(cid)} className="group block">
                        <span className="flex items-baseline gap-2">
                          <span className="w-6 flex-shrink-0 font-[IBM_Plex_Mono] text-sm text-[var(--faint)]">{cid}</span>
                          <span className="text-sm text-[var(--text)] group-hover:underline">{EXPLANATIONS[cid].name}</span>
                        </span>
                        <span className="block pl-8 pt-0.5 text-sm leading-relaxed text-[var(--text-soft)]">{nb(shortExplanation(cid))}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-14">
          <nav aria-label="Inhalt" className="hidden lg:block">
            <ul className="sticky top-8 space-y-2 border-l border-[var(--border)] pl-4 text-sm">
              {toc.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    onClick={(e) => {
                      // Hash-Adresse (#/methodik) behalten, nur scrollen
                      e.preventDefault();
                      document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="text-[var(--muted)] hover:text-[var(--text)] focus-visible:text-[var(--text)]"
                  >
                    {t.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <main>
            <section id="ablauf" className="scroll-mt-24">
              <h2 className="font-display" style={H2_STYLE}>Ablauf der Prüfung</h2>
              <p className="pt-3 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">
                Jede Aktie durchläuft vier Stufen in fester Reihenfolge. Fällt sie in einer Stufe durch, werden die übrigen
                trotzdem berechnet und angezeigt, damit alle Gründe sichtbar sind.
              </p>
              <ol className="mt-6 max-w-[68ch] space-y-4">
                {STEPS.map(([title, text], i) => (
                  <li key={title} className="grid grid-cols-[2rem_1fr] gap-3">
                    <span className="font-display text-xl text-[var(--gold-soft)]">{i + 1}</span>
                    <div>
                      <p className="text-[var(--text)]">{title}</p>
                      <p className="pt-1 text-sm leading-relaxed text-[var(--text-soft)]">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8 max-w-[68ch] space-y-3 text-sm leading-relaxed text-[var(--text-soft)]">
                <p>Das Ergebnis ist einer von drei Status:</p>
                <p>
                  <span className="text-[var(--emerald-soft)]">Konform nach AAOIFI SS 21</span>: Alle Kriterien sind geprüft
                  und erfüllt.
                </p>
                <p>
                  <span className="text-[var(--red-soft)]">Nicht konform</span>: Mindestens ein Kriterium ist belegt nicht
                  erfüllt. Das gilt auch dann, wenn andere Daten noch fehlen.
                </p>
                <p>
                  <span className="text-[var(--text)]">Nicht geprüft</span>: Nichts ist durchgefallen, aber mindestens
                  eine Angabe fehlt oder ist unklar. Fehlende Daten führen nie zu „konform“.
                </p>
                <p>
                  Nach jedem neuen Abschluss wird neu geprüft (SS 21, 3/4/8). Ändert sich der Status einer Aktie auf deiner
                  Watchlist, siehst du einen Hinweis.
                </p>
              </div>
            </section>

            {sections.map((s) => (
              <section key={s.id} id={s.id} className="mt-20 scroll-mt-24">
                <h2 className="font-display" style={H2_STYLE}>{s.title}</h2>
                {s.intro && <p className="pt-3 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">{s.intro}</p>}
                <div className="mt-4">
                  {s.keys.map((k) => (
                    <ParameterEntry key={k} id={k} def={DEFAULT_PARAMETERS[k]} showLimit={s.showLimits} />
                  ))}
                </div>
                {s.extra === "industries" && <IndustryGroups />}
                {s.extra === "categories" && <IncomeCategories />}
                {s.extra === "purification" && <PurificationNotes />}
              </section>
            ))}

            <section id="produkte" className="mt-20 scroll-mt-24">
              <h2 className="font-display" style={H2_STYLE}>Ausgeschlossene Produkte</h2>
              <p className="pt-3 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">
                Diese Produkte und Geschäfte werden nie als konform ausgewiesen, unabhängig vom zugrunde liegenden Wert.
              </p>
              <ul className="mt-5 max-w-[68ch] divide-y divide-[var(--border)] border-y border-[var(--border)] text-sm">
                {Object.entries(EXCLUDED_PRODUCT_TYPES).map(([id, source]) => (
                  <li key={id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                    <span className="text-[var(--text-soft)]">{PRODUCT_LABELS[id] || id}</span>
                    <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      {source.replace(" [Ableitung]", "")}
                      {source.includes("[Ableitung]") && <Tag tone="gold">Ableitung</Tag>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section id="grenzen" className="mt-20 scroll-mt-24">
              <h2 className="font-display" style={H2_STYLE}>Daten und ihre Grenzen</h2>
              <div className="mt-4 max-w-[68ch] space-y-4 text-[15px] leading-relaxed text-[var(--text-soft)]">
                <p>
                  Bilanz- und Ertragszahlen stammen von einem Finanzdatenanbieter und beruhen auf den veröffentlichten
                  Abschlüssen der Unternehmen. Satzung, Umsatzsegmente und die Angaben zu ETFs werden von Hand in den
                  Jahresberichten und Fondsdokumenten geprüft; jede dieser Prüfungen ist mit Quelle, Datum und
                  prüfender Person gespeichert und läuft mit dem nächsten Jahresabschluss ab.
                </p>
                <p>Wo die verfügbaren Daten vom Wortlaut des Standards abweichen, sagen wir das offen:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Reale Vermögenswerte werden mit Buchwerten statt mit Marktwerten angesetzt, weil Marktwerte einzelner Vermögenswerte nicht veröffentlicht werden.</li>
                  <li>
                    Die Marktkapitalisierung zum Stichtag wird aus Schlusskurs mal Aktienzahl gebildet. Als Aktienzahl dient
                    bisher der Durchschnitt der Periode, nicht der Bestand am Stichtag; das ist bei den Kennzahlen als
                    Datenabweichung gekennzeichnet. Bei mehreren Aktiengattungen müssten alle Gattungen addiert werden;
                    ist das mit den Daten nicht möglich, bleibt die Prüfung „nicht geprüft“. Liefert die Datenquelle die
                    Marktkapitalisierung selbst, ersetzt sie die Näherung.
                  </li>
                  <li>
                    Weist ein Quartal Leasing nicht gesondert aus, wird der Wert des letzten Jahresabschlusses übernommen
                    und als „Schätzung aus Jahresabschluss“ gekennzeichnet. Hängt das Ergebnis von dieser Schätzung ab,
                    lautet der Status „nicht geprüft“, bis der Quartalsbericht von Hand geprüft ist.
                  </li>
                  <li>Sonstige Erträge liegen teilweise nur als Saldo mit Aufwendungen vor.</li>
                </ul>
                <p>
                  Die verwendeten Fassungen der Standards stammen von 2004 (Nr. 21), 2006 (Nr. 27) und 2008 (Nr. 35), wie sie
                  in der Gesamtausgabe der AAOIFI-Sharia-Standards von 2017 enthalten sind.
                </p>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
