// src/components/AuthPanel.jsx
//
// Login/Registrierung. Bei der Registrierung werden zusätzliche Felder als
// Metadaten an supabase.auth.signUp() übergeben — ein Datenbank-Trigger
// (siehe supabase_schema_profiles.sql) legt daraus automatisch eine Zeile
// in der profiles-Tabelle an.
//
// WICHTIG: Die Links zu "AGB" und "Datenschutzerklärung" sind Platzhalter
// (href="#") — die eigentlichen rechtlichen Dokumente existieren noch nicht
// und sollten vor einem echten Launch von einer fachkundigen Stelle erstellt
// werden (siehe auch die BaFin-Einordnung im Projektstand).

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function AuthPanel({ onClose }) {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  function resetMessages() {
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    resetMessages();

    if (mode === "signup") {
      if (password !== passwordConfirm) {
        setError("Die Passwörter stimmen nicht überein.");
        return;
      }
      if (!displayName.trim()) {
        setError("Bitte einen Anzeigenamen angeben.");
        return;
      }
      if (!ageConfirmed) {
        setError("Bitte bestätige, dass du mindestens 18 Jahre alt bist.");
        return;
      }
      if (!termsAccepted) {
        setError("Bitte akzeptiere die AGB und Datenschutzerklärung.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName.trim(),
              first_name: firstName.trim() || null,
              last_name: lastName.trim() || null,
              newsletter_opt_in: newsletterOptIn,
              age_confirmed: ageConfirmed,
            },
          },
        });
        if (error) throw error;
        setInfo("Konto erstellt. Falls E-Mail-Bestätigung aktiviert ist, prüfe dein Postfach — sonst kannst du dich jetzt direkt einloggen.");
        setMode("login");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setInfo("Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen des Passworts verschickt.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const titles = { login: "Anmelden", signup: "Konto erstellen", forgot: "Passwort zurücksetzen" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl text-[var(--text)]">{titles[mode]}</h2>
          <button onClick={onClose} className="text-[var(--faint)] hover:text-[var(--text)]" aria-label="Schließen">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="E-Mail-Adresse"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-full border border-[var(--border)] bg-[var(--bg-deep)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
          />

          {mode === "signup" && (
            <input
              type="text"
              required
              placeholder="Anzeigename *"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-full border border-[var(--border)] bg-[var(--bg-deep)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
            />
          )}

          {mode !== "forgot" && (
            <input
              type="password"
              required
              minLength={6}
              placeholder="Passwort (mind. 6 Zeichen)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-full border border-[var(--border)] bg-[var(--bg-deep)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
            />
          )}

          {mode === "signup" && (
            <>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Passwort bestätigen"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="w-full rounded-full border border-[var(--border)] bg-[var(--bg-deep)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
              />

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Vorname (optional)"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-1/2 rounded-full border border-[var(--border)] bg-[var(--bg-deep)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Nachname (optional)"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-1/2 rounded-full border border-[var(--border)] bg-[var(--bg-deep)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
                />
              </div>

              <label className="flex items-start gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={newsletterOptIn}
                  onChange={(e) => setNewsletterOptIn(e.target.checked)}
                  className="mt-0.5 accent-[var(--gold)]"
                />
                Ich möchte den wöchentlichen Marktbericht per E-Mail erhalten (optional).
              </label>

              <label className="flex items-start gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  required
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  className="mt-0.5 accent-[var(--gold)]"
                />
                Ich bestätige, dass ich mindestens 18 Jahre alt bin. *
              </label>

              <label className="flex items-start gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 accent-[var(--gold)]"
                />
                Ich akzeptiere die{" "}
                <a href="#" className="text-[var(--primary)] hover:underline" onClick={(e) => e.stopPropagation()}>AGB</a>{" "}
                und{" "}
                <a href="#" className="text-[var(--primary)] hover:underline" onClick={(e) => e.stopPropagation()}>Datenschutzerklärung</a>. *
              </label>
            </>
          )}

          {mode === "login" && (
            <button
              type="button"
              onClick={() => { setMode("forgot"); resetMessages(); }}
              className="block text-sm text-[var(--faint)] hover:text-[var(--primary)]"
            >
              Passwort vergessen?
            </button>
          )}

          {error && <p className="text-sm text-[var(--red-soft)]">{error}</p>}
          {info && <p className="text-sm text-[var(--emerald-soft)]">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {loading ? "…" : mode === "login" ? "Anmelden" : mode === "signup" ? "Konto erstellen" : "Link zusenden"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            resetMessages();
          }}
          className="mt-4 w-full text-center text-sm text-[var(--muted)] hover:text-[var(--primary)]"
        >
          {mode === "signup" ? "Schon ein Konto? Anmelden" : mode === "forgot" ? "Zurück zur Anmeldung" : "Noch kein Konto? Registrieren"}
        </button>
      </div>
    </div>
  );
}
