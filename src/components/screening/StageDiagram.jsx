// src/components/screening/StageDiagram.jsx
//
// Grafik der Prüfstufen: vier Stufen aus STAGES, jede Prüfung mit Link auf ihre
// Erklärseite, bei Stufe B die Grenzwerte aus den Parametern. Die Karten stehen in einem
// Raster mit auto-fit und Mindestbreite; Text bricht um, nichts wird abgeschnitten.

import { EXPLANATIONS, ETF_STAGE, STAGES, defaultParameterValues } from "../../screening/explanations.js";
import { routes } from "../../lib/hashRoute.js";
import { fmtLimit } from "./format.js";

// Grenzwert je Kennzahl-Prüfung der Stufe B
const LIMIT_PARAM = { B1: "debtMaxPct", B2: "depositsMaxPct", B3: "prohibitedIncomeMaxPct" };

function CriterionLink({ id, parameters }) {
  const limitKey = LIMIT_PARAM[id];
  const limit = limitKey ? parameters[limitKey] : null;
  return (
    <li>
      <a href={routes.criterion(id)} className="group grid grid-cols-[1.75rem_1fr] gap-x-1 py-1.5 text-sm">
        <span className="pt-px font-[IBM_Plex_Mono] text-sm text-[var(--faint)]">{id}</span>
        <span className="min-w-0 break-words text-[var(--text-soft)] group-hover:text-[var(--text)] group-hover:underline">
          {EXPLANATIONS[id]?.name || id}
          {typeof limit === "number" && <span className="block text-sm text-[var(--gold-soft)]">höchstens {fmtLimit(limit)}</span>}
        </span>
      </a>
    </li>
  );
}

export default function StageDiagram({ parameters = defaultParameterValues() }) {
  return (
    <div>
      <ol className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))" }}>
        {STAGES.map((stage, i) => (
          <li key={stage.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-display text-xl text-[var(--gold-soft)]">{i + 1}</span>
              <span className="text-[15px] text-[var(--text)]">{stage.title}</span>
              <span className="ml-auto whitespace-nowrap font-[IBM_Plex_Mono] text-sm text-[var(--faint)]">Stufe {stage.id}</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{stage.question}</p>
            <ul className="mt-3 border-t border-[var(--border)] pt-2">
              {stage.criteria.map((id) => (
                <CriterionLink key={id} id={id} parameters={parameters} />
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
        Für ETFs gilt statt der Stufen A bis D die Stufe {ETF_STAGE.id} ({ETF_STAGE.title}):{" "}
        {ETF_STAGE.criteria.map((id, i) => (
          <span key={id}>
            <a href={routes.criterion(id)} className="underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--text-soft)]">
              {EXPLANATIONS[id]?.name || id}
            </a>
            {i < ETF_STAGE.criteria.length - 1 ? ", " : ""}
          </span>
        ))}
        .
      </p>
    </div>
  );
}
