// src/components/SecurityPage.jsx
//
// Unterseite "Sicherheit" im Kontobereich. Aktuell nur Passwort ändern
// (hierher verschoben aus ProfilePage.jsx). Geplante spätere Erweiterungen
// (siehe Projektnotizen, bewusst noch nicht umgesetzt):
//   - Verknüpfte Konten (OAuth Google/Apple)
//   - Aktive Sitzungen/Geräte
//   - Zwei-Faktor-Authentifizierung (2FA/TOTP)

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Toast } from "./Toast";
import { AccountNav } from "./AccountNav";

const cardClass = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6";
const inputClass =
  "w-full rounded-full border border-[var(--border)] bg-[var(--bg-deep)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none";
const labelClass = "mb-1 block text-sm text-[var(--muted)]";

function passwordStrength(pw) {
  if (!pw) return { label: "", color: "" };
  if (pw.length < 6) return { label: "Zu kurz", color: "text-[var(--red-soft)]" };
  if (pw.length < 10) return { label: "Mittel", color: "text-[var(--amber-soft)]" };
  return { label: "Stark", color: "text-[var(--emerald-soft)]" };
}

function PasswordCard({ onToast }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const strength = passwordStrength(newPassword);

  async function handleSave(e) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      onToast("success", "Passwort erfolgreich geändert.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="font-display mb-4 text-lg text-[var(--text)]">Passwort ändern</h2>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className={labelClass}>Neues Passwort</label>
          <input
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
          {newPassword && (
            <p className={"mt-1 text-sm " + strength.color}>Passwortstärke: {strength.label}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Neues Passwort bestätigen</label>
          <input
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && <p className="text-sm text-[var(--red-soft)]">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50"
        >
          {saving ? "…" : "Passwort speichern"}
        </button>
      </form>
    </div>
  );
}

function ConnectedAccountsPlaceholder() {
  return (
    <div className={cardClass}>
      <h2 className="font-display mb-2 text-lg text-[var(--text)]">Verknüpfte Konten & 2FA</h2>
      <p className="text-sm text-[var(--faint)]">
        OAuth-Verknüpfungen (Google/Apple), aktive Sitzungen und Zwei-Faktor-Authentifizierung folgen in
        einem späteren Ausbauschritt.
      </p>
    </div>
  );
}

export function SecurityPage({ session, onGo }) {
  const [toast, setToast] = useState(null);

  function showToast(type, message) {
    setToast({ id: Date.now(), type, message });
  }

  if (!session) {
    return (
      <div className="page max-w-2xl py-16 text-center text-sm text-[var(--muted)]">
        Bitte melde dich an, um diesen Bereich zu sehen.
      </div>
    );
  }

  return (
    <div className="page max-w-2xl py-12">
      <h1 className="font-display mb-2 text-2xl text-[var(--text)]">Mein Konto</h1>
      <AccountNav active="security" onGo={onGo} />

      <div className="space-y-6">
        <PasswordCard onToast={showToast} />
        <ConnectedAccountsPlaceholder />
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
