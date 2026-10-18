// src/components/SiteHeader.jsx
//
// Schmale Leiste oben, NUR unter 1024 px (seit 18.10.2026, Entwurf „Seitenleiste A überarbeitet“): Menüknopf,
// Logo, Personen-Zeichen (abgemeldet → Anmelde-Dialog, angemeldet → Kontomenü). Der Menüknopf öffnet die
// Seitenleiste als Menü von links (NavDrawer in Sidebar.jsx) mit Suche, Punkten und Kontobereich.
// Auf dem Desktop gibt es keine Kopfleiste; Suche und Konto stehen in der Seitenleiste.

import { useEffect, useRef, useState } from "react";
import { StarMark } from "./ornaments.jsx";
import { AccountMenu, Icon, NavDrawer } from "./Sidebar.jsx";

const SQUARE = "inline-flex h-11 w-11 flex-none items-center justify-center border border-[var(--control-border)] bg-[var(--surface)] text-[var(--green-deep)]";

export default function SiteHeader({ page, onGo, session, onOpenAuth, onSignOut, isAdmin = false, watchCount = 0 }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef(null);

  // Seitenwechsel auf anderem Weg (Zurück-Taste, Link im Inhalt): Menü schließen
  useEffect(() => setDrawerOpen(false), [page]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  };

  return (
    <header className="relative z-30 border-b border-[var(--border)] bg-[var(--paper)] lg:hidden">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Menü öffnen"
          aria-expanded={drawerOpen}
          aria-controls="mobile-menu"
          className={SQUARE}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <a
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            onGo("home");
          }}
          className="flex min-h-[44px] min-w-0 items-center gap-2"
          aria-label="Tazkiyah, zur Startseite"
        >
          <StarMark size={28} />
          <span className="font-display text-[26px] font-semibold leading-none text-[var(--heading)]">Tazkiyah</span>
        </a>

        <div className="ml-auto flex-none">
          {session ? (
            <AccountMenu
              email={session.user?.email || ""}
              isAdmin={isAdmin}
              onGo={onGo}
              onSignOut={onSignOut}
              placement="down"
              menuClassName="w-56"
              renderTrigger={({ open, toggle, ref, menuId }) => (
                <button ref={ref} type="button" onClick={toggle} aria-expanded={open} aria-haspopup="true" aria-controls={open ? menuId : undefined} aria-label="Kontomenü" className={SQUARE}>
                  <Icon name="konto" />
                </button>
              )}
            />
          ) : (
            <button type="button" onClick={() => onOpenAuth("login")} aria-label="Anmelden" title="Anmelden" className={SQUARE}>
              <Icon name="konto" />
            </button>
          )}
        </div>
      </div>

      <NavDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        page={page}
        onGo={onGo}
        session={session}
        isAdmin={isAdmin}
        watchCount={watchCount}
        onOpenAuth={onOpenAuth}
        onSignOut={onSignOut}
      />
    </header>
  );
}
