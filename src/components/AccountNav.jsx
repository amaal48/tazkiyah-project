// src/components/AccountNav.jsx
//
// Gemeinsame Tab-Navigation für den Kontobereich. Wird oben auf allen drei
// Unterseiten (ProfilePage, SecurityPage, SettingsPage) angezeigt, damit man
// zwischen ihnen wechseln kann, ohne jedes Mal über das Sidebar-Dropdown zu
// gehen.

const TABS = [
  { key: "profile", label: "Profil" },
  { key: "security", label: "Sicherheit" },
  { key: "settings", label: "Einstellungen" },
  { key: "privacy", label: "Datenschutz" },
];

export function AccountNav({ active, onGo }) {
  return (
    <div className="mb-8 flex gap-1 border-b border-[var(--border)]">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onGo(tab.key)}
          className={
            "px-4 py-2.5 text-sm font-medium transition-colors " +
            (active === tab.key
              ? "border-b-2 border-[var(--gold)] text-[var(--text)]"
              : "text-[var(--muted)] hover:text-[var(--text)]")
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
