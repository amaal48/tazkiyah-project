// src/components/Sidebar.jsx
//
// Navigation als Seitenleiste (17.10.2026), Design B2: Papierton, Dunkelgrün, Gold, Trennlinie statt Schatten.
//   - Desktop (ab 1024 px): feste Leiste links (SidebarDesktop), einklappbar auf Zeichen; der Zustand steht im
//     localStorage (Schlüssel SIDEBAR_STORAGE_KEY, Lesen/Schreiben in try/catch, siehe App.jsx).
//   - Handy/Tablet: dieselben Punkte als Menü von links (NavDrawer, geöffnet über den Menüknopf der Kopfleiste);
//     schließt bei Klick auf einen Link, auf den Hintergrund oder mit Esc.
// Punkte: Start · Aktiensuche · (Die Tazkiyah 30, nur mit VITE_FEATURE_TAZKIYAH30) · Berichte (Wochenbericht, Blog)
// · Kalender · Akademie · Methodik · Kontakt; angemeldet zusätzlich Watchlist · Konto (· Redaktion für Admins).
// Bereiche in SOON_KEYS sind sichtbar, aber nicht klickbar („folgt bald“).

import { useEffect, useId, useRef, useState } from "react";
import { routes } from "../lib/hashRoute.js";
import { FEATURE_TAZKIYAH30 } from "../lib/features.js";

// Noch nicht fertig: sichtbar mit „folgt bald“, nicht klickbar. Zum Freischalten den Schlüssel entfernen.
const SOON_KEYS = new Set(["blog", "kalender"]);

/* ---------- Zeichen (Linien, 20 × 20, ohne Kreise um das Zeichen) ---------- */

const ICON_PATHS = {
  start: "M3 9.5 10 3.5l7 6V17h-4.5v-4.5h-5V17H3z",
  aktien: "M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.2 12.2 17 17",
  tazkiyah30: "M10 2.5l2 3.2 3.6-.9-.9 3.6 3.2 2-3.2 2 .9 3.6-3.6-.9-2 3.2-2-3.2-3.6.9.9-3.6-3.2-2 3.2-2-.9-3.6 3.6.9z",
  berichte: "M5 2.5h7l3 3v12H5zM12 2.5v3h3M7.5 9h5M7.5 12h5M7.5 15h3",
  wochenbericht: "M5 2.5h7l3 3v12H5zM7.5 9h5M7.5 12h5",
  blog: "M4 16l1-4 8.5-8.5 3 3L8 15zM12 5l3 3",
  kalender: "M3.5 5h13v12h-13zM3.5 8.5h13M7 3v4M13 3v4",
  akademie: "M10 5.5C8 4 5.5 3.5 3 4v11.5c2.5-.5 5 0 7 1.5 2-1.5 4.5-2 7-1.5V4c-2.5-.5-5 0-7 1.5zM10 5.5V17",
  methodik: "M10 3v14M4 6h12M4 6l-2 5h4zM16 6l-2 5h4zM6.5 17h7",
  kontakt: "M3 5h14v10H3zM3 5l7 6 7-6",
  watchlist: "M5.5 3h9v14l-4.5-3.5L5.5 17z",
  konto: "M10 3.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM3.5 17c.8-3 3.3-4.6 6.5-4.6s5.7 1.6 6.5 4.6",
  redaktion: "M3 17h14M5 14l9-9 2 2-9 9H5z",
};

