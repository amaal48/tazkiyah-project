// src/components/ResetPasswordPanel.jsx
//
// Wird automatisch angezeigt, wenn Supabase erkennt, dass der Nutzer über
// einen Passwort-Reset-Link in der App gelandet ist (PASSWORD_RECOVERY-
// Event, siehe App.jsx). Zeigt ein einfaches Formular zum Setzen eines
// neuen Passworts.

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--text)]/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="font-display mb-4 text-xl text-[var(--text)]">Neues Passwort setzen</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            required
            minLength={6}
            placeholder="Neues Passwort (mind. 6 Zeichen)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-full border border-[var(--border)] bg-[var(--bg-deep)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--faint)]"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Neues Passwort bestätigen"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            className="w-full rounded-full border border-[var(--border)] bg-[var(--bg-deep)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--faint)]"
          />

          {error && <p className="text-sm text-[var(--red-soft)]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {loading ? "…" : "Passwort speichern"}
          </button>
        </form>
      </div>
    </div>
  );
}
