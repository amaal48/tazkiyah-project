// src/screening/supabaseRepo.js
//
// Datenbankzugriff des Runners. Braucht einen Supabase-Client mit dem
// SERVICE-ROLE-KEY (nur serverseitig, nie im Frontend).

const PAGE = 1000;

/** Liest alle Zeilen, auch über die Supabase-Grenze von 1000 Zeilen hinaus. */
async function fetchAll(makeQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

export function createSupabaseRepo(db) {
  return {
    async loadState({ provider, day }) {
      const [securities, runs, reviews, holdings, purification, usage] = await Promise.all([
        fetchAll(() => db.from("securities").select("*").order("ticker")),
        fetchAll(() =>
          db
            .from("screening_current")
            .select("security_id,id,run_at,status,quarter_period_end,engine_version,parameters_version,inputs,fingerprint")
            .order("security_id")
        ),
        fetchAll(() =>
          db
            .from("manual_reviews")
            .select("id,security_id,criterion,result,details,source_url,source_note,reviewer,reviewed_at,basis_annual_period_end")
            .order("id")
        ),
        fetchAll(() => db.from("etf_holdings").select("etf_id,holding_isin,holding_ticker,holding_country,weight,as_of").order("etf_id")),
        fetchAll(() =>
          db.from("purification_amounts").select("security_id,period_end,rate_pct_of_price").order("security_id")
        ),
        db.from("screening_api_usage").select("calls").eq("day", day).eq("provider", provider).maybeSingle(),
      ]);
      if (usage.error) throw new Error(usage.error.message);

      const currentRuns = new Map(runs.map((r) => [r.security_id, r]));

      const reviewsBySecurity = new Map();
      const lastReviewAt = new Map();
      for (const r of reviews) {
        if (!reviewsBySecurity.has(r.security_id)) reviewsBySecurity.set(r.security_id, []);
        reviewsBySecurity.get(r.security_id).push(r);
        const prev = lastReviewAt.get(r.security_id);
        if (!prev || r.reviewed_at > prev) lastReviewAt.set(r.security_id, r.reviewed_at);
      }

      // Nur der jüngste Holdings-Stand je ETF
      const latestAsOf = new Map();
      for (const h of holdings) {
        if (!latestAsOf.has(h.etf_id) || h.as_of > latestAsOf.get(h.etf_id)) latestAsOf.set(h.etf_id, h.as_of);
      }
      const holdingsByEtf = new Map();
      for (const h of holdings) {
        if (h.as_of !== latestAsOf.get(h.etf_id)) continue;
        if (!holdingsByEtf.has(h.etf_id)) holdingsByEtf.set(h.etf_id, []);
        holdingsByEtf.get(h.etf_id).push(h);
      }

      // Jüngste Reinigungsquote je Aktie (Grundlage für G5)
      const latestPurif = new Map();
      for (const p of purification) {
        const prev = latestPurif.get(p.security_id);
        if (p.rate_pct_of_price != null && (!prev || p.period_end > prev.period_end)) latestPurif.set(p.security_id, p);
      }
      const purificationRate = new Map([...latestPurif].map(([id, p]) => [id, Number(p.rate_pct_of_price)]));

      return {
        securities,
        currentRuns,
        reviewsBySecurity,
        lastReviewAt,
        holdingsByEtf,
        purificationRate,
        usedToday: usage.data?.calls ?? 0,
      };
    },

    async saveRun(securityId, result, inputs, fingerprint) {
      const { data, error } = await db
        .from("screening_runs")
        .insert({
          security_id: securityId,
          status: result.status,
          in_universe: result.universe.included,
          annual_period_end: result.dataBasis.annualPeriodEnd,
          quarter_period_end: result.dataBasis.quarterPeriodEnd,
          result,
          parameters: result.parameters,
          engine_version: result.engineVersion,
          parameters_version: result.parametersVersion,
          data_provider: result.dataBasis.provider,
          inputs,
          fingerprint,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const rows = (result.purification?.periods || [])
        .filter((p) => p.calculable)
        .map((p) => ({
          security_id: securityId,
          period_end: p.periodEnd,
          currency: p.currency,
          prohibited_income: p.prohibitedIncome,
          shares_outstanding: p.sharesOutstanding,
          shares_basis: p.sharesBasis,
          amount_per_share: p.amountPerShare,
          amount_per_share_eur: p.amountPerShareEur,
          rate_pct_of_price: p.ratePctOfPrice,
          run_id: data.id,
          computed_at: new Date().toISOString(),
        }));
      if (rows.length) {
        const up = await db.from("purification_amounts").upsert(rows, { onConflict: "security_id,period_end" });
        if (up.error) throw new Error(up.error.message);
      }
      return data.id;
    },

    async updateSecurity(id, patch) {
      const { error } = await db.from("securities").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async addUsage(provider, calls) {
      const { error } = await db.rpc("add_api_usage", { p_provider: provider, p_calls: calls });
      if (error) throw new Error(error.message);
    },
  };
}
