// src/components/Sidebar.jsx
//
// Navigation als Seitenleiste nach dem Entwurf „Seitenleiste A überarbeitet“ (Claude Design, 18.10.2026):
// dunkelgrüne Fläche mit Rosette in Hellgold, oben Logo und Suche, goldener Fries, Menüpunkte in Gruppen
// („Entdecken“, „Verstehen“), unten der Kontobereich. Eckig, ohne Schatten. Auf dem Desktop gibt es keine
// Kopfleiste mehr; Suche und Konto stehen in der Leiste.
//   - Desktop (ab 1024 px): feste Leiste links (SidebarDesktop), 272 px, einklappbar auf 72 px (nur Zeichen);
//     der Zustand steht im localStorage (Schlüssel SIDEBAR_STORAGE_KEY, Lesen/Schreiben in try/catch, siehe App.jsx).
//   - Handy/Tablet: dieselbe Leiste als Menü von links (NavDrawer, geöffnet über den Menüknopf der schmalen
//     Leiste oben, SiteHeader.jsx); schließt bei Klick auf einen Link, auf den Hintergrund oder mit Esc.
// Punkte: Entdecken: Start · Aktiensuche · Berichte (Wochenbericht, Blog) · Kalender (· Die Tazkiyah 30, nur mit
// VITE_FEATURE_TAZKIYAH30); Verstehen: Akademie · Methodik · Kontakt; angemeldet „Für dich“: Watchlist
// (· Redaktion für Admins) und „Mein Konto“ mit dem Kontomenü.
// Bereiche in SOON_KEYS sind sichtbar, aber nicht klickbar („folgt bald“).

import { useEffect, useId, useRef, useState } from "react";
import { navigate, routes } from "../lib/hashRoute.js";
import { FEATURE_TAZKIYAH30 } from "../lib/features.js";
import { Frieze, RosetteOverlay, StarMark } from "./ornaments.jsx";

// Noch nicht fertig: sichtbar mit „folgt bald“, nicht klickbar. Zum Freischalten den Schlüssel entfernen.
const SOON_KEYS = new Set(["blog", "kalender"]);

// Farben auf Grün (Tokens in App.jsx :root; Kontrast auf --green-deep: Hellgold 10,1 : 1, --on-green-soft 10,4 : 1)
const GOLD_55 = "var(--gold-light-55)";
const GOLD_35 = "var(--gold-light-35)";
const PAPER_8 = "var(--paper-8)";
const HOVER_BG = "hover:bg-[var(--paper-7)]";

/* ---------- Zeichen (Linien, 20 × 20, ohne Kreise um das Zeichen) ---------- */

