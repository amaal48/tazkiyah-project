// src/components/PrivacyPage.jsx
//
// Unterseite "Datenschutz" im Kontobereich. Umgesetzt: Datenexport (JSON mit
// allen Daten, CSV nur für die Watchlist da tabellarisch am sinnvollsten).
//
// "Konto löschen" ist bewusst nur als Platzhalter vorhanden — das braucht
// eine serverlose Funktion mit dem Supabase Service-Role-Key (nie im
// Frontend!), ähnlich wie api/price-history.js. Kein Nutzer kann sich über
// den normalen Client selbst löschen.

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Toast } from "./Toast";
import { AccountNav } from "./AccountNav";

const cardClass = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6";

function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(tickers) {
  return ["ticker", ...tickers].join("\n");
}

async function loadExportData(userId) {
  const [{ data: profile, error: profileError }, { data: watchlistRows, error: watchlistError }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("watchlist_items").select("ticker, created_at").eq("user_id", userId),
    ]);

  if (profileError) throw profileError;
  if (watchlistError) throw watchlistError;

  return { profile, watchlistRows: watchlistRows || [] };
}

function DataExportCard({ session, onToast }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  async function handleExportJson() {
    setError(null);
    setExporting(true);
    try {
      const { profile, watchlistRows } = await loadExportData(session.user.id);
      const exportData = {
        exportiert_am: new Date().toISOString(),
        konto: {
          email: session.user.email,
          angemeldet_seit: session.user.created_at,
        },
        profil: profile,
        watchlist: watchlistRows.map((r) => r.ticker),
      };
      downloadBlob(
        `tazkiyah-daten-${session.user.id}.json`,
        JSON.stringify(exportData, null, 2),
        "application/json"
      );
      onToast("success", "Datenexport (JSON) heruntergeladen.");
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportCsv() {
    setError(null);
    setExporting(true);
    try {
      const { watchlistRows } = await loadExportData(session.user.id);
      const csv = toCsv(watchlistRows.map((r) => r.ticker));
      downloadBlob(`tazkiyah-watchlist-${session.user.id}.csv`, csv, "text/csv");
      onToast("success", "Watchlist (CSV) heruntergeladen.");
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="font-display mb-2 text-lg text-[var(--text)]">Meine Daten exportieren</h2>
      <p className="mb-4 text-sm text-[var(--faint)]">
        Lade eine Kopie deiner gespeicherten Daten herunter — Profilangaben und Watchlist.
      </p>

      {error && <p className="mb-3 text-xs text-[var(--red-soft)]">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExportJson}
          disabled={exporting}
          className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? "…" : "Alle Daten als JSON"}
        </button>
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--text)] hover:border-[var(--gold)]/50 disabled:opacity-50"
        >
          {exporting ? "…" : "Watchlist als CSV"}
        </button>
      </div>
    </div>
  );
}

function DangerZoneCard() {
  return (
    <div className="rounded-2xl border border-[var(--red)]/40 bg-[var(--surface)] p-6">
      <h2 className="font-display mb-2 text-lg text-[var(--red-soft)]">Gefahrenzone</h2>
      <p className="text-sm text-[var(--faint)]">
        Konto löschen ist noch nicht verfügbar — das braucht eine serverlose Funktion mit erhöhten
        Rechten, die aus Sicherheitsgründen nicht direkt im Frontend laufen darf. Folgt in einem
        späteren Ausbauschritt.
      </p>
    </div>
  );
}

export function PrivacyPage({ session, onGo }) {
  const [toast, setToast] = useState(null);

  function showToast(type, message) {
    setToast({ id: Date.now(), type, message });
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-[var(--muted)]">
        Bitte melde dich an, um diesen Bereich zu sehen.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display mb-2 text-2xl text-[var(--text)]">Mein Konto</h1>
      <AccountNav active="privacy" onGo={onGo} />

      <div className="space-y-6">
        <DataExportCard session={session} onToast={showToast} />
        <DangerZoneCard />
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
