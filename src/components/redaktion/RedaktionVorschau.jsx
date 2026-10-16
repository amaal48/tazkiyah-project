// src/components/redaktion/RedaktionVorschau.jsx
//
// Handy-Vorschau der Prüfseite (#/redaktion/vorschau): läuft in einem 390 px breiten iframe, damit die
// Handy-Darstellung der Website greift. Lädt selbst nichts aus der Datenbank, sondern zeigt nur den Stand,
// den die Prüfseite per postMessage schickt (nur von derselben Adresse angenommen).

import { useEffect, useState } from "react";
import WochenberichtArticle from "../berichte/WochenberichtArticle.jsx";

export default function RedaktionVorschau() {
  const [report, setReport] = useState(null);
  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if (e.data?.type === "tazkiyah-vorschau" && e.data.report) setReport(e.data.report);
    };
    window.addEventListener("message", onMessage);
    // der Prüfseite melden, dass die Vorschau bereit ist (sie schickt dann den aktuellen Stand)
    if (window.parent !== window) window.parent.postMessage({ type: "tazkiyah-vorschau-bereit" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <div className="page min-h-screen bg-[var(--paper)] pb-10">
      {report ? <WochenberichtArticle report={report} preview /> : <p className="py-10 text-[var(--text-soft)]">Vorschau wird geladen …</p>}
    </div>
  );
}
