// src/components/Toast.jsx
//
// Generische Toast-Komponente. Nimmt das {id, type, message}-Objekt aus
// useWatchlist() (oder jeder anderen Quelle mit gleicher Form) entgegen.
// Selbstständiges Ausblenden nach `duration` ms, zusätzlich manuell schließbar.

import { useEffect } from "react";

const TYPE_STYLES = {
  warning: "border-[var(--amber)]/40 text-[var(--amber-soft)]",
  error: "border-[var(--red)]/40 text-[var(--red-soft)]",
  success: "border-[var(--emerald)]/40 text-[var(--emerald-soft)]",
  info: "border-[var(--border)] text-[var(--text-soft)]",
};

export function Toast({ toast, onDismiss, duration = 4000 }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss, duration]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-[var(--bg-deep)] px-5 py-3 text-sm " +
        (TYPE_STYLES[toast.type] || TYPE_STYLES.info)
      }
    >
      <span>{toast.message}</span>
      <button onClick={onDismiss} className="text-sm text-[var(--faint)] hover:text-[var(--text)]" aria-label="Schließen">
        ✕
      </button>
    </div>
  );
}
