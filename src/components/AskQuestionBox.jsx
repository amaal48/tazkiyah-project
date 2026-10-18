// src/components/AskQuestionBox.jsx
//
// Feld „Frage nicht gefunden?“ (Akademie) bzw. „Etwas unklar geblieben?“ (Lektionen). Ausgelagert aus App.jsx
// am 18.10.2026.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Bewusst klein und unauffällig gehalten, keine "KI-Chat"-Sprache.
// Fragen landen in Supabase (academy_questions). Besucher dürfen nur einreichen, nicht
// lesen, deshalb kein .select() nach dem insert. Die Datenbank drosselt zusätzlich.
const QUESTION_MIN = 5;
const QUESTION_MAX = 500;
const QUESTION_COOLDOWN_MS = 30_000;
// Nur im Arbeitsspeicher: gilt für diese Sitzung, bis die Seite neu geladen wird.
let lastQuestionSentAt = 0;

/** label: Überschrift des Felds; page: Herkunft der Frage in academy_questions (z. B. „akademie“, „lernen/1-3“). */
export default function AskQuestionBox({ label = "Frage nicht gefunden?", page = "akademie" }) {
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
      ({ error } = await supabase.from("academy_questions").insert({ question: trimmed, page }));
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
      <label htmlFor="academy-question" className="text-sm text-[var(--faint)]">{label}</label>
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
