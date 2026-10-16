// src/components/berichte/BerichteHeader.jsx
//
// Kopf des Bereichs „Berichte“: Überschrift und Umschalter „Wochenbericht | Blog“ (Design B2).

import { routes } from "../../lib/hashRoute.js";

const TABS = [
  { key: "wochenbericht", label: "Wochenbericht", href: routes.wochenbericht() },
  { key: "blog", label: "Blog", href: routes.blog() },
];

export default function BerichteHeader({ active, intro }) {
  return (
    <header className="pt-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <h1 className="font-display text-[var(--heading)]" style={{ margin: 0, fontSize: "clamp(48px, 7vw, 64px)", lineHeight: 1, fontWeight: 500 }}>
          Berichte
        </h1>
        <nav aria-label="Berichte" className="flex border border-[var(--green-deep)]">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={t.href}
              aria-current={active === t.key ? "page" : undefined}
              className={
                "inline-flex min-h-[48px] items-center px-6 text-[16px] font-semibold " +
                (active === t.key ? "bg-[var(--green-deep)] text-[var(--paper)]" : "text-[var(--green-deep)] hover:bg-[var(--bg-deep)]")
              }
            >
              {t.label}
            </a>
          ))}
        </nav>
      </div>
      {intro && <p className="mt-3.5 max-w-[640px] text-[18px] leading-relaxed text-[var(--text-soft)]">{intro}</p>}
    </header>
  );
}
