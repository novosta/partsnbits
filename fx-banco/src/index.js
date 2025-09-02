import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 8787;
const BANXICO_TOKEN = process.env.BANXICO_TOKEN;
const BUY_SPREAD_BPS = Number(process.env.BUY_SPREAD_BPS || 25);
const SELL_SPREAD_BPS = Number(process.env.SELL_SPREAD_BPS || 25);
const SERIES_ID = process.env.BANXICO_SERIES_ID || "SF43718"; // USD/MXN FIX
const SOURCE = process.env.FX_SOURCE || "banxico_fix";

// optional: serve a cached result to avoid rate limits and handle outages
let cache = { asOf: null, usd_mxn_mid: null, stale: true, raw: null };

function parseBanxicoDate(d) {
  // Banxico gives dd/mm/yyyy, convert to yyyy-mm-dd
  if (!d || !d.includes("/")) return d;
  const [day, month, year] = d.split("/");
  return `${year}-${month}-${day}`;
}

async function fetchBanxico() {
  const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${SERIES_ID}/datos/oportuno?locale=en`;
  const headers = { Accept: "application/json" };
  if (BANXICO_TOKEN) headers["Bmx-Token"] = BANXICO_TOKEN;

  const r = await fetch(url, { headers });
  if (!r.ok) {
    throw new Error(`BANXICO_UPSTREAM_${r.status}`);
  }
  const j = await r.json();
  const serie = j?.bmx?.series?.[0];
  const punto = serie?.datos?.[0];
  const mid = Number(punto?.dato);
  const fecha = parseBanxicoDate(punto?.fecha); // fix here

  if (!Number.isFinite(mid) || !fecha) {
    throw new Error("BANXICO_PARSE_ERROR");
  }

  // Normalize to ISO UTC — treating FIX as ~18:00 UTC
  const asOf = new Date(`${fecha}T18:00:00Z`).toISOString();

  cache = {
    asOf,
    usd_mxn_mid: Number(mid.toFixed(4)),
    stale: false,
    raw: j,
  };
  return cache;
}

function isStale(asOfISO) {
  if (!asOfISO) return true;
  const now = Date.now();
  const asOfMs = Date.parse(asOfISO);
  return (now - asOfMs) > 24 * 60 * 60 * 1000; // >24h
}

// Healthcheck
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    source: SOURCE,
    cached: !!cache.asOf,
    stale: isStale(cache.asOf),
  });
});

// Miami FX placeholder schema
app.get("/fx/usd-mxn/latest", async (_req, res) => {
  try {
    const MAX_CACHE_MS = Number(process.env.MAX_CACHE_MS || 60 * 60 * 1000);
    const needsRefresh =
      !cache.asOf || Date.now() - Date.parse(cache.asOf) > MAX_CACHE_MS;

    if (needsRefresh) {
      await fetchBanxico();
    }

    const stale = isStale(cache.asOf);
    res.json({
      asOf: cache.asOf,
      usd_mxn_mid: cache.usd_mxn_mid,
      buy_spread_bps: BUY_SPREAD_BPS,
      sell_spread_bps: SELL_SPREAD_BPS,
      source: SOURCE,
      stale,
    });
  } catch (e) {
    console.error("FX endpoint error:", e);
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`FX adapter listening on :${PORT}`);
});
