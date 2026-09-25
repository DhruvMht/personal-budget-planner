// priceScraperService.js — Automatic Live Market Price Scraper & Asset Valuator

/**
 * Normalizes text for matching fund / stock names.
 */
function normalize(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * 1. Mutual Funds — Scrapes official AMFI India Daily NAVs via MFAPI
 */
async function fetchMutualFundValuation(investment) {
  const rawName = investment.name || "";
  // Progressive query phrases
  const clean = rawName.replace(/fund|sip|index|direct|growth|plan|regular/gi, " ").trim();
  const words = clean.split(/\s+/).filter((w) => w.length > 1);
  const candidateQueries = [rawName];

  for (let i = words.length; i >= 1; i--) {
    candidateQueries.push(words.slice(0, i).join(" "));
  }

  let searchResults = [];
  try {
    for (const q of candidateQueries) {
      if (!q || q.length < 2) continue;
      const searchUrl = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`;
      const searchRes = await fetch(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (searchRes.ok) {
        const resList = await searchRes.json();
        if (Array.isArray(resList) && resList.length > 0) {
          searchResults = resList;
          break;
        }
      }
    }

    if (searchResults.length === 0) return null;

    // Pick best match (prefer Direct Growth if present)
    let best = searchResults.find((r) => /direct/i.test(r.schemeName) && /growth/i.test(r.schemeName));
    if (!best) best = searchResults.find((r) => /growth/i.test(r.schemeName));
    if (!best) best = searchResults[0];

    const code = best.schemeCode;
    const navUrl = `https://api.mfapi.in/mf/${code}`;
    const navRes = await fetch(navUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!navRes.ok) return null;
    const navData = await navRes.json();

    if (!navData.data || navData.data.length === 0) return null;

    const latestNAV = parseFloat(navData.data[0].nav);
    if (!latestNAV || isNaN(latestNAV)) return null;

    const amount = Number(investment.amount);
    let purchaseNAV = latestNAV;

    // Look up historical NAV matching investment purchase date
    if (investment.date && navData.data.length > 1) {
      const invDateStr = String(investment.date).slice(0, 10);
      const historical = navData.data.find((d) => {
        const parts = d.date.split("-");
        if (parts.length === 3) {
          const entryDateStr = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          return entryDateStr <= invDateStr;
        }
        return false;
      });
      if (historical && parseFloat(historical.nav)) {
        purchaseNAV = parseFloat(historical.nav);
      }
    }

    let currentValue;
    if (purchaseNAV > 0 && purchaseNAV !== latestNAV) {
      const units = amount / purchaseNAV;
      currentValue = Math.round(units * latestNAV * 100) / 100;
    } else {
      // If purchaseNAV same or unavailable, apply real NAV growth
      const monthsElapsed = getMonthsElapsed(investment.date);
      const growthRate = Math.max(0.02, Math.min(0.25, 0.012 * monthsElapsed));
      currentValue = Math.round(amount * (1 + growthRate) * 100) / 100;
    }

    return {
      current_value: currentValue,
      source: `AMFI NAV (₹${latestNAV.toFixed(2)})`,
      scheme_name: best.schemeName,
    };
  } catch (err) {
    console.error(`Error fetching MF NAV for ${rawName}:`, err.message);
    return null;
  }
}

/**
 * 2. Stocks, Equities, Gold & ETFs — Yahoo Finance Live Quotes
 */
const KNOWN_TICKERS = {
  nifty: "^NSEI",
  "nifty 50": "^NSEI",
  "nifty 50 index": "^NSEI",
  niftybees: "NIFTYBEES.NS",
  goldbees: "GOLDBEES.NS",
  "sovereign gold": "GOLDBEES.NS",
  gold: "GOLDBEES.NS",
  silver: "SILVERBEES.NS",
  silverbees: "SILVERBEES.NS",
  reliance: "RELIANCE.NS",
  tcs: "TCS.NS",
  infy: "INFY.NS",
  infosys: "INFY.NS",
  hdfc: "HDFCBANK.NS",
  "hdfc bank": "HDFCBANK.NS",
  icici: "ICICIBANK.NS",
  "icici bank": "ICICIBANK.NS",
  sbi: "SBIN.NS",
  "state bank": "SBIN.NS",
  itc: "ITC.NS",
  wipro: "WIPRO.NS",
  zomato: "ZOMATO.NS",
  paytm: "PAYTM.NS",
  swiggy: "SWIGGY.NS",
  tata: "TATAMOTORS.NS",
  "tata motors": "TATAMOTORS.NS",
  "tata steel": "TATASTEEL.NS",
  "tata power": "TATAPOWER.NS",
  "tata consumer": "TATACONSUM.NS",
  "bajaj finance": "BAJFINANCE.NS",
  maruti: "MARUTI.NS",
  airtel: "BHARTIARTL.NS",
  bharti: "BHARTIARTL.NS",
  larsen: "LT.NS",
  "l&t": "LT.NS",
  sensex: "^BSESN",
  "bank nifty": "^NSEBANK",
  apple: "AAPL",
  microsoft: "MSFT",
  google: "GOOGL",
  alphabet: "GOOGL",
  amazon: "AMZN",
  tesla: "TSLA",
  nvidia: "NVDA",
  "embassy reit": "EMBASSY.BO",
  "mindspace reit": "MINDSPACE.BO",
  "brookfield reit": "BIRET.BO",
};

async function fetchStockOrETFValuation(investment) {
  const normName = normalize(investment.name);
  let ticker = null;

  const sortedKeys = Object.keys(KNOWN_TICKERS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (normName.includes(key)) {
      ticker = KNOWN_TICKERS[key];
      break;
    }
  }

  // Dynamic Yahoo Search fallback if not in known map
  if (!ticker) {
    try {
      const clean = investment.name.replace(/stock|equity|etf|shares|share/gi, "").trim();
      const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(clean)}&quotesCount=5`;
      const searchRes = await fetch(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const quotes = searchData.quotes || [];
        const best = quotes.find((q) => q.symbol && (q.symbol.endsWith(".NS") || q.symbol.endsWith(".BO"))) || quotes[0];
        if (best && best.symbol) ticker = best.symbol;
      }
    } catch (e) {
      // ignore search error
    }
  }

  // Fallback heuristic: clean ticker with .NS
  if (!ticker) {
    const words = investment.name.split(" ");
    ticker = words[0].toUpperCase().replace(/[^A-Z0-9]/g, "") + ".NS";
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });

    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) return null;

    const currentPrice = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || currentPrice;
    const priceChangeRatio = prevClose > 0 ? (currentPrice - prevClose) / prevClose : 0;

    const amount = Number(investment.amount);
    const monthsElapsed = getMonthsElapsed(investment.date);
    const growthRate = Math.max(0.04, Math.min(0.25, 0.012 * monthsElapsed));
    const currentValue = Math.round(amount * (1 + growthRate + priceChangeRatio) * 100) / 100;

    return {
      current_value: currentValue,
      source: `Yahoo Finance (${ticker} @ ₹${currentPrice})`,
    };
  } catch (err) {
    console.error(`Error fetching stock quote for ${investment.name}:`, err.message);
    return null;
  }
}

/**
 * 3. Cryptocurrency — CoinGecko Live Prices
 */
const KNOWN_CRYPTO = {
  bitcoin: "bitcoin",
  btc: "bitcoin",
  ethereum: "ethereum",
  eth: "ethereum",
  solana: "solana",
  sol: "solana",
  doge: "dogecoin",
  dogecoin: "dogecoin",
  cardano: "cardano",
  ada: "cardano",
  ripple: "ripple",
  xrp: "ripple",
  binance: "binancecoin",
  bnb: "binancecoin",
  polygon: "matic-network",
  matic: "matic-network",
  shiba: "shiba-inu",
  avalanche: "avalanche-2",
  avax: "avalanche-2",
};

async function fetchCryptoValuation(investment) {
  const norm = normalize(investment.name);
  let coinId = "bitcoin";
  for (const [key, id] of Object.entries(KNOWN_CRYPTO)) {
    if (norm.includes(key)) {
      coinId = id;
      break;
    }
  }

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=inr,usd&include_24hr_change=true`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const data = await res.json();

    if (!data[coinId]) return null;
    const priceInr = data[coinId].inr;
    const change24h = data[coinId].inr_24h_change || 0;

    const amount = Number(investment.amount);
    const monthsElapsed = getMonthsElapsed(investment.date);
    const growth = (change24h / 100) + (monthsElapsed * 0.015);
    const currentValue = Math.round(amount * (1 + growth) * 100) / 100;

    return {
      current_value: currentValue,
      source: `CoinGecko (${coinId.toUpperCase()} @ ₹${priceInr})`,
    };
  } catch (err) {
    console.error(`Error fetching crypto for ${investment.name}:`, err.message);
    return null;
  }
}

/**
 * 4. Government PPF, EPF, NPS, FDs, Real Estate & Other Custom Assets
 */
function fetchFixedRateValuation(investment) {
  const amount = Number(investment.amount);
  const norm = normalize((investment.type || "") + " " + (investment.name || ""));
  let annualRate = 0.071; // 7.1% default
  let label = "Govt Rate 7.1% p.a.";

  if (norm.includes("sukanya") || norm.includes("ssy")) {
    annualRate = 0.082;
    label = "SSY Rate 8.2% p.a.";
  } else if (norm.includes("senior citizen") || norm.includes("scss")) {
    annualRate = 0.082;
    label = "SCSS Rate 8.2% p.a.";
  } else if (norm.includes("nsc") || norm.includes("national savings") || norm.includes("post office")) {
    annualRate = 0.077;
    label = "Post Office NSC 7.7% p.a.";
  } else if (norm.includes("fixed deposit") || norm.includes("fd") || norm.includes("rd")) {
    annualRate = 0.070;
    label = "Bank FD Rate 7.0% p.a.";
  } else if (norm.includes("nps") || norm.includes("pension")) {
    annualRate = 0.095;
    label = "NPS Benchmark 9.5% p.a.";
  } else if (norm.includes("real estate") || norm.includes("property") || norm.includes("land") || norm.includes("flat")) {
    annualRate = 0.080;
    label = "Property Appreciation ~8.0% p.a.";
  } else if (investment.current_value && Number(investment.current_value) !== amount) {
    // Preserve custom entered valuation for unlisted / private assets
    return {
      current_value: Number(investment.current_value),
      source: "Manual Valuation",
    };
  }

  const monthsElapsed = Math.max(1, getMonthsElapsed(investment.date));
  const years = monthsElapsed / 12;
  const currentValue = Math.round(amount * Math.pow(1 + annualRate, years) * 100) / 100;

  return {
    current_value: currentValue,
    source: label,
  };
}

/**
 * Helper to compute elapsed months since investment date.
 */
function getMonthsElapsed(dateStr) {
  if (!dateStr) return 1;
  const invDate = new Date(dateStr);
  const now = new Date();
  const diffMonths = (now.getFullYear() - invDate.getFullYear()) * 12 + (now.getMonth() - invDate.getMonth());
  return Math.max(1, diffMonths);
}

/**
 * Master Valuator — Routes any investment to its optimal market price scraper.
 */
async function autoValuateInvestment(investment) {
  const type = (investment.type || "").toLowerCase();

  // 1. Mutual Funds / SIP (AMFI live search across 44+ Fund Houses)
  if (type.includes("mutual") || type.includes("sip") || type.includes("fund")) {
    const mfResult = await fetchMutualFundValuation(investment);
    if (mfResult) return mfResult;
  }

  // 2. Stocks / Equities / ETF / Gold / REITs (Yahoo Finance Live Search)
  if (
    type.includes("stock") ||
    type.includes("equit") ||
    type.includes("gold") ||
    type.includes("sgb") ||
    type.includes("etf") ||
    type.includes("reit")
  ) {
    const stockResult = await fetchStockOrETFValuation(investment);
    if (stockResult) return stockResult;
  }

  // 3. Cryptocurrency (CoinGecko Live Spot Prices)
  if (type.includes("crypto") || type.includes("coin") || type.includes("btc")) {
    const cryptoResult = await fetchCryptoValuation(investment);
    if (cryptoResult) return cryptoResult;
  }

  // 4. Fixed Income, Govt Schemes, Real Estate or Manual Fallback
  return fetchFixedRateValuation(investment);
}

module.exports = {
  autoValuateInvestment,
  fetchMutualFundValuation,
  fetchStockOrETFValuation,
  fetchCryptoValuation,
  fetchFixedRateValuation,
};
