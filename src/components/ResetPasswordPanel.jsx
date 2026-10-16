// src/components/ResetPasswordPanel.jsx
//
// Wird automatisch angezeigt, wenn Supabase erkennt, dass der Nutzer über
// einen Passwort-Reset-Link in der App gelandet ist (PASSWORD_RECOVERY-
// Event, siehe App.jsx). Zeigt ein einfaches Formular zum Setzen eines
// neuen Passworts.

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ManuscriptFrame, StarMark } from "./ornaments.jsx";

export function ResetPasswordPanel({ onDone }) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="font-body fixed inset-0 z-50 overflow-y-auto bg-[var(--paper)] px-5 py-14" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <div className="mx-auto w-full max-w-[460px]">
        <div className="flex items-center gap-3">
          <StarMark size={34} />
          <span className="font-display text-[30px] font-semibold leading-none text-[var(--heading)]">Tazkiyah</span>
        </div>
        <ManuscriptFrame className="mt-8">
          <h1 id="reset-title" className="font-display text-[var(--heading)]" style={{ margin: 0, fontSize: "40px", lineHeight: 1.1, fontWeight: 500 }}>
            Neues Passwort setzen
          </h1>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="reset-pw" className="field-label">
                Neues Passwort (mind. 6 Zeichen)
              </label>
              <input id="reset-pw" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="reset-pw2" className="field-label">
                Neues Passwort bestätigen
              </label>
              <input id="reset-pw2" type="password" required minLength={6} autoComplete="new-password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} className="field w-full" />
            </div>

            <div role="status" aria-live="polite">{error && <p className="text-[15px] text-[var(--bad-text)]">{error}</p>}</div>

            <button type="submit" disabled={loading} className="btn-primary btn-gold-edge min-h-[54px] w-full disabled:opacity-60">
              {loading ? "…" : "Passwort speichern"}
            </button>
          </form>
        </ManuscriptFrame>
      </div>
    </div>
  );
}
