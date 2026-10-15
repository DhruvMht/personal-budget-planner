// Names are for display. Only provider identifiers may be used for valuation.
const TYPES = { "Mutual Funds / SIP": "mfapi", "Stocks / Equities": "yahoo" };
const { MANUAL_CATALOG, manualSuggestions } = require("./investmentCatalog");
const searchCache = new Map();
const { quoteMetadata } = require("../utils/investmentPriceStatus");

function problem(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "BudgetPlanner/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    return await response.json();
  } catch {
    throw problem("Market data is unavailable. Try again later or track this investment manually.", 503);
  }
}

function validateIdentifier(provider, id) {
  if (typeof id !== "string" ||
      (provider === "mfapi" ? !/^\d{1,10}$/.test(id) :
        provider === "yahoo" ? !/^[A-Z0-9&._-]{1,40}\.(NS|BO)$/.test(id) : true)) {
    throw problem("Select a stock or mutual fund from the search results.");
  }
}

async function searchInstruments(type, query) {
  const provider = TYPES[type];
  if (typeof query !== "string" || query.trim().length < 2 || query.length > 100) {
    throw problem("Enter between 2 and 100 characters to search.");
  }
  const q = query.trim();
  if (!provider) {
    if (!Object.hasOwn(MANUAL_CATALOG, type)) throw problem("Choose a supported asset class.");
    return manualSuggestions(type, q);
  }
  const key = `${provider}:${q.toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.results;
  let results;
  if (provider === "mfapi") {
    if (/^\d{1,10}$/.test(q)) {
      const quote = await getQuote(provider, q);
      return [{ provider, instrument_id: q, name: quote.name, exchange: "Indian mutual fund", currency: "INR" }];
    }
    const data = await fetchJson(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`);
    if (!Array.isArray(data)) throw problem("Fund search is temporarily unavailable.", 503);
    results = data.filter(item => item.schemeCode && item.schemeName).slice(0, 30).map(item => ({
      provider, instrument_id: String(item.schemeCode), name: item.schemeName,
      exchange: "Indian mutual fund", currency: "INR",
    }));
  } else {
    const data = await fetchJson(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=30&newsCount=0`);
    if (!Array.isArray(data.quotes)) throw problem("Stock search is temporarily unavailable.", 503);
    results = data.quotes.filter(item => item.quoteType === "EQUITY" && /\.(NS|BO)$/.test(item.symbol || ""))
      .slice(0, 30).map(item => ({
        provider, instrument_id: item.symbol, name: item.longname || item.shortname || item.symbol,
        exchange: item.exchDisp || item.exchange, currency: "INR",
      }));
  }
  if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, { results, expires: Date.now() + 5 * 60 * 1000 });
  return results;
}

async function getQuote(provider, id) {
  validateIdentifier(provider, id);
  if (provider === "mfapi") {
    const data = await fetchJson(`https://api.mfapi.in/mf/${id}/latest`);
    const latest = data.data?.[0];
    const price = Number(latest?.nav);
    if (String(data.meta?.scheme_code) !== id || !data.meta?.scheme_name ||
        !Number.isFinite(price) || price <= 0 || !latest?.date) {
      throw problem("No published NAV is available for this scheme. Select another result or track it manually.", 422);
    }
    const parts = /^(\d{2})-(\d{2})-(\d{4})$/.exec(latest.date);
    const asOf = parts && `${parts[3]}-${parts[2]}-${parts[1]}`;
    if (!asOf || !Number.isFinite(Date.parse(asOf)) || new Date(asOf).toISOString().slice(0, 10) !== asOf) {
      throw problem("The provider returned an invalid NAV date. Please try again later.", 422);
    }
    return { provider, instrument_id: id, name: data.meta.scheme_name,
      price, currency: "INR", as_of: asOf, source: "MFAPI NAV" };
  }
  const data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(id)}?interval=1d&range=5d`);
  const meta = data.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (meta?.symbol !== id || meta?.instrumentType !== "EQUITY" || meta?.currency !== "INR" ||
      !Number.isFinite(price) || price <= 0 || !Number.isFinite(meta?.regularMarketTime)) {
    throw problem("No INR stock quote is available for this symbol. Select another result or track it manually.", 422);
  }
  return { provider, instrument_id: id, name: meta.longName || meta.shortName || id,
    price, currency: "INR", as_of: new Date(meta.regularMarketTime * 1000).toISOString(), source: "Yahoo Finance" };
}

async function validateMarketSelection(type, selection, currency = "INR") {
  const { market_provider: provider, instrument_id: id, units } = selection;
  if (!provider && !id) {
    const quantity = units === null || units === undefined || units === "" ? null : Number(units);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0.00000001 || quantity >= 1e12)) {
      throw problem("Enter a valid number of shares or units.");
    }
    return { market_provider: null, instrument_id: null, units: quantity };
  }
  if (!TYPES[type] || TYPES[type] !== provider) throw problem("Selected instrument does not match the asset class.");
  const quantity = Number(units);
  if (!Number.isFinite(quantity) || quantity < 0.00000001 || quantity >= 1e12) {
    throw problem("Enter a valid number of shares or units (at least 0.00000001).");
  }
  const quote = await getQuote(provider, id);
  if (currency !== quote.currency) throw problem("Automatic valuation currently supports INR portfolios. Use manual tracking for other currencies.");
  if (quote.name.length > 255) throw problem("This instrument's name is too long to save.");
  return {
    name: quote.name, market_provider: provider, instrument_id: id, units: quantity,
    current_value: calculateMarketValue(quantity, quote.price),
    price_metadata: quoteMetadata(quote),
  };
}

function calculateMarketValue(units, price) {
  const value = Math.round(units * price * 100) / 100;
  if (!Number.isFinite(value) || value >= 1e10) throw problem("Valuation exceeds the supported amount.", 422);
  return value;
}

async function valuateSelectedInstrument(investment) {
  if (!investment.market_provider || !investment.instrument_id) {
    throw problem("Select a verified instrument and enter shares or units in Edit Investment before syncing.", 422);
  }
  if (TYPES[investment.type] !== investment.market_provider) throw problem("Instrument does not match the asset class.", 422);
  const units = Number(investment.units);
  if (!Number.isFinite(units) || units <= 0) throw problem("Enter shares or units before syncing.", 422);
  const quote = await getQuote(investment.market_provider, investment.instrument_id);
  const value = calculateMarketValue(units, quote.price);
  return { current_value: value, source: `${quote.source} (${quote.instrument_id}, INR ${quote.price}, as of ${quote.as_of})` };
}

module.exports = { searchInstruments, getQuote, validateMarketSelection, valuateSelectedInstrument, calculateMarketValue };
