// src/components/screening/CriterionPage.jsx
//
// Erklärseite je Prüfung (#/kriterium/b1). Inhalte aus EXPLANATIONS und DEFAULT_PARAMETERS;
// Grenzwerte werden über fillParams eingesetzt. Felder `todo` werden nicht angezeigt.

import { useEffect } from "react";
import { ETF_STAGE, EXPLANATIONS, STAGES, defaultParameterValues, fillParams, splitSources } from "../../screening/explanations.js";
import { DEFAULT_PARAMETERS } from "../../screening/parameters.js";
import { routes } from "../../lib/hashRoute.js";
import { IndustryGroups, PARAMETER_TITLES } from "../MethodikPage.jsx";
import { H1_STYLE, H2_STYLE } from "./format.js";

// Parameter, die eine Datengrenze beschreiben (Näherung statt Wortlaut)
const DATA_LIMIT_PARAMS = new Set(["marketCapFromPrice", "leaseQuarterEstimate", "realAssetsValuation"]);

function stageOf(id) {
  return STAGES.find((s) => s.criteria.includes(id)) || (ETF_STAGE.criteria.includes(id) ? ETF_STAGE : null);
}

function Section({ title, children }) {
  return (
    <section className="mt-10">
      <h2 className="font-display" style={H2_STYLE}>
        {title}
      </h2>
      <div className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">{children}</div>
    </section>
  );
}

function Tag({ tone, children }) {
  const tones = {
    gold: "border-[var(--gold)]/50 text-[var(--gold-soft)]",
    neutral: "border-[var(--border)] text-[var(--text-soft)]",
  };
  return <span className={"rounded-full border px-2 py-0.5 text-[11px] " + tones[tone]}>{children}</span>;
}

export default function CriterionPage({ id, onBack }) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  const e = EXPLANATIONS[id];
  const params = defaultParameterValues();

  if (!e) {
    return (
      <div className="font-body page py-16 text-left">
        <p className="text-[var(--text)]">Zu „{id}“ gibt es keine Erklärseite.</p>
        <a href={routes.methodik()} className="mt-3 inline-block text-sm text-[var(--gold-soft)] underline underline-offset-2">
          Zur Methodik
        </a>
      </div>
    );
  }

  const stage = stageOf(id);
  const refs = e.parameterRefs.filter((k) => DEFAULT_PARAMETERS[k]);
  const deviations = refs.filter((k) => {
    const d = DEFAULT_PARAMETERS[k];
    return d.derivation || d.pendingConfirmation || DATA_LIMIT_PARAMS.has(k);
  });
  const neighbours = stage ? stage.criteria.filter((x) => x !== id) : [];

  return (
    <div className="font-body text-left">
      <header className="flex page flex-wrap items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <button type="button" onClick={onBack} className="hover:text-[var(--text)]">
          Tazkiyah
        </button>
        <span aria-hidden="true">/</span>
        <a href={routes.methodik()} className="hover:text-[var(--text)]">
          Methodik
        </a>
        <span aria-hidden="true">/</span>
        <span className="text-[var(--text)]">{e.name}</span>
      </header>

      <main className="page pb-24">
        {/* 1. Titel und Stufe */}
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          {stage ? `Stufe ${stage.id} · ${stage.title}` : "Prüfung"} · {id}
        </p>
        <h1 className="font-display mt-2" style={H1_STYLE}>
          {e.name}
        </h1>

        {/* 2. In einfachen Worten */}
        <Section title="In einfachen Worten">
          <div className="space-y-3">
            {e.simple.map((t, i) => (
              <p key={i}>{fillParams(t, params)}</p>
            ))}
          </div>
        </Section>

        {/* 3. Quelle */}
        <Section title="Quelle">
          <ul className="flex flex-wrap gap-2">
            {splitSources(e.source).map((s) => (
              <li key={s}>
                <Tag tone={s.includes("[Ableitung]") ? "gold" : "neutral"}>{s.replace("[Ableitung]", "").trim()}</Tag>
              </li>
            ))}
          </ul>
          {e.source.includes("[Ableitung]") && <p className="mt-3 text-sm text-[var(--muted)]">Von uns abgeleitet, nicht wörtlich im Standard.</p>}
          <p className="mt-3 text-sm text-[var(--muted)]">
            Der Standardtext wird hier nicht abgedruckt, sondern sinngemäß wiedergegeben. Maßgeblich sind die genannten Fundstellen.
          </p>
        </Section>

        {/* 4. So rechnen wir */}
        {(refs.length > 0 || e.parameterRefs.includes("industryGroups")) && (
          <Section title="So rechnen wir">
            <dl className="space-y-4">
              {refs.map((k) => (
                <div key={k}>
                  <dt className="text-[var(--text)]">{PARAMETER_TITLES[k] || k}</dt>
                  <dd className="mt-1">{DEFAULT_PARAMETERS[k].method}</dd>
                </div>
              ))}
            </dl>
            {e.parameterRefs.includes("industryGroups") && <IndustryGroups />}
          </Section>
        )}

        {/* 5. Wo wir vom Wortlaut abweichen */}
        {deviations.length > 0 && (
          <Section title="Wo wir vom Wortlaut abweichen">
            <ul className="space-y-3">
              {deviations.map((k) => {
                const d = DEFAULT_PARAMETERS[k];
                return (
                  <li key={k} className="rounded-xl border border-[var(--gold)]/40 bg-[var(--gold)]/5 px-4 py-3">
                    <p className="flex flex-wrap items-center gap-2 text-[var(--text)]">
                      {PARAMETER_TITLES[k] || k}
                      {d.derivation && <Tag tone="gold">Ableitung</Tag>}
                      {DATA_LIMIT_PARAMS.has(k) && <Tag tone="neutral">Datengrenze</Tag>}
                      {d.pendingConfirmation && <Tag tone="neutral">Vorschlag, noch nicht bestätigt</Tag>}
                    </p>
                    <p className="mt-1 text-sm">{d.method}</p>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* 6. Begründung und Alternative */}
        {refs.length > 0 && (
          <Section title="Begründung und Alternative">
            <div className="space-y-6">
              {refs.map((k) => {
                const d = DEFAULT_PARAMETERS[k];
                return (
                  <dl key={k} className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
                    <dt className="text-[var(--text)] sm:col-span-2">{PARAMETER_TITLES[k] || k}</dt>
                    <dt className="text-[var(--muted)]">Begründung</dt>
                    <dd>{d.rationale}</dd>
                    <dt className="text-[var(--muted)]">Alternative</dt>
                    <dd>{d.alternative}</dd>
                    <dt className="text-[var(--muted)]">Quelle</dt>
                    <dd>{d.source}</dd>
                  </dl>
                );
              })}
            </div>
          </Section>
        )}

        {/* 7. Zurück */}
        <nav aria-label="Weitere Prüfungen" className="mt-14 border-t border-[var(--border)] pt-6 text-sm">
          <a href={routes.methodik()} className="text-[var(--gold-soft)] underline underline-offset-2">
            ← Zur Methodik
          </a>
          {neighbours.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">Weitere Prüfungen der Stufe {stage.id}</p>
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {neighbours.map((n) => (
                  <li key={n}>
                    <a href={routes.criterion(n)} className="text-[var(--text-soft)] hover:text-[var(--text)] hover:underline">
                      <span className="font-[IBM_Plex_Mono] text-[11px] text-[var(--faint)]">{n}</span> {EXPLANATIONS[n]?.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
      </main>
    </div>
  );
}