function Icon({ name }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="flex-none">
      <path d={ICON_PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={"transition-transform " + (open ? "rotate-180" : "")}>
      <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Punkte ---------- */

// Welche Seiten (page-Zustand in App.jsx) zu einem Punkt gehören, für die Markierung „aktiv“
const ACTIVE_PAGES = {
  start: ["home"],
  aktien: FEATURE_TAZKIYAH30 ? ["aktien"] : ["aktien", "detail"],
  tazkiyah30: ["tazkiyah30", "detail", "sectors"],
  berichte: ["reports", "blog", "blogpost"],
  wochenbericht: ["reports"],
  blog: ["blog", "blogpost"],
  kalender: ["calendar"],
  akademie: ["faq"],
  methodik: ["methodik", "methodik2", "criterion"],
  kontakt: ["kontakt"],
  watchlist: ["watchlist"],
  konto: ["profile", "settings", "security", "privacy"],
  redaktion: ["redaktion"],
};

/** Punkte der Navigation; page = Ziel für onGo (App.jsx goTo), href = Adresse (für Mittelklick/neuer Tab). */
function navItems({ session, isAdmin, watchCount }) {
  const items = [
    { key: "start", label: "Start", page: "home", href: routes.home() },
    { key: "aktien", label: "Aktiensuche", page: "aktien", href: routes.aktien() },
    FEATURE_TAZKIYAH30 && { key: "tazkiyah30", label: "Die Tazkiyah 30", page: "tazkiyah30", href: routes.tazkiyah30() },
    {
      key: "berichte",
      label: "Berichte",
      page: "reports",
      href: routes.wochenbericht(),
      children: [
        { key: "wochenbericht", label: "Wochenbericht", page: "reports", href: routes.wochenbericht() },
        { key: "blog", label: "Blog", page: "blog", href: routes.blog() },
      ],
    },
    { key: "kalender", label: "Kalender", page: "calendar" },
    { key: "akademie", label: "Akademie", page: "faq", href: routes.lernen() },
    { key: "methodik", label: "Methodik", page: "methodik", href: routes.methodik() },
    { key: "kontakt", label: "Kontakt", page: "kontakt", href: routes.kontakt() },
  ];
  const personal = session
    ? [
        { key: "watchlist", label: "Watchlist", page: "watchlist", count: watchCount },
        { key: "konto", label: "Konto", page: "profile" },
        isAdmin && { key: "redaktion", label: "Redaktion", page: "redaktion", href: routes.redaktion() },
      ]
    : [];
  return { items: items.filter(Boolean), personal: personal.filter(Boolean) };
}

const ROW = "flex min-h-[44px] w-full items-center gap-3 border-l-[3px] text-left text-[16px] leading-tight";
// soft: Kopf einer aufgeklappten Gruppe (der Unterpunkt trägt die volle Markierung)
const rowState = (active, soft) =>
  active && soft
    ? "border-[var(--gold-line)] font-semibold text-[var(--green-deep)] hover:bg-[var(--bg-deep)]"
    : active
      ? "border-[var(--gold-line)] bg-[var(--green-deep)] font-semibold text-[var(--paper)]"
      : "border-transparent text-[var(--green-deep)] hover:bg-[var(--bg-deep)]";

/** Ein Punkt: Link (bzw. Knopf ohne Adresse) oder „folgt bald“ (nicht klickbar). */
function NavEntry({ item, page, onGo, onNavigate, collapsed, sub = false, soft = false }) {
  const active = ACTIVE_PAGES[item.key]?.includes(page);
  const pad = collapsed ? "justify-center px-0" : sub ? "pl-[46px] pr-3" : "px-3";
  const label = collapsed ? <span className="sr-only-label">{item.label}</span> : <span className="min-w-0 flex-1">{item.label}</span>;

  if (SOON_KEYS.has(item.key)) {
    return (
      <span className={`${ROW} ${pad} cursor-default border-transparent text-[var(--muted)]`} title={collapsed ? `${item.label} (folgt bald)` : undefined}>
        {!sub && <Icon name={item.key} />}
        {label}
        {collapsed ? <span className="sr-only-label"> (folgt bald)</span> : <span className="flex-none text-[13px] italic">folgt bald</span>}
      </span>
    );
  }

  const go = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // neuer Tab: Browser übernimmt
    e.preventDefault();
    onGo(item.page);
    onNavigate?.();
  };
  const count = item.count ? (
    <span className={"flex-none px-1.5 text-[13px] font-semibold " + (collapsed ? "sr-only-label" : active ? "text-[var(--gold-light)]" : "text-[var(--gold-soft)]")}>
      {collapsed ? ` (${item.count})` : item.count}
    </span>
  ) : null;
  const content = (
    <>
      {!sub && <Icon name={item.key} />}
      {label}
      {count}
    </>
  );
  const cls = `${ROW} ${pad} ${rowState(active, soft)}`;
  return item.href ? (
    <a href={item.href} onClick={go} className={cls} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined}>
      {content}
    </a>
  ) : (
    <button type="button" onClick={go} className={cls} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined}>
      {content}
    </button>
  );
}

