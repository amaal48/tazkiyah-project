// src/components/akademie/Quiz.jsx
//
// „Kurzes Quiz“ einer Lektion: je Frage ein <fieldset> mit <legend>, 2–4 Antworten als Knöpfe (mind. 48 px).
// Nach dem Antippen: richtige Antwort grün („Richtig“), gewählte falsche sanft rot („Nicht ganz“), darunter
// „Genau.“ bzw. „Nicht ganz.“ und die Erklärung. Neu wählen möglich. Es wird nichts gespeichert.

import { useState } from "react";
import { LessonInline } from "./LessonText.jsx";
import { parseLessonInline } from "../../lib/lessons.js";

function Question({ q, n }) {
  const [chosen, setChosen] = useState(null);
  const answered = chosen !== null;
  const correct = answered && q.antworten[chosen].richtig;
  return (
    <fieldset className="mt-6 min-w-0 border-0 p-0 first:mt-0">
      <legend className="font-body text-[18px] font-semibold leading-snug text-[var(--text)]">
        <span className="kicker mr-2">Frage {n}</span>
        <LessonInline parts={parseLessonInline(q.frage)} />
      </legend>
      <div className="mt-3 grid gap-2">
        {q.antworten.map((a, i) => {
          const isRight = answered && a.richtig;
          const isWrongPick = answered && i === chosen && !a.richtig;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setChosen(i)}
              aria-pressed={i === chosen}
              className={
                "font-body flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[17px] " +
                (isRight
                  ? "border-2 border-[var(--primary)] bg-[var(--ok-bg)] text-[var(--text)]"
                  : isWrongPick
                    ? "border border-[var(--bad-border)] bg-[var(--bad-bg)] text-[var(--text)]"
                    : "border border-[var(--control-border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--green-deep)]")
              }
            >
              <span className="min-w-0">
                <LessonInline parts={parseLessonInline(a.text)} />
              </span>
              {isRight && <span className="flex-none text-[14px] font-semibold text-[var(--ok-text)]">Richtig</span>}
              {isWrongPick && <span className="flex-none text-[14px] font-semibold text-[var(--bad-text)]">Nicht ganz</span>}
            </button>
          );
        })}
      </div>
      <div role="status" aria-live="polite">
        {answered && (
          <p className="font-body fade-in mt-3 text-[16px] leading-relaxed text-[var(--text-soft)]">
            <strong className="text-[var(--text)]">{correct ? "Genau." : "Nicht ganz."}</strong>{" "}
            {q.erklaerung && <LessonInline parts={parseLessonInline(q.erklaerung)} />}
          </p>
        )}
      </div>
    </fieldset>
  );
}

export default function Quiz({ fragen }) {
  return (
    <div>
      <p className="font-body mb-5 text-[15px] text-[var(--muted)]">Tipp eine Antwort an. Es wird nichts gespeichert.</p>
      {fragen.map((q, i) => (
        <Question key={i} q={q} n={i + 1} />
      ))}
    </div>
  );
}
