// src/components/TradingViewWidget.jsx
//
// Einbindung der kostenlosen TradingView-Widgets (mit TradingView-Branding).
//
// Datenschutz: Vor der Zustimmung wird nichts von TradingView geladen, weder Skript noch
// iframe. <TradingViewConsent> zeigt bis dahin einen Platzhalter mit Knopf. Die Zustimmung
// gilt bis zum Neuladen der Seite für alle Titel und steht nur im Arbeitsspeicher
// (keine Cookies, kein localStorage).
//
// Branding: Der Link „… by TradingView“ unter jedem Widget gehört zu den Nutzungsbedingungen
// der kostenlosen Widgets und darf nicht entfernt oder verdeckt werden.
//
// Farben: Variablen --tv-* in :root (App.jsx), ausgelesen in src/lib/tradingViewClient.js.

import { useEffect, useRef } from "react";
import { tradingViewSymbolUrl } from "../lib/tradingView.js";
import { useTradingViewConsent } from "../lib/tradingViewClient.js";

const SCRIPT_BASE = "https://s3.tradingview.com/external-embedding/embed-widget-";
const LOCALE = "de_DE";

/** Zeigt bis zur Zustimmung den Platzhalter, danach die Kinder (die Widgets). */
export function TradingViewConsent({ children }) {
  const [given, give] = useTradingViewConsent();
  if (given) return children;
  return (
    <div className="card">
      <p className="max-w-[62ch] leading-relaxed text-[var(--text-soft)]">
        Kurs, Kursverlauf und aktuelle Marktkapitalisierung kommen von TradingView. Sie werden erst geladen, wenn du es möchtest.
      </p>
      <button type="button" onClick={give} className="btn-primary mt-5">
        Kursdaten von TradingView laden
      </button>
      <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-[var(--muted)]">
        Beim Laden werden Daten, u. a. deine IP-Adresse, an TradingView (USA) übertragen. Die Entscheidung gilt, bis du die Seite neu lädst.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Widget

/**
 * Ein TradingView-Widget. Nur innerhalb von <TradingViewConsent> verwenden.
 *   widget:    Name aus der Widget-Doku, z. B. "symbol-overview", "financials" (Fundamental Data)
 *   config:    Einstellungen laut Doku (ohne locale, wird ergänzt); width/height "100%"
 *   symbol:    z. B. "NASDAQ:AAPL" (für den Pflicht-Link)
 *   linkLabel: Text des Links, z. B. "AAPL-Kurs"
 *   className: Höhe des Bereichs inkl. Link, z. B. "h-[440px]". Am äußeren Rahmen, weil
 *              TradingView die Höhe am Widget-Container selbst auf 100 % setzt.
 */
export default function TradingViewWidget({ widget, config, symbol, linkLabel, className = "" }) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const configJson = JSON.stringify({ locale: LOCALE, ...config });

  useEffect(() => {
    const container = containerRef.current;
    const target = widgetRef.current;
    if (!container || !target) return;
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = `${SCRIPT_BASE}${widget}.js`;
    script.async = true;
    script.text = configJson; // TradingView liest die Einstellungen aus dem Skript-Inhalt
    container.appendChild(script);
    return () => {
      script.remove();
      target.replaceChildren(); // iframe des Widgets entfernen
    };
  }, [widget, configJson]);

  return (
    <div className={className}>
      <div ref={containerRef} className="tradingview-widget-container" style={{ height: "100%", width: "100%" }}>
        <div ref={widgetRef} className="tradingview-widget-container__widget" style={{ height: "calc(100% - 32px)", width: "100%" }} />
        <div className="tradingview-widget-copyright text-sm text-[var(--muted)]">
          <a href={tradingViewSymbolUrl(symbol)} rel="noopener nofollow" target="_blank" className="text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]">
            <span className="blue-text">{linkLabel}</span>
          </a>
          <span className="trademark">&nbsp;by TradingView</span>
        </div>
      </div>
    </div>
  );
}
