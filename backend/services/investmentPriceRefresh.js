const Investment = require("../models/Investment");
const market = require("./marketInstrumentService");
const { quoteMetadata, isRefreshDue } = require("../utils/investmentPriceStatus");
const pending = new Map();

async function identifyInstrument(item) {
  const provider = { "Stocks / Equities": "yahoo", "Mutual Funds / SIP": "mfapi" }[item.type];
  if (!provider) throw Object.assign(new Error("No supported public live price for this asset. Its saved valuation is retained."), { status: 422 });
  if (!(Number(item.units) > 0)) throw Object.assign(new Error("Quantity is missing. Enter your actual shares or units in Edit Investment."), { status: 422 });
  if (item.market_provider && item.instrument_id) {
    if (provider !== item.market_provider) throw Object.assign(new Error("The saved price source does not match the asset type. Correct the investment in Edit."), { status: 422 });
    return { provider, instrument_id: item.instrument_id };
  }
  // Older records can be resolved without a separate linking step, but never guess
  // between exchanges, similarly named companies, or mutual-fund plan variants.
  const normalize = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const name = normalize(item.name);
  const results = await market.searchInstruments(item.type, item.name.trim().slice(0, 100));
  const matches = results.filter(result => result.provider === provider &&
    (normalize(result.instrument_id) === name || normalize(result.name) === name));
  const unique = [...new Map(matches.map(result => [result.instrument_id, result])).values()];
  if (unique.length !== 1) throw Object.assign(new Error("Could not identify one exact stock or fund. Select the correct search result in Edit Investment."), { status: 422 });
  return { provider, instrument_id: unique[0].instrument_id };
}

async function refreshHolding(item, quotes = new Map()) {
  const key = `${item.user_id}:${item.id}`;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const instrument = await identifyInstrument(item);
    let quote, value;
    try {
      if (!(Number(item.units) > 0)) throw Object.assign(new Error("Enter shares or units before refreshing prices."), { status: 422 });
      const quoteKey = `${instrument.provider}:${instrument.instrument_id}`;
      if (!quotes.has(quoteKey)) quotes.set(quoteKey, market.getQuote(instrument.provider, instrument.instrument_id));
      quote = await quotes.get(quoteKey);
      value = market.calculateMarketValue(Number(item.units), quote.price);
    } catch (error) {
      await Investment.recordPriceFailure(item, error.message);
      throw error;
    }
    const metadata = quoteMetadata(quote);
    if (!await Investment.saveMarketPrice(item, value, metadata, instrument)) {
      throw Object.assign(new Error("This holding changed during the refresh. Refresh again to use its latest quantity."), { status: 409 });
    }
    const cost = Number(item.amount);
    const profit = Math.round((value - cost) * 100) / 100;
    return {
      id: item.id, name: item.name, old_value: Number(item.current_value ?? item.amount), new_value: value,
      invested_amount: cost, profit_loss: profit, roi_percent: cost > 0 ? Math.round((profit / cost) * 10000) / 100 : 0,
      source: quote.source, price_metadata: metadata,
    };
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

async function refreshPortfolio(items, { automatic = false } = {}) {
  const updated = [], skipped = [], quotes = new Map();
  const eligible = items.filter(item => !automatic || (item.market_provider && item.instrument_id && isRefreshDue(item)));
  let index = 0;
  // Limit provider and database pressure; repeated purchases share one quote request.
  await Promise.all(Array.from({ length: Math.min(3, eligible.length) }, async () => {
    while (index < eligible.length) {
      const item = eligible[index++];
      try { updated.push(await refreshHolding(item, quotes)); }
      catch (error) { skipped.push({ id: item.id, name: item.name, reason: error.message }); }
    }
  }));
  return { updated, skipped, updated_count: updated.length, attempted_count: eligible.length };
}

module.exports = { refreshHolding, refreshPortfolio };
