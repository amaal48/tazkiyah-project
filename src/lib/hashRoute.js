// src/lib/hashRoute.js
//
// Hash-Adressen ohne Router-Bibliothek. Nur Adressen, die mit "#/" beginnen,
// sind Seiten; alles andere (z. B. "#screener") ist eine Sprungmarke und wird
// hier ignoriert.
//
//   #/                 Startseite (Überblick)
//   #/tazkiyah-30      Die Tazkiyah 30 (Liste mit Halal-Status; #/screener führt ebenfalls dorthin)
//   #/aktien           Aktiensuche (alle Titel, ohne Status); #/aktien?suche=nvda mit Suchbegriff (Suchfeld der Kopfleiste)
//   #/aktie/AAPL       Detailseite (Tazkiyah 30) bzw. Aktienseite ohne Status (alle übrigen)
//   #/kriterium/b1     Erklärseite je Prüfung (ID klein)
//   #/methodik         Methodik-Übersicht
//   #/methodik-2       Methodik, vereinfachte Fassung (Entwurf zum Vergleich, 16.10.2026)
//   #/lernen           Akademie mit Lernpfad (Navigation „Lernen“)
//   #/berichte         Berichte, führt zum Wochenbericht
//   #/berichte/wochenbericht             aktuelle Ausgabe und frühere Ausgaben
//   #/berichte/wochenbericht/2026-kw42   eine Ausgabe (Jahr und Kalenderwoche)
//   #/berichte/blog                      Blog (Übersicht)
//   #/berichte/blog/gibt-es-eine-ki-blase  ein Beitrag (Dateiname in content/blog/)
//   #/redaktion/wochenbericht            intern: Liste der Wochenberichte (nur Admin)
//   #/redaktion/wochenbericht/neu        intern: Entwurf einfügen
//   #/redaktion/wochenbericht/<id>       intern: Ausgabe prüfen
//   #/redaktion/vorschau                 intern: Handy-Vorschau im iframe der Prüfseite
//   #/kontakt          Kontaktformular, optional vorausgefüllt: #/kontakt?thema=fehler&aktie=AAPL

import { useEffect, useState } from "react";

/** Liest eine Hash-Adresse. null = keine Seitenadresse (Sprungmarke). */
export function parseHash(hash = typeof window !== "undefined" ? window.location.hash : "") {
  const full = String(hash || "").replace(/^#/, "");
  if (full === "") return { name: "home" };
  if (!full.startsWith("/")) return null;
  const [h, query = ""] = full.split("?");
  const parts = h
    .slice(1)
    .split("/")
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  if (parts[0] === "aktie" && parts[1]) return { name: "stock", ticker: parts[1].toUpperCase() };
  if (parts[0] === "kriterium" && parts[1]) return { name: "criterion", id: parts[1].toUpperCase() };
  if (parts[0] === "methodik") return { name: "methodik" };
  if (parts[0] === "methodik-2") return { name: "methodik2" };
  if (parts[0] === "lernen") return { name: "lernen" };
  if (parts[0] === "redaktion") {
    if (parts[1] === "vorschau") return { name: "redaktionVorschau" };
    return { name: "redaktion", id: parts[2] || null };
  }
  if (parts[0] === "berichte") {
    if (parts[1] === "blog") return parts[2] ? { name: "blogpost", slug: parts[2].toLowerCase() } : { name: "blog" };
    const slug = /^\d{4}-kw\d{1,2}$/i.test(parts[2] || "") ? parts[2].toLowerCase() : null;
    return { name: "wochenbericht", slug };
  }
  if (parts[0] === "screener" || parts[0] === "tazkiyah-30") return { name: "tazkiyah30" };
  if (parts[0] === "aktien") {
    const q = new URLSearchParams(query).get("suche");
    return q ? { name: "aktien", query: q } : { name: "aktien" };
  }
  if (parts[0] === "kontakt") {
    const q = new URLSearchParams(query);
    return { name: "kontakt", topic: q.get("thema") || null, ticker: (q.get("aktie") || "").toUpperCase() || null };
  }
  return { name: "home" };
}

export const routes = {
  home: () => "#/",
  tazkiyah30: () => "#/tazkiyah-30",
  // Alte Adresse, führt auf die Tazkiyah 30
  screener: () => "#/tazkiyah-30",
  aktien: (query) => (query ? `#/aktien?suche=${encodeURIComponent(query)}` : "#/aktien"),
  stock: (ticker) => `#/aktie/${encodeURIComponent(ticker)}`,
  criterion: (id) => `#/kriterium/${String(id).toLowerCase()}`,
  methodik: () => "#/methodik",
  methodik2: () => "#/methodik-2",
  lernen: () => "#/lernen",
  wochenbericht: (slug) => (slug ? `#/berichte/wochenbericht/${slug}` : "#/berichte/wochenbericht"),
  redaktion: (id) => (id ? `#/redaktion/wochenbericht/${encodeURIComponent(id)}` : "#/redaktion/wochenbericht"),
  redaktionVorschau: () => "#/redaktion/vorschau",
  blog: () => "#/berichte/blog",
  blogPost: (slug) => `#/berichte/blog/${encodeURIComponent(slug)}`,
  /** Kontaktformular; topic: Thema im Formular (z. B. "pruefung", "fehler"), ticker: Aktie für den Text */
  kontakt: ({ topic, ticker } = {}) => {
    const q = new URLSearchParams();
    if (topic) q.set("thema", topic);
    if (ticker) q.set("aktie", ticker);
    const qs = q.toString();
    return `#/kontakt${qs ? `?${qs}` : ""}`;
  },
};

/** Wechselt die Adresse (neuer Verlaufseintrag, löst "hashchange" aus). */
export function navigate(hash) {
  if (window.location.hash !== hash) window.location.hash = hash;
}

/**
 * Setzt die Adresse ohne "hashchange" (für Seiten, die nur über den page-Zustand laufen),
 * damit die Zurück-Taste von dort auf die vorige Seitenadresse führt.
 */
export function pushHashSilently(hash) {
  if (window.location.hash !== hash) window.history.pushState(null, "", hash);
}

/** Aktuelle Seitenadresse als React-Zustand. */
export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
