// src/components/AuthPanel.jsx
//
// Login/Registrierung. Bei der Registrierung werden zusätzliche Felder als
// Metadaten an supabase.auth.signUp() übergeben — ein Datenbank-Trigger
// (siehe supabase_schema_profiles.sql) legt daraus automatisch eine Zeile
// in der profiles-Tabelle an.
//
// Design B2 (16.10.2026) nach der Vorlage tazkiyah-design-b2-anmeldung.html: ganze Seite, links grüne
// Fläche mit Rosette und Spitzbogen, rechts das Formular. Ablauf und Pflichtfelder unverändert.
//
// WICHTIG: Die Links zu "AGB" und "Datenschutzerklärung" sind Platzhalter
// (href="#") — die eigentlichen rechtlichen Dokumente existieren noch nicht
// und sollten vor einem echten Launch von einer fachkundigen Stelle erstellt
// werden (siehe auch die BaFin-Einordnung im Projektstand).

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ArchFrame, ManuscriptFrame, RosetteOverlay, StarMark } from "./ornaments.jsx";

export function AuthPanel({ onClose, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode); // "login" | "signup" | "forgot"
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

  const firstField = useRef(null);
  // Escape schließt; Fokus beim Öffnen und bei Moduswechsel ins erste Feld
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    firstField.current?.focus();
  }, [mode]);

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

  const titles = { login: "Willkommen zurück", signup: "Konto erstellen", forgot: "Passwort zurücksetzen" };
  const switchMode = (m) => {
    setMode(m);
    resetMessages();
  };
  const textLink = "font-semibold text-[var(--primary)] underline-offset-2 hover:text-[var(--primary-hover)] hover:underline";

  return (
    <div className="font-body fixed inset-0 z-50 overflow-y-auto bg-[var(--paper)] text-[var(--text)]" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="flex min-h-full flex-wrap">
        {/* Links: grüne Fläche mit Muster und Spitzbogen */}
        <div className="on-green relative min-w-0 flex-[1_1_460px] overflow-hidden bg-[var(--green-deep)] text-[var(--on-green)] max-[900px]:min-h-0 min-[901px]:min-h-[560px]">
          <RosetteOverlay opacity={0.22} />
          <div className="relative flex h-full flex-col gap-10 px-12 py-8 max-[640px]:gap-6 max-[640px]:px-5 max-[640px]:py-5">
            <button type="button" onClick={onClose} className="flex min-h-[44px] items-center gap-3 self-start text-[var(--paper)]" aria-label="Tazkiyah, zur Startseite">
              <StarMark size={34} fill="var(--gold-light)" dot="var(--green-deep)" />
              <span className="font-display text-[30px] font-semibold leading-none">Tazkiyah</span>
            </button>
            <ArchFrame
              minHeight={460}
              paddingTop={170}
              double
              rosette={0}
              className="m-auto w-full max-w-[360px] max-[900px]:hidden"
            >
              <p className="font-display px-10 pb-14 text-center text-[40px] leading-[1.1]" style={{ fontWeight: 500 }}>
                Verständlich erklärt.
                <br />
                <span className="italic text-[var(--gold-light)]">Sorgfältig belegt.</span>
                <br />
                Unabhängig.
              </p>
            </ArchFrame>
            {/* Handy: Spitzbogen flach, nur der Leitsatz */}
            <ArchFrame minHeight={190} paddingTop={70} double rosette={0} className="mx-auto w-full max-w-[300px] min-[901px]:hidden">
              <p className="font-display px-6 pb-6 text-center text-[26px] leading-[1.1]" style={{ fontWeight: 500 }}>
                Verständlich erklärt. <span className="italic text-[var(--gold-light)]">Sorgfältig belegt.</span> Unabhängig.
              </p>
            </ArchFrame>
          </div>
        </div>

        {/* Rechts: Formular */}
        <div className="flex min-w-0 flex-[1_1_460px] flex-col justify-center px-8 py-14 max-[640px]:px-5 max-[640px]:py-10">
          <div className="mx-auto w-full max-w-[420px]">
            <button type="button" onClick={onClose} className={"inline-flex min-h-[44px] items-center text-[15px] " + textLink}>
              ← Zur Startseite
            </button>
            <h1 id="auth-title" className="font-display text-[var(--heading)]" style={{ margin: "28px 0 0", fontSize: "clamp(40px, 7vw, 52px)", lineHeight: 1.05, fontWeight: 500 }}>
              {titles[mode]}
            </h1>
            <p className="mt-2.5 text-[16px] text-[var(--text-soft)]">
              {mode === "login" && (
                <>
                  Noch kein Konto?{" "}
                  <button type="button" onClick={() => switchMode("signup")} className={textLink}>
                    Kostenlos registrieren
                  </button>
                </>
              )}
              {mode === "signup" && (
                <>
                  Schon ein Konto?{" "}
                  <button type="button" onClick={() => switchMode("login")} className={textLink}>
                    Anmelden
                  </button>
                </>
              )}
              {mode === "forgot" && (
                <>
                  Wir schicken dir einen Link zum Zurücksetzen.{" "}
                  <button type="button" onClick={() => switchMode("login")} className={textLink}>
                    Zurück zur Anmeldung
                  </button>
                </>
              )}
            </p>

            <form onSubmit={handleSubmit} className="mt-[34px] flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label htmlFor="auth-email" className="field-label">
                  E-Mail
                </label>
                <input
                  ref={firstField}
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@beispiel.de"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field w-full"
                />
              </div>

              {mode === "signup" && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="auth-name" className="field-label">
                    Anzeigename *
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    autoComplete="nickname"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="field w-full"
                  />
                </div>
              )}

              {mode !== "forgot" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <label htmlFor="auth-password" className="field-label">
                      Passwort{mode === "signup" ? " (mind. 6 Zeichen)" : ""}
                    </label>
                    {mode === "login" && (
                      <button type="button" onClick={() => switchMode("forgot")} className={"text-[14px] " + textLink}>
                        Vergessen?
                      </button>
                    )}
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field w-full"
                  />
                </div>
              )}

              {mode === "signup" && (
                <>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="auth-password2" className="field-label">
                      Passwort bestätigen
                    </label>
                    <input
                      id="auth-password2"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      className="field w-full"
                    />
                  </div>

                  <div className="grid gap-5 min-[480px]:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-2">
                      <label htmlFor="auth-first" className="field-label">
                        Vorname (optional)
                      </label>
                      <input id="auth-first" type="text" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="field w-full" />
                    </div>
                    <div className="flex min-w-0 flex-col gap-2">
                      <label htmlFor="auth-last" className="field-label">
                        Nachname (optional)
                      </label>
                      <input id="auth-last" type="text" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className="field w-full" />
                    </div>
                  </div>

                  <label className="flex items-start gap-3 text-[15px] text-[var(--text-soft)]">
                    <input type="checkbox" checked={newsletterOptIn} onChange={(e) => setNewsletterOptIn(e.target.checked)} className="mt-1 h-5 w-5 flex-none accent-[var(--green-deep)]" />
                    Ich möchte den wöchentlichen Marktbericht per E-Mail erhalten (optional).
                  </label>

                  <label className="flex items-start gap-3 text-[15px] text-[var(--text-soft)]">
                    <input type="checkbox" required checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} className="mt-1 h-5 w-5 flex-none accent-[var(--green-deep)]" />
                    Ich bestätige, dass ich mindestens 18 Jahre alt bin. *
                  </label>

                  <label className="flex items-start gap-3 text-[15px] text-[var(--text-soft)]">
                    <input type="checkbox" required checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-1 h-5 w-5 flex-none accent-[var(--green-deep)]" />
                    <span>
                      Ich akzeptiere die{" "}
                      <a href="#" className={textLink} onClick={(e) => e.stopPropagation()}>
                        AGB
                      </a>{" "}
                      und{" "}
                      <a href="#" className={textLink} onClick={(e) => e.stopPropagation()}>
                        Datenschutzerklärung
                      </a>
                      . *
                    </span>
                  </label>
                </>
              )}

              <div role="status" aria-live="polite">
                {error && <p className="text-[15px] text-[var(--bad-text)]">{error}</p>}
                {info && <p className="text-[15px] text-[var(--ok-text)]">{info}</p>}
              </div>

              <button type="submit" disabled={loading} className="btn-primary btn-gold-edge mt-2 min-h-[54px] w-full disabled:opacity-60">
                {loading ? "…" : mode === "login" ? "Anmelden" : mode === "signup" ? "Konto erstellen" : "Link zusenden"}
              </button>
            </form>

            <ManuscriptFrame className="mt-7" innerClassName="px-4 py-3.5">
              <p className="text-[14px] leading-relaxed text-[var(--text-soft)]">
                Kostenlos und ohne Werbung. Nutzungsbedingungen und Datenschutzerklärung folgen vor dem Start.
              </p>
            </ManuscriptFrame>
            <p className="mt-6 text-[13px] text-[var(--muted)]">Keine Anlageberatung, keine Fatwa.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