const ICON_PATHS = {
  start: "M3 9.5 10 3.5l7 6V17h-4.5v-4.5h-5V17H3z",
  aktien: "M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.2 12.2 17 17",
  suche: "M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.2 12.2 17 17",
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

export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="flex-none">
      <path d={ICON_PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ open, up = false }) {
  const turned = up ? !open : open;
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={"flex-none transition-transform " + (turned ? "rotate-180" : "")}>
      <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Kleiner gefüllter Goldstern links am aktiven Punkt. */
function ActiveStar() {
  return (
    <svg width="10" height="10" viewBox="0 0 64 64" aria-hidden="true" className="absolute left-[8px] top-1/2 -translate-y-1/2">
      <path d="M32 4 L39 25 L60 32 L39 39 L32 60 L25 39 L4 32 L25 25 Z" style={{ fill: "var(--gold)" }} />
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
  akademie: ["faq", "lesson"],
  methodik: ["methodik", "methodik2", "criterion"],
  kontakt: ["kontakt"],
  watchlist: ["watchlist"],
  konto: ["profile", "settings", "security", "privacy"],
  redaktion: ["redaktion"],
};

/** Gruppen der Navigation; page = Ziel für onGo (App.jsx goTo), href = Adresse (für Mittelklick/neuer Tab). */
function navGroups() {
  return [
    {
      key: "entdecken",
      label: "Entdecken",
      items: [
        { key: "start", label: "Start", page: "home", href: routes.home() },
        { key: "aktien", label: "Aktiensuche", page: "aktien", href: routes.aktien() },
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
        FEATURE_TAZKIYAH30 && { key: "tazkiyah30", label: "Die Tazkiyah 30", page: "tazkiyah30", href: routes.tazkiyah30() },
      ].filter(Boolean),
    },
    {
      key: "verstehen",
      label: "Verstehen",
      items: [
        { key: "akademie", label: "Akademie", page: "faq", href: routes.lernen() },
        { key: "methodik", label: "Methodik", page: "methodik", href: routes.methodik() },
        { key: "kontakt", label: "Kontakt", page: "kontakt", href: routes.kontakt() },
      ],
    },
  ];
}

function personalItems({ isAdmin, watchCount }) {
  return [
    { key: "watchlist", label: "Watchlist", page: "watchlist", count: watchCount },
    isAdmin && { key: "redaktion", label: "Redaktion", page: "redaktion", href: routes.redaktion() },
  ].filter(Boolean);
}

const Kicker = ({ children }) => <p className="px-4 pb-1.5 text-[12px] font-semibold uppercase tracking-[.16em] text-[var(--gold-light)]">{children}</p>;

const ROW = "relative flex min-h-[46px] items-center gap-3 text-left text-[17px] leading-tight";
const HOVER = `${HOVER_BG} hover:text-[var(--paper)]`;
// soft: Kopf einer aufgeklappten Gruppe (der Unterpunkt trägt die volle Markierung)
const rowState = (active, soft) =>
  active && soft
    ? `font-semibold text-[var(--paper)] ${HOVER}`
    : active
      ? "bg-[var(--paper)] font-semibold text-[var(--green-deep)]"
      : `text-[var(--on-green-soft)] ${HOVER}`;

/** Ein Punkt: Link (bzw. Knopf ohne Adresse) oder „folgt bald“ (nicht klickbar). */
function NavEntry({ item, page, onGo, onNavigate, collapsed, sub = false, soft = false }) {
  const active = ACTIVE_PAGES[item.key]?.includes(page);
  const full = active && !soft;
  const pad = collapsed ? "mx-2 justify-center px-0" : sub ? "w-full pl-[58px] pr-4" : "w-full pl-6 pr-4";
  const label = collapsed ? <span className="sr-only-label">{item.label}</span> : <span className="min-w-0 flex-1">{item.label}</span>;
  const icon = !sub && (
    <span className={full ? "" : "text-[var(--gold-light)]"}>
      <Icon name={item.key} />
    </span>
  );

  if (SOON_KEYS.has(item.key)) {
    return (
      <span className={`${ROW} ${pad} cursor-default text-[var(--on-green-soft)]`} title={collapsed ? `${item.label} (folgt bald)` : undefined}>
        {icon}
        {label}
        {collapsed ? (
          <span className="sr-only-label"> (folgt bald)</span>
        ) : (
          <span className="flex-none text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--gold-light)]">folgt bald</span>
        )}
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
    collapsed ? (
      <span className="sr-only-label"> ({item.count})</span>
    ) : (
      <span className="flex-none bg-[var(--gold-light)] px-1.5 text-[13px] font-bold leading-[20px] text-[var(--green-deep)]">{item.count}</span>
    )
  ) : null;
  const content = (
    <>
      {full && !collapsed && <ActiveStar />}
      {icon}
      {label}
      {count}
    </>
  );
  const common = {
    onClick: go,
    className: `${ROW} ${pad} ${rowState(active, soft)}`,
    "aria-current": active ? "page" : undefined,
    title: collapsed ? item.label : undefined,
  };
  return item.href ? (
    <a href={item.href} {...common}>
      {content}
    </a>
  ) : (
    <button type="button" {...common}>
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
          className={`mr-2 inline-flex w-11 flex-none items-center justify-center text-[var(--gold-light)] ${HOVER_BG}`}
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

function EntryList({ items, collapsed, ...props }) {
  return (
    <ul>
      {items.map((it) => (
        <li key={it.key}>
          {it.children ? <NavGroup item={it} collapsed={collapsed} {...props} /> : <NavEntry item={it} collapsed={collapsed} {...props} />}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Suche ---------- */

/** Suchfeld auf Grün: Name oder Ticker → Aktiensuche mit dem Begriff (#/aktien?suche=…). */
function SearchForm({ id, inputRef, onDone }) {
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className="flex min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        navigate(routes.aktien(term || undefined));
        setQ("");
        onDone?.();
      }}
    >
      <label htmlFor={id} className="sr-only-label">
        Aktie suchen (Name oder Ticker)
      </label>
      <div className="flex h-11 min-w-0 flex-1 items-center border" style={{ borderColor: GOLD_55, background: PAPER_8 }}>
        <input
          ref={inputRef}
          id={id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Aktie suchen, z. B. Apple"
          className="h-full min-w-0 flex-1 bg-transparent pl-3 text-[16px] text-[var(--paper)] placeholder:text-[var(--on-green-placeholder)]"
          autoComplete="off"
        />
        <button type="submit" className="inline-flex h-full w-11 flex-none items-center justify-center text-[var(--gold-light)] hover:text-[var(--paper)]" aria-label="Suchen">
          <Icon name="suche" size={18} />
        </button>
      </div>
    </form>
  );
}

/* ---------- Konto ---------- */

const initialOf = (email) => (String(email || "").trim()[0] || "?").toUpperCase();

/** Esc und Klick außerhalb schließen ein offenes Menü. Esc geht nicht weiter (das Handy-Menü bleibt offen). */
function useDismiss(ref, open, close) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close(true);
    };
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && close(false);
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onClick);
    };
  }, [ref, open, close]);
}

/** Einträge des Kontomenüs (wie bisher in der Kopfleiste). */
function AccountMenuList({ id, email, isAdmin, onGo, onSignOut, onDone, className = "" }) {
  const entries = [
    ["Profil", "profile"],
    ["Einstellungen", "settings"],
    ["Sicherheit", "security"],
    ["Datenschutz", "privacy"],
    ...(isAdmin ? [["Redaktion", "redaktion"]] : []),
  ];
  return (
    <div id={id} className={"z-50 border border-[var(--border)] bg-[var(--surface)] py-1 " + className}>
      <p className="truncate px-4 py-2 text-[14px] text-[var(--muted)]" title={email}>
        {email}
      </p>
      {entries.map(([label, p]) => (
        <button
          key={p}
          type="button"
          onClick={() => {
            onDone();
            onGo(p);
          }}
          className="flex min-h-[44px] w-full items-center px-4 text-left text-[15px] text-[var(--text)] hover:bg-[var(--bg-deep)]"
        >
          {label}
        </button>
      ))}
      <div className="my-1 border-t border-[var(--line)]" />
      <button
        type="button"
        onClick={() => {
          onDone();
          onSignOut();
        }}
        className="flex min-h-[44px] w-full items-center px-4 text-left text-[15px] text-[var(--bad-text)] hover:bg-[var(--bg-deep)]"
      >
        Abmelden
      </button>
    </div>
  );
}

/** Knopf mit Kontomenü (nach oben in der Leiste, nach unten in der Handy-Leiste); renderTrigger zeichnet den Knopf. */
export function AccountMenu({ email, isAdmin, onGo, onSignOut, onNavigate, placement = "up", className = "", menuClassName = "", renderTrigger }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();
  const [close] = useState(() => (refocus) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  });
  useDismiss(wrapRef, open, close);
  const pos = placement === "up" ? "absolute bottom-full mb-1" : "absolute right-0 top-full mt-1";
  return (
    <div ref={wrapRef} className={"relative " + className}>
      {renderTrigger({ open, toggle: () => setOpen((v) => !v), ref: triggerRef, menuId })}
      {open && (
        <AccountMenuList
          id={menuId}
          email={email}
          isAdmin={isAdmin}
          onGo={onGo}
          onSignOut={onSignOut}
          onDone={() => {
            setOpen(false);
            onNavigate?.();
          }}
          className={pos + " " + menuClassName}
        />
      )}
    </div>
  );
}

/** Kontobereich unten in der Leiste. */
function AccountArea({ session, isAdmin, watchCount, page, onGo, onNavigate, onOpenAuth, onSignOut, collapsed }) {
  const openAuth = (mode) => {
    onNavigate?.();
    onOpenAuth(mode);
  };

  if (!session) {
    if (collapsed) {
      return (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={() => openAuth("login")}
            title="Anmelden"
            aria-label="Anmelden"
            className={`inline-flex h-11 w-11 items-center justify-center text-[var(--gold-light)] hover:text-[var(--paper)] ${HOVER_BG}`}
          >
            <Icon name="konto" />
          </button>
        </div>
      );
    }
    return (
      <div className="px-4 pb-2 pt-4">
        <div className="border border-[var(--gold-line)] p-[3px]">
          <div className="border px-4 pb-2 pt-4" style={{ borderColor: GOLD_35, background: "var(--green-darker)" }}>
            <p className="font-display text-[23px] font-semibold leading-tight text-[var(--paper)]">Dein Konto</p>
            <p className="mt-1.5 text-[14px] leading-snug text-[var(--on-green-soft)]">Merke dir Aktien in der Watchlist und behalte Termine im Blick. Kostenlos.</p>
            <button
              type="button"
              onClick={() => openAuth("login")}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 bg-[var(--gold-light)] text-[16px] font-bold text-[var(--green-deep)] hover:bg-[var(--paper)]"
            >
              <Icon name="konto" size={18} />
              Anmelden
            </button>
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="mt-1 inline-flex min-h-[44px] w-full items-center justify-center text-[15px] text-[var(--gold-light)] underline decoration-[var(--gold-light-55)] underline-offset-2 hover:decoration-[var(--gold-light)]"
            >
              Neu hier? Konto erstellen
            </button>
          </div>
        </div>
      </div>
    );
  }

  const email = session.user?.email || "";
  const kontoActive = ACTIVE_PAGES.konto.includes(page);
  return (
    <div className="pb-2 pt-3">
      <nav aria-label="Für dich">
        {collapsed ? <span className="sr-only-label">Für dich</span> : <Kicker>Für dich</Kicker>}
        <EntryList items={personalItems({ isAdmin, watchCount })} page={page} onGo={onGo} onNavigate={onNavigate} collapsed={collapsed} />
      </nav>
      <div className="mx-4 my-2 border-t" style={{ borderColor: GOLD_35 }} />
      <AccountMenu
        email={email}
        isAdmin={isAdmin}
        onGo={onGo}
        onSignOut={onSignOut}
        onNavigate={onNavigate}
        placement="up"
        className={collapsed ? "flex justify-center" : "px-3"}
        menuClassName={collapsed ? "left-2 w-56" : "left-3 right-3"}
        renderTrigger={({ open, toggle, ref, menuId }) => (
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="true"
            aria-controls={open ? menuId : undefined}
            title={collapsed ? `Mein Konto (${email})` : undefined}
            className={`flex min-h-[52px] items-center gap-3 text-left ${HOVER_BG} ` + (collapsed ? "w-[52px] justify-center" : "w-full px-1")}
          >
            <span
              aria-hidden="true"
              className={
                "inline-flex h-10 w-10 flex-none items-center justify-center bg-[var(--gold-light)] font-display text-[22px] font-bold text-[var(--green-deep)] " +
                (kontoActive ? "outline outline-2 outline-offset-2 outline-[var(--paper)]" : "")
              }
            >
              {initialOf(email)}
            </span>
            {collapsed ? (
              <span className="sr-only-label">Mein Konto, {email}</span>
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold leading-tight text-[var(--paper)]">Mein Konto</span>
                  <span className="block truncate text-[13px] leading-snug text-[var(--on-green-soft)]" title={email}>
                    {email}
                  </span>
                </span>
                <span className="text-[var(--gold-light)]">
                  <Chevron open={open} up />
                </span>
              </>
            )}
          </button>
        )}
      />
    </div>
  );
}

/* ---------- Leiste ---------- */

/** Logo in Hellgold, Link zur Startseite. */
function Brand({ onGo, onNavigate, collapsed }) {
  return (
    <a
      href="#/"
      onClick={(e) => {
        e.preventDefault();
        onGo("home");
        onNavigate?.();
      }}
      className={"flex min-h-[48px] min-w-0 items-center gap-2.5 " + (collapsed ? "justify-center" : "")}
      aria-label="Tazkiyah, zur Startseite"
      title={collapsed ? "Tazkiyah, zur Startseite" : undefined}
    >
      <StarMark size={32} fill="var(--gold-light)" dot="var(--green-deep)" />
      {!collapsed && <span className="font-display text-[34px] font-semibold leading-none text-[var(--paper)]">Tazkiyah</span>}
    </a>
  );
}

/** Inhalt der Leiste (Desktop und Handy-Menü). topRight: z. B. Knopf „Menü schließen“; footer: Fußzeile der Leiste. */
function SidebarBody({ collapsed = false, searchId, searchRef, onSearchIcon, topRight = null, footer = null, ...props }) {
  const { page, onGo, onNavigate } = props;
  return (
    <>
      <RosetteOverlay opacity={0.14} color="var(--gold-light)" />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={"flex flex-none items-center gap-2 pt-5 " + (collapsed ? "justify-center px-2" : "justify-between pl-5 pr-4")}>
          <Brand onGo={onGo} onNavigate={onNavigate} collapsed={collapsed} />
          {topRight}
        </div>
        <div className={"flex-none " + (collapsed ? "flex justify-center px-2 pt-4" : "px-4 pt-4")}>
          {collapsed ? (
            <button
              type="button"
              onClick={onSearchIcon}
              title="Aktie suchen"
              aria-label="Aktie suchen (klappt die Seitenleiste aus)"
              className="inline-flex h-11 w-11 items-center justify-center border text-[var(--gold-light)] hover:text-[var(--paper)]"
              style={{ borderColor: GOLD_55, background: PAPER_8 }}
            >
              <Icon name="suche" />
            </button>
          ) : (
            <SearchForm id={searchId} inputRef={searchRef} onDone={onNavigate} />
          )}
        </div>
        <Frieze className="mt-4 flex-none" color="var(--gold-line)" />

        <nav aria-label="Hauptnavigation" className="min-h-0 flex-1 overflow-y-auto pb-2 pt-4">
          {navGroups().map((g, i) => (
            <div key={g.key} className={i ? "mt-4" : ""}>
              {collapsed ? (
                <>
                  {i > 0 && <div className="mx-4 mb-3 border-t" style={{ borderColor: GOLD_35 }} />}
                  <span className="sr-only-label">{g.label}</span>
                </>
              ) : (
                <Kicker>{g.label}</Kicker>
              )}
              <EntryList items={g.items} page={page} onGo={onGo} onNavigate={onNavigate} collapsed={collapsed} />
            </div>
          ))}
        </nav>

        <div className="mt-auto flex-none border-t" style={{ borderColor: GOLD_35 }}>
          <AccountArea {...props} collapsed={collapsed} />
          {footer}
        </div>
      </div>
    </>
  );
}

/** Desktop: feste Leiste links (ab 1024 px), einklappbar. */
export function SidebarDesktop({ collapsed, onToggleCollapsed, ...props }) {
  const asideId = useId();
  const searchId = useId();
  const searchRef = useRef(null);
  const focusSearch = useRef(false);

  // Lupe in der eingeklappten Leiste: erst ausklappen, dann Fokus ins Suchfeld
  useEffect(() => {
    if (!collapsed && focusSearch.current) {
      focusSearch.current = false;
      searchRef.current?.focus();
    }
  }, [collapsed]);

  const footer = (
    <div className={"flex items-center gap-2 border-t pb-1 " + (collapsed ? "justify-center" : "justify-between pl-2 pr-4")} style={{ borderColor: GOLD_35 }}>
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls={asideId}
        aria-label={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
        title={collapsed ? "Seitenleiste ausklappen" : undefined}
        className={"inline-flex min-h-[44px] items-center gap-2 text-[15px] text-[var(--gold-light)] hover:text-[var(--paper)] " + (collapsed ? "w-11 justify-center" : "px-2")}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={collapsed ? "rotate-180" : ""}>
          <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {!collapsed && <span>Einklappen</span>}
      </button>
      {!collapsed && <span className="text-[12px] text-[var(--on-green-soft)]">Keine Anlageberatung</span>}
    </div>
  );

  return (
    <aside
      id={asideId}
      aria-label="Seitenleiste"
      className={"on-green sticky top-0 z-40 hidden h-[100dvh] flex-none flex-col bg-[var(--green-deep)] lg:flex " + (collapsed ? "w-[72px]" : "w-[272px]")}
    >
      <SidebarBody
        {...props}
        collapsed={collapsed}
        searchId={searchId}
        searchRef={searchRef}
        onSearchIcon={() => {
          focusSearch.current = true;
          onToggleCollapsed();
        }}
        footer={footer}
      />
    </aside>
  );
}

/** Handy/Tablet: Menü von links mit Hintergrund; Esc, Klick daneben oder auf einen Link schließt. */
export function NavDrawer({ open, onClose, ...props }) {
  const panelRef = useRef(null);
  const searchId = useId();

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
  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label="Menü schließen"
      className="inline-flex h-11 w-11 flex-none items-center justify-center border text-[var(--gold-light)] hover:text-[var(--paper)]"
      style={{ borderColor: GOLD_55 }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" aria-label="Menü schließen" tabIndex={-1} onClick={onClose} className="absolute inset-0 h-full w-full bg-[rgba(20,53,42,0.45)]" />
      <div
        ref={panelRef}
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menü"
        className="on-green absolute inset-y-0 left-0 flex w-[300px] max-w-[86vw] flex-col bg-[var(--green-deep)]"
      >
        <SidebarBody
          {...props}
          onNavigate={onClose}
          searchId={searchId}
          topRight={closeButton}
          footer={
            <p className="border-t px-4 py-3 text-[12px] text-[var(--on-green-soft)]" style={{ borderColor: GOLD_35 }}>
              Keine Anlageberatung
            </p>
          }
        />
      </div>
    </div>
  );
}
