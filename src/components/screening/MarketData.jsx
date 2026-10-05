// src/components/screening/MarketData.jsx
//
// Abschnitt „Kurs und Marktdaten“ auf der Detailseite: Kurs-Chart (Symbol Overview) und
// Finanzdaten mit aktueller Marktkapitalisierung (Fundamental Data) von TradingView, erst nach
// Zustimmung. Symbol Info zeigt die Marktkapitalisierung bei keiner Breite, deshalb Fundamental Data.
// Ohne bekannte US-Börse (securities.exchange) wird der Abschnitt nicht angezeigt.

import TradingViewWidget, { TradingViewConsent } from "../TradingViewWidget.jsx";
import { tradingViewColors } from "../../lib/tradingViewClient.js";
import { tradingViewSymbol } from "../../lib/tradingView.js";
import { H2_STYLE } from "./format.js";

function symbolOverviewConfig(symbol, name) {
  const c = tradingViewColors();
  return {
    symbols: [[name, `${symbol}|1D`]],
    chartOnly: false,
    autosize: true,
    width: "100%",
    height: "100%",
    colorTheme: "light",
    isTransparent: false,
    backgroundColor: c.background,
    widgetFontColor: c.text,
    fontColor: c.scaleText,
    gridLineColor: c.grid,
    chartType: "area",
    lineColor: c.line,
    topColor: c.areaTop,
    bottomColor: c.areaBottom,
    lineWidth: 2,
    lineType: 0,
    upColor: c.up,
    downColor: c.down,
    borderUpColor: c.up,
    borderDownColor: c.down,
    wickUpColor: c.up,
    wickDownColor: c.down,
    showVolume: false,
    scalePosition: "right",
    scaleMode: "Normal",
    fontSize: "10",
    headerFontSize: "medium",
    valuesTracking: "1",
    changeMode: "price-and-percent",
    dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D", "60m|1W", "all|1M"],
    hideDateRanges: false,
    hideMarketStatus: false,
    hideSymbolLogo: false,
    noTimeScale: false,
  };
}

function Widgets({ symbol, ticker, name }) {
  return (
    <>
      <div className="card p-3 sm:p-6">
        <TradingViewWidget
          widget="symbol-overview"
          symbol={symbol}
          linkLabel={`${ticker}-Kursverlauf`}
          className="h-[380px] sm:h-[460px]"
          config={symbolOverviewConfig(symbol, name)}
        />
      </div>
      <div className="card mt-4 p-3 sm:p-6">
        <TradingViewWidget
          widget="financials"
          symbol={symbol}
          linkLabel={`${ticker}-Finanzdaten`}
          className="h-[560px] sm:h-[420px]"
          config={{ symbol, colorTheme: "light", isTransparent: true, displayMode: "regular", width: "100%", height: "100%", largeChartUrl: "" }}
        />
      </div>
      <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--muted)]">
        Kurs und Marktkapitalisierung von heute. Die Prüfung rechnet mit der Marktkapitalisierung am Bilanzstichtag, deshalb können die Werte abweichen.
      </p>
    </>
  );
}

export default function MarketData({ ticker, exchange, name }) {
  const symbol = tradingViewSymbol(ticker, exchange);
  if (!symbol) return null;
  return (
    <section className="mt-[72px]" aria-labelledby="kurs-marktdaten">
      <h2 id="kurs-marktdaten" className="font-display" style={{ ...H2_STYLE, fontSize: "24px" }}>
        Kurs und Marktdaten
      </h2>
      <div className="mt-4">
        <TradingViewConsent>
          <Widgets symbol={symbol} ticker={ticker} name={name || ticker} />
        </TradingViewConsent>
      </div>
    </section>
  );
}
