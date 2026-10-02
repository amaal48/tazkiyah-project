// src/components/screening/StageDiagram.jsx
//
// Grafik der Prüfstufen: vier Stufen aus STAGES, jede Prüfung mit Link auf ihre
// Erklärseite, bei Stufe B die Grenzwerte aus den Parametern. Endet in den drei Status.

import { EXPLANATIONS, ETF_STAGE, STAGES, defaultParameterValues } from "../../screening/explanations.js";
import { routes } from "../../lib/hashRoute.js";
import { fmtLimit } from "./format.js";
import StatusBadge from "./StatusBadge.jsx";

// Grenzwert je Kennzahl-Prüfung der Stufe B
const LIMIT_PARAM = { B1: "debtMaxPct", B2: "depositsMaxPct", B3: "prohibitedIncomeMaxPct" };

function CriterionLink({ id, parameters }) {
  const limitKey = LIMIT_PARAM[id];
  const limit = limitKey ? parameters[limitKey] : null;
  return (
    <li>
      <a href={routes.criterion(id)} className="group flex items-baseline gap-2 py-1 text-sm">
        <span className="w-6 flex-shrink-0 font-[IBM_Plex_Mono] text-[11px] text-[var(--faint)]">{id}</span>
        <span className="text-[var(--text-soft)] group-hover:text-[var(--text)] group-hover:underline">
          {EXPLANATIONS[id]?.name || id}
          {typeof limit === "number" && <span className="whitespace-nowrap text-[var(--gold-soft)]"> · höchstens {fmtLimit(limit)}</span>}
        </span>
      </a>
    </li>
  );
}

export default function StageDiagram({ parameters = defaultParameterValues() }) {
  return (
    <div>
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((stage, i) => (
          <li key={stage.id} className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="flex items-baseline gap-2">
              <span className="font-display text-xl text-[var(--gold-soft)]">{i + 1}</span>
              <span className="text-[15px] text-[var(--text)]">{stage.title}</span>
              <span className="ml-auto font-[IBM_Plex_Mono] text-[11px] text-[var(--faint)]">Stufe {stage.id}</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{stage.question}</p>
            <ul className="mt-3 border-t border-[var(--border)] pt-2">
              {stage.criteria.map((id) => (
                <CriterionLink key={id} id={id} parameters={parameters} />
              ))}
            </ul>
            {i < STAGES.length - 1 && (
              <span aria-hidden="true" className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-[var(--faint)] xl:block">
                →
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[var(--border)] px-5 py-4 text-sm">
        <span className="text-[var(--muted)]">Ergebnis:</span>
        <StatusBadge status="konform" />
        <StatusBadge status="nicht_konform" />
        <StatusBadge status="nicht_geprueft" />
        <span className="w-full text-xs text-[var(--faint)] sm:ml-auto sm:w-auto">
          Für ETFs gilt statt der Stufen A bis D die Stufe {ETF_STAGE.id} ({ETF_STAGE.title}):{" "}
          {ETF_STAGE.criteria.map((id, i) => (
            <span key={id}>
              <a href={routes.criterion(id)} className="underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--text-soft)]">
                {id}
              </a>
              {i < ETF_STAGE.criteria.length - 1 ? ", " : ""}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
