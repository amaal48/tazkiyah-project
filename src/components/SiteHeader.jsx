// src/components/SiteHeader.jsx
//
// Kopfleiste (Design B) statt der früheren Sidebar. Seit 16.10.2026 (Neue Ausrichtung), alle Punkte
// gleich gewichtet: Lernen, Methodik, Tazkiyah 30, Aktien, Berichte, Kalender. Ab 900 px: Logo, Hauptpunkte mit
// Aufklappmenüs für die Unterpunkte, Anmelden bzw. Kontomenü. Darunter: Menüknopf, der ein
// Panel mit allen Punkten öffnet. Escape und Klick außerhalb schließen offene Menüs.

import { useEffect, useRef, useState } from "react";
import { Frieze, StarMark } from "./ornaments.jsx";

/** Logo: achtzackiger Stern (Dunkelgrün, Punkt in Hellgold), daneben der Name (Design B2). */
function Logo({ onGo }) {
  return (
    <a
      href="#/"
      onClick={() => onGo("home")}
      className="flex min-h-[44px] items-center gap-2.5"
      aria-label="Tazkiyah, zur Startseite"
    >
      <StarMark size={36} />
      <span className="font-display text-[32px] font-semibold leading-none text-[var(--heading)]">Tazkiyah</span>
    </a>
  );
}

function Count({ n, max }) {
  if (!n) return null;
  return (
    <span className="ml-1.5 bg-[var(--primary)] px-2 py-0.5 text-[13px] font-semibold leading-none text-[var(--on-primary)]">
      {n}
      {max ? `/${max}` : ""}
    </span>
  );
}

