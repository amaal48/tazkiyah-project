// src/components/ProfilePage.jsx
//
// Unterseite "Profil" im Kontobereich. Enthält nur noch Persönliche
// Informationen (Anzeigename, Vor-/Nachname, E-Mail-Status, Newsletter).
// Passwort wurde nach SecurityPage.jsx verschoben, Lokalisierung folgt
// (Platzhalter) in SettingsPage.jsx.
//
// Speichert sowohl in user_metadata als auch in der profiles-Tabelle (siehe
// supabase_schema_profiles.sql).

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Toast } from "./Toast";
import { AccountNav } from "./AccountNav";

const cardClass = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6";
const inputClass =
  "w-full rounded-full border border-[var(--border)] bg-[var(--bg-deep)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--faint)]";
const labelClass = "mb-1 block text-sm text-[var(--muted)]";

function PersonalInfoCard({ session, onToast }) {
  const meta = session?.user?.user_metadata || {};
  const [displayName, setDisplayName] = useState(meta.display_name || "");
  const [firstName, setFirstName] = useState(meta.first_name || "");
  const [lastName, setLastName] = useState(meta.last_name || "");
  const [newsletterOptIn, setNewsletterOptIn] = useState(!!meta.newsletter_opt_in);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState(null);

  const email = session?.user?.email || "";
  const verified = !!session?.user?.email_confirmed_at;

  async function handleSave(e) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim()) {
      setError("Bitte einen Anzeigenamen angeben.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        display_name: displayName.trim(),
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        newsletter_opt_in: newsletterOptIn,
      };

      const { error: metaError } = await supabase.auth.updateUser({ data: payload });
      if (metaError) throw metaError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", session.user.id);
      if (profileError) throw profileError;

      onToast("success", "Profil erfolgreich aktualisiert.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      onToast("success", "Bestätigungs-E-Mail erneut gesendet.");
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="font-display mb-4 text-lg text-[var(--text)]">Persönliche Informationen</h2>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className={labelClass}>Anzeigename *</label>
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Vorname</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Nachname</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>E-Mail-Adresse</label>
          <div className="flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--bg-deep)] px-4 py-2.5">
            <span className="flex-1 truncate text-sm text-[var(--text)]">{email}</span>
            <span
              className={
                "rounded-full px-2 py-0.5 text-sm font-medium " +
                (verified
                  ? "bg-[var(--emerald)]/20 text-[var(--emerald-soft)]"
                  : "bg-[var(--amber)]/20 text-[var(--amber-soft)]")
              }
            >
              {verified ? "Verifiziert" : "Nicht verifiziert"}
            </span>
          </div>
          {!verified && (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="mt-1 text-sm text-[var(--faint)] hover:text-[var(--primary)] disabled:opacity-50"
            >
              {resending ? "…" : "Bestätigungs-E-Mail erneut senden"}
            </button>
          )}
          <p className="mt-1 text-sm text-[var(--faint)]">
            E-Mail-Adresse ändern folgt in einem späteren Ausbauschritt.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={newsletterOptIn}
            onChange={(e) => setNewsletterOptIn(e.target.checked)}
            className="mt-0.5"
          />
          <span>Newsletter erhalten (jederzeit hier abbestellbar).</span>
        </label>

        {error && <p className="text-sm text-[var(--red-soft)]">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
        >
          {saving ? "…" : "Speichern"}
        </button>
      </form>
    </div>
  );
}

export function ProfilePage({ session, onGo }) {
  const [toast, setToast] = useState(null);

  function showToast(type, message) {
    setToast({ id: Date.now(), type, message });
  }

  if (!session) {
    return (
      <div className="page max-w-2xl py-16 text-center text-sm text-[var(--muted)]">
        Bitte melde dich an, um dein Profil zu sehen.
      </div>
    );
  }

  return (
    <div className="page max-w-2xl py-12">
      <h1 className="font-display mb-2 text-2xl text-[var(--text)]">Mein Konto</h1>
      <AccountNav active="profile" onGo={onGo} />

      <div className="space-y-6">
        <PersonalInfoCard session={session} onToast={showToast} />
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
