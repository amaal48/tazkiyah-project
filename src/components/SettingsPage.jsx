// src/components/SettingsPage.jsx
//
// Unterseite "Einstellungen" im Kontobereich. Bewusst als Platzhalter, da
// Lokalisierung (Währung/Sprache/Format/Zeitzone) diese Woche noch nicht
// umgesetzt wird — Mehrsprachigkeit ist ein eigenes größeres Vorhaben, nicht
// nur ein Dropdown. Klar als "in Kürze" gekennzeichnet statt so zu tun, als
// wäre hier schon etwas Echtes vorhanden.

import { AccountNav } from "./AccountNav";

const cardClass = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6";

export function SettingsPage({ session, onGo }) {
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
      <AccountNav active="settings" onGo={onGo} />

      <div className={cardClass}>
        <h2 className="font-display mb-2 text-lg text-[var(--text)]">Lokalisierung & Anzeige</h2>
        <p className="text-sm text-[var(--faint)]">
          Basiswährung, Sprache, Zahlen-/Datumsformat und Zeitzone folgen in einem späteren
          Ausbauschritt.
        </p>
      </div>
    </div>
  );
}