function Chevron({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={"transition-transform " + (open ? "rotate-180" : "")}>
      <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Unterpunkte einer Gruppe (Überschriften, Filter, Seiten) als Liste. */
function SubItems({ group, onPick, activeFilter }) {
  return (
    <ul className="py-1">
      {group.children.map((child, i) =>
        child.type === "heading" ? (
          <li key={i} className="px-4 pb-1 pt-3 text-[14px] font-semibold text-[var(--muted)]">
            {child.label}
          </li>
        ) : (
          <li key={child.label}>
            <button
              type="button"
              onClick={() => onPick(child)}
              className={
                "flex min-h-[44px] w-full items-center px-4 text-left text-[15px] hover:bg-[var(--bg)] " +
                (activeFilter && child.filter && activeFilter.type === child.filter.type && activeFilter.value === child.filter.value
                  ? "font-semibold text-[var(--primary)]"
                  : "text-[var(--text)]")
              }
            >
              {child.label}
            </button>
          </li>
        )
      )}
    </ul>
  );
}

export default function SiteHeader({ page, activeFilter, onGo, session, onOpenAuth, onSignOut }) {
  const [openGroup, setOpenGroup] = useState(null); // Aufklappmenü am Hauptpunkt (Desktop)
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileGroup, setMobileGroup] = useState(null);
  const ref = useRef(null);

  const closeAll = () => {
    setOpenGroup(null);
    setAccountOpen(false);
    setMobileOpen(false);
  };

  // Escape und Klick außerhalb schließen alle Menüs
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && closeAll();
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && closeAll();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  const go = (p, anchor, filter) => {
    closeAll();
    onGo(p, anchor, filter);
  };
  const pick = (child) =>
    child.type === "filter" ? go("tazkiyah30", null, child.filter) : go(child.page, child.anchor, child.reset ? { type: "all" } : undefined);

  // Hauptpunkte in der Reihenfolge der Kopfleiste. Ohne Aufklappmenüs, damit alle Punkte gleich gewichtet
  // sind (das Untermenü „PDF-Berichte“ führte auf dieselbe Seite). Die Unterstützung für it.group bleibt.
  const ACTIVE_PAGES = {
    lernen: ["faq"],
    methodik: ["methodik", "methodik2", "criterion"],
    tazkiyah30: ["tazkiyah30", "detail", "sectors"],
    aktien: ["aktien"],
    berichte: ["reports", "blog", "blogpost"],
    kalender: ["calendar"],
  };
  // „Lernen“ führt zur Akademie mit dem Lernpfad (#/lernen)
  const items = [
    { key: "lernen", label: "Lernen", page: "faq" },
    { key: "methodik", label: "Methodik", page: "methodik" },
    { key: "tazkiyah30", label: "Tazkiyah 30", page: "tazkiyah30" },
    { key: "aktien", label: "Aktien", page: "aktien" },
    { key: "berichte", label: "Berichte", page: "reports" },
    { key: "kalender", label: "Kalender", page: "calendar" },
  ];
  const isActive = (it) => ACTIVE_PAGES[it.key]?.includes(page);

  const accountEntries = [
    ["Profil", "profile"],
    ["Einstellungen", "settings"],
    ["Sicherheit", "security"],
    ["Datenschutz", "privacy"],
  ];

  const navLink = (it) =>
    "inline-flex min-h-[44px] items-center border-b-2 text-[16px] font-medium " +
    (isActive(it) ? "border-[var(--gold)] text-[var(--green-deep)]" : "border-transparent text-[var(--green-deep)] hover:border-[var(--border)]");

  return (
    <header ref={ref} className="relative z-30 bg-[var(--bg)]">
      <div className="page flex min-h-[84px] items-center gap-6">
        <Logo onGo={go} />

        {/* Hauptpunkte ab 900 px */}
        <nav aria-label="Hauptnavigation" className="ml-4 hidden flex-1 items-center justify-center gap-7 min-[900px]:flex">
          {items.map((it) => (
            <div key={it.key} className="relative flex items-center">
              <button type="button" onClick={() => go(it.page)} className={navLink(it)} aria-current={isActive(it) ? "page" : undefined}>
                {it.label}
                <Count n={it.count} max={it.max} />
              </button>
              {it.group && (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenGroup(openGroup === it.key ? null : it.key)}
                    aria-expanded={openGroup === it.key}
                    aria-label={`Unterpunkte von ${it.label}`}
                    className="ml-0.5 inline-flex h-11 w-7 items-center justify-center text-[var(--muted)] hover:text-[var(--primary)]"
                  >
                    <Chevron open={openGroup === it.key} />
                  </button>
                  {openGroup === it.key && (
                    <div className="absolute left-0 top-full z-40 mt-1 max-h-[70vh] w-64 overflow-y-auto border border-[var(--border)] bg-[var(--surface)]">
                      <SubItems group={it.group} onPick={pick} activeFilter={activeFilter} />
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </nav>

        {/* Anmelden bzw. Konto ab 900 px */}
        <div className="ml-auto hidden items-center min-[900px]:flex">
          {session ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                aria-expanded={accountOpen}
                className="inline-flex min-h-[44px] max-w-[16rem] items-center gap-2 border border-[var(--control-border)] bg-[var(--surface)] px-4 text-[15px] text-[var(--text)]"
              >
                <span className="truncate">{session.user.email}</span>
                <Chevron open={accountOpen} />
              </button>
              {accountOpen && (
                <div className="absolute right-0 top-full z-40 mt-1 w-56 border border-[var(--border)] bg-[var(--surface)] py-1">
                  {accountEntries.map(([label, p]) => (
                    <button key={p} type="button" onClick={() => go(p)} className="flex min-h-[44px] w-full items-center px-4 text-left text-[15px] text-[var(--text)] hover:bg-[var(--bg)]">
                      {label}
                    </button>
                  ))}
                  <div className="my-1 border-t border-[var(--line)]" />
                  <button
                    type="button"
                    onClick={() => {
                      closeAll();
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
            <button type="button" onClick={onOpenAuth} className="btn-primary min-h-[44px] px-5 py-2.5">
              Anmelden
            </button>
          )}
        </div>

        {/* Menüknopf unter 900 px */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Menü schließen" : "Menü öffnen"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          className="ml-auto inline-flex h-11 w-11 items-center justify-center border border-[var(--control-border)] bg-[var(--surface)] text-[var(--text)] min-[900px]:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            {mobileOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <Frieze />

      {/* Panel unter der Kopfleiste (unter 900 px) */}
      {mobileOpen && (
        <nav id="mobile-menu" aria-label="Hauptnavigation" className="border-t border-[var(--header-border)] bg-[var(--surface)] min-[900px]:hidden">
          <ul className="page py-2">
            {items.map((it) => (
              <li key={it.key} className="border-b border-[var(--line)] last:border-b-0">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => go(it.page)}
                    aria-current={isActive(it) ? "page" : undefined}
                    className={"flex min-h-[48px] flex-1 items-center text-left text-[17px] font-medium " + (isActive(it) ? "text-[var(--primary)]" : "text-[var(--text)]")}
                  >
                    {it.label}
                    <Count n={it.count} max={it.max} />
                  </button>
                  {it.group && (
                    <button
                      type="button"
                      onClick={() => setMobileGroup(mobileGroup === it.key ? null : it.key)}
                      aria-expanded={mobileGroup === it.key}
                      aria-label={`Unterpunkte von ${it.label}`}
                      className="inline-flex h-12 w-12 items-center justify-center text-[var(--muted)]"
                    >
                      <Chevron open={mobileGroup === it.key} />
                    </button>
                  )}
                </div>
                {it.group && mobileGroup === it.key && (
                  <div className="mb-2 bg-[var(--bg)]">
                    <SubItems group={it.group} onPick={pick} activeFilter={activeFilter} />
                  </div>
                )}
              </li>
            ))}
            <li className="mt-2 border-t border-[var(--line)] pt-3">
              {session ? (
                <div>
                  <p className="truncate pb-1 text-[15px] text-[var(--muted)]">{session.user.email}</p>
                  {accountEntries.map(([label, p]) => (
                    <button key={p} type="button" onClick={() => go(p)} className="flex min-h-[48px] w-full items-center text-left text-[16px] text-[var(--text)]">
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      closeAll();
                      onSignOut();
                    }}
                    className="flex min-h-[48px] w-full items-center text-left text-[16px] text-[var(--bad-text)]"
                  >
                    Abmelden
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    closeAll();
                    onOpenAuth();
                  }}
                  className="btn-primary w-full"
                >
                  Anmelden
                </button>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
