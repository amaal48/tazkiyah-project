// src/components/SiteHeader.jsx
//
// Schmale Kopfleiste (seit 17.10.2026, Navigation als Seitenleiste): Logo, Suchfeld (springt in die Aktiensuche,
// #/aktien?suche=…), Anmelden bzw. Kontomenü. Die Bereiche stehen in der Seitenleiste (Sidebar.jsx); unter
// 1024 px öffnet der Menüknopf links dieselben Punkte als Menü von links (NavDrawer). Darunter der Fries.

import { useEffect, useRef, useState } from "react";
import { Frieze, StarMark } from "./ornaments.jsx";
import { NavDrawer } from "./Sidebar.jsx";
import { navigate, routes } from "../lib/hashRoute.js";

/** Logo: achtzackiger Stern (Dunkelgrün, Punkt in Hellgold), daneben der Name (Design B2). */
function Logo({ onGo }) {
  return (
    <a
      href="#/"
      onClick={(e) => {
        e.preventDefault();
        onGo("home");
      }}
      className="flex min-h-[44px] flex-none items-center gap-2"
      aria-label="Tazkiyah, zur Startseite"
    >
      <StarMark size={30} />
      <span className="font-display text-[28px] font-semibold leading-none text-[var(--heading)]">Tazkiyah</span>
    </a>
  );
}

function Chevron({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={"transition-transform " + (open ? "rotate-180" : "")}>
      <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Suchfeld: Name oder Ticker → Aktiensuche mit dem Begriff. */
function SearchForm({ id, onDone, className = "" }) {
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={"flex min-w-0 " + className}
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        navigate(routes.aktien(term || undefined));
        onDone?.();
      }}
    >
      <label htmlFor={id} className="sr-only-label">
        Aktie suchen (Name oder Ticker)
      </label>
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Aktie suchen"
        className="field min-h-[44px] min-w-0 flex-1 text-[16px]"
        autoComplete="off"
      />
      <button type="submit" className="inline-flex h-11 w-11 flex-none items-center justify-center border border-l-0 border-[var(--green-deep)] bg-[var(--green-deep)] text-[var(--paper)]" aria-label="Suchen">
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.2 12.2 17 17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}

export default function SiteHeader({ page, onGo, session, onOpenAuth, onSignOut, isAdmin = false, watchCount = 0 }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const accountRef = useRef(null);
  const menuButtonRef = useRef(null);

  // Escape und Klick außerhalb schließen das Kontomenü
  useEffect(() => {
    if (!accountOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setAccountOpen(false);
    const onClick = (e) => accountRef.current && !accountRef.current.contains(e.target) && setAccountOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [accountOpen]);

  // Seitenwechsel auf anderem Weg (Zurück-Taste, Link im Inhalt): Menü schließen
  useEffect(() => setDrawerOpen(false), [page]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  };

  const accountEntries = [
    ["Profil", "profile"],
    ["Einstellungen", "settings"],
    ["Sicherheit", "security"],
    ["Datenschutz", "privacy"],
    ...(isAdmin ? [["Redaktion", "redaktion"]] : []),
  ];
  const go = (p) => {
    setAccountOpen(false);
    onGo(p);
  };

  return (
    <header className="relative z-30 bg-[var(--bg)]">
      <div className="flex min-h-[64px] items-center gap-3 px-4 sm:px-6">
        {/* Menüknopf unter 1024 px */}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Menü öffnen"
          aria-expanded={drawerOpen}
          aria-controls="mobile-menu"
          className="inline-flex h-11 w-11 flex-none items-center justify-center border border-[var(--control-border)] bg-[var(--surface)] text-[var(--text)] lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <Logo onGo={onGo} />

        <SearchForm id="kopf-suche" className="ml-auto hidden w-full max-w-[360px] sm:flex" />

        <div className="ml-auto flex flex-none items-center sm:ml-0" ref={accountRef}>
          {session ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                aria-expanded={accountOpen}
                aria-haspopup="true"
                className="inline-flex min-h-[44px] items-center gap-2 border border-[var(--control-border)] bg-[var(--surface)] px-3 text-[15px] text-[var(--text)]"
              >
                <span className="hidden max-w-[12rem] truncate md:inline">{session.user.email}</span>
                <span className="md:hidden">Konto</span>
                <Chevron open={accountOpen} />
              </button>
              {accountOpen && (
                <div className="absolute right-0 top-full z-40 mt-1 w-56 border border-[var(--border)] bg-[var(--surface)] py-1">
                  <p className="truncate px-4 py-2 text-[14px] text-[var(--muted)] md:hidden">{session.user.email}</p>
                  {accountEntries.map(([label, p]) => (
                    <button key={p} type="button" onClick={() => go(p)} className="flex min-h-[44px] w-full items-center px-4 text-left text-[15px] text-[var(--text)] hover:bg-[var(--bg)]">
                      {label}
                    </button>
                  ))}
                  <div className="my-1 border-t border-[var(--line)]" />
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      onSignOut();
                    }}
                    className="flex min-h-[44px] w-full items-center px-4 text-left text-[15px] text-[var(--bad-text)] hover:bg-[var(--bg)]"
                  >
                    Abmelden
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={onOpenAuth} className="btn-primary min-h-[44px] px-4 py-2 text-[16px]">
              Anmelden
            </button>
          )}
        </div>
      </div>

      <Frieze />

      <NavDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        page={page}
        onGo={onGo}
        session={session}
        isAdmin={isAdmin}
        watchCount={watchCount}
        searchSlot={<SearchForm id="menue-suche" onDone={() => setDrawerOpen(false)} />}
      />
    </header>
  );
}