/** „Berichte“ mit aufklappbaren Unterpunkten (eingeklappt: nur der Hauptpunkt). */
function NavGroup({ item, page, onGo, onNavigate, collapsed }) {
  const listId = useId();
  const inGroup = ACTIVE_PAGES[item.key].includes(page);
  const [open, setOpen] = useState(inGroup);
  useEffect(() => {
    if (inGroup) setOpen(true);
  }, [inGroup]);

  if (collapsed) return <NavEntry item={item} page={page} onGo={onGo} onNavigate={onNavigate} collapsed />;
  return (
    <>
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1">
          <NavEntry item={item} page={page} onGo={onGo} onNavigate={onNavigate} soft={open} />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`Unterpunkte von ${item.label}`}
          className="inline-flex w-11 flex-none items-center justify-center text-[var(--green-deep)] hover:bg-[var(--bg-deep)]"
        >
          <Chevron open={open} />
        </button>
      </div>
      <ul id={listId} hidden={!open}>
        {item.children.map((c) => (
          <li key={c.key}>
            <NavEntry item={c} page={page} onGo={onGo} onNavigate={onNavigate} sub />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Liste aller Punkte (Seitenleiste und Handy-Menü). */
function NavList({ page, onGo, onNavigate, session, isAdmin, watchCount, collapsed = false, listId }) {
  const { items, personal } = navItems({ session, isAdmin, watchCount });
  const render = (it) => (
    <li key={it.key}>
      {it.children ? (
        <NavGroup item={it} page={page} onGo={onGo} onNavigate={onNavigate} collapsed={collapsed} />
      ) : (
        <NavEntry item={it} page={page} onGo={onGo} onNavigate={onNavigate} collapsed={collapsed} />
      )}
    </li>
  );
  return (
    <div id={listId}>
      <ul className="py-3">{items.map(render)}</ul>
      {personal.length > 0 && (
        <>
          <div className="mx-3 border-t border-[var(--border)]" />
          {!collapsed && <p className="kicker px-3 pb-1 pt-4 text-[12px]">Für dich</p>}
          <ul className="pb-3 pt-1">{personal.map(render)}</ul>
        </>
      )}
    </div>
  );
}

/** Desktop: feste Leiste links (ab 1024 px), einklappbar. */
export function SidebarDesktop({ collapsed, onToggleCollapsed, ...props }) {
  const listId = useId();
  return (
    <aside
      className={
        "sticky top-0 hidden h-[100dvh] flex-none flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex " + (collapsed ? "w-[68px]" : "w-[248px]")
      }
    >
      <nav aria-label="Hauptnavigation" className="min-h-0 flex-1 overflow-y-auto">
        <NavList {...props} collapsed={collapsed} listId={listId} />
      </nav>
      <div className="border-t border-[var(--border)] p-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls={listId}
          aria-label={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
          title={collapsed ? "Seitenleiste ausklappen" : undefined}
          className={"flex min-h-[44px] w-full items-center gap-2 text-[15px] text-[var(--muted)] hover:bg-[var(--bg-deep)] hover:text-[var(--green-deep)] " + (collapsed ? "justify-center" : "px-3")}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={collapsed ? "rotate-180" : ""}>
            <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!collapsed && <span>Einklappen</span>}
        </button>
      </div>
    </aside>
  );
}

/** Handy/Tablet: Menü von links mit Hintergrund; Esc, Klick daneben oder auf einen Link schließt. */
export function NavDrawer({ open, onClose, searchSlot = null, ...props }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    const focusables = () => [...panel.querySelectorAll('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.closest("[hidden]"));
    focusables()[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        // Fokus im Menü halten
        const els = focusables();
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" aria-label="Menü schließen" tabIndex={-1} onClick={onClose} className="absolute inset-0 h-full w-full bg-[rgba(20,53,42,0.45)]" />
      <div
        ref={panelRef}
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menü"
        className="absolute inset-y-0 left-0 flex w-[300px] max-w-[86vw] flex-col border-r border-[var(--gold-line)] bg-[var(--surface)]"
      >
        <div className="flex min-h-[64px] items-center justify-between border-b border-[var(--border)] px-3">
          <span className="font-display text-[26px] font-semibold text-[var(--heading)]">Menü</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Menü schließen"
            className="inline-flex h-11 w-11 items-center justify-center border border-[var(--control-border)] text-[var(--text)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {searchSlot && <div className="border-b border-[var(--border)] p-3">{searchSlot}</div>}
        <nav aria-label="Hauptnavigation" className="min-h-0 flex-1 overflow-y-auto">
          <NavList {...props} onNavigate={onClose} />
        </nav>
      </div>
    </div>
  );
}
