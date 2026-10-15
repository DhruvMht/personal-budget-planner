const { test } = require("node:test");
const assert = require("node:assert/strict");
const Investment = require("../models/Investment");
const market = require("../services/marketInstrumentService");
const { refreshHolding, refreshPortfolio } = require("../services/investmentPriceRefresh");
const { isRefreshDue, withPriceStatus, quoteMetadata } = require("../utils/investmentPriceStatus");
const item = { id: 1, user_id: 42, name: "Stock", type: "Stocks / Equities", market_provider: "yahoo", instrument_id: "TCS.NS", units: 10, amount: 1000, current_value: 1000 };
const quote = { price: 120, as_of: new Date().toISOString(), source: "Test provider" };

test("refresh calculates profit from units and persists quote metadata without mutating purchase cost", async t => {
  t.mock.method(market, "getQuote", async () => quote);
  const saved = t.mock.method(Investment, "saveMarketPrice", async () => true);
  const result = await refreshHolding(item);
  assert.equal(result.new_value, 1200);
  assert.equal(result.profit_loss, 200);
  assert.equal(result.roi_percent, 20);
  assert.equal(item.amount, 1000);
  assert.equal(saved.mock.calls[0].arguments[1], 1200);
  assert.equal(saved.mock.calls[0].arguments[2].price, 120);
  assert.equal(saved.mock.calls[0].arguments[2].as_of, quote.as_of);
});

test("outage records an error without writing a replacement valuation", async t => {
  t.mock.method(market, "getQuote", async () => { throw Object.assign(new Error("Provider unavailable"), { status: 503 }); });
  const save = t.mock.method(Investment, "saveMarketPrice", async () => true);
  const failed = t.mock.method(Investment, "recordPriceFailure", async () => {});
  await assert.rejects(refreshHolding(item), { status: 503 });
  assert.equal(save.mock.callCount(), 0);
  assert.equal(failed.mock.callCount(), 1);
});

test("bulk refresh shares a quote across purchases, skips fresh holdings, and excludes manual assets automatically", async t => {
  const provider = t.mock.method(market, "getQuote", async () => quote);
  t.mock.method(Investment, "saveMarketPrice", async () => true);
  const result = await refreshPortfolio([item, { ...item, id: 2 },
    { ...item, id: 3, price_metadata: quoteMetadata(quote) },
    { ...item, id: 4, market_provider: null, instrument_id: null }], { automatic: true });
  assert.equal(result.updated_count, 2);
  assert.equal(result.attempted_count, 2);
  assert.equal(provider.mock.callCount(), 1);
});

test("overlapping refresh requests do not duplicate provider calls or writes", async t => {
  const provider = t.mock.method(market, "getQuote", async () => quote);
  const saved = t.mock.method(Investment, "saveMarketPrice", async () => true);
  await Promise.all([refreshHolding(item), refreshHolding(item)]);
  assert.equal(provider.mock.callCount(), 1);
  assert.equal(saved.mock.callCount(), 1);
});

test("older holdings with an exact unique name are identified and valued in one action", async t => {
  t.mock.method(market, "searchInstruments", async () => [{ provider: "yahoo", instrument_id: "TCS.NS", name: "Stock" }]);
  t.mock.method(market, "getQuote", async () => quote);
  const save = t.mock.method(Investment, "saveMarketPrice", async () => true);
  const result = await refreshHolding({ ...item, market_provider: null, instrument_id: null });
  assert.equal(result.new_value, 1200);
  assert.equal(result.roi_percent, 20);
  assert.deepEqual(save.mock.calls[0].arguments[3], { provider: "yahoo", instrument_id: "TCS.NS" });
});

test("ambiguous exchange matches and partial names never choose an instrument automatically", async t => {
  const search = t.mock.method(market, "searchInstruments", async () => [
    { provider: "yahoo", instrument_id: "TCS.NS", name: "Stock" },
    { provider: "yahoo", instrument_id: "TCS.BO", name: "Stock" },
  ]);
  const getQuote = t.mock.method(market, "getQuote", async () => quote);
  await assert.rejects(refreshHolding({ ...item, market_provider: null, instrument_id: null }), /one exact/);
  search.mock.mockImplementation(async () => [{ provider: "yahoo", instrument_id: "TCS.NS", name: "Different Stock" }]);
  await assert.rejects(refreshHolding({ ...item, market_provider: null, instrument_id: null }), /one exact/);
  assert.equal(getQuote.mock.callCount(), 0);
});

test("missing quantities and unsupported assets never infer holdings from invested amount", async t => {
  const search = t.mock.method(market, "searchInstruments", async () => []);
  await assert.rejects(refreshHolding({ ...item, units: null, market_provider: null, instrument_id: null }), /Quantity is missing/);
  await assert.rejects(refreshHolding({ ...item, type: "Gold / SGB" }), /No supported public live price/);
  assert.equal(search.mock.callCount(), 0);
});

test("editing a holding while its quote is pending prevents applying the old quantity", async t => {
  t.mock.method(market, "getQuote", async () => quote);
  t.mock.method(Investment, "saveMarketPrice", async () => false);
  await assert.rejects(refreshHolding(item), { status: 409 });
});

test("automatic refresh respects stock and NAV intervals and backs off after failures", () => {
  const now = Date.now();
  const last_attempt_at = new Date(now - 65_000).toISOString();
  assert.equal(isRefreshDue({ ...item, price_metadata: { last_attempt_at } }, now), true);
  assert.equal(isRefreshDue({ ...item, market_provider: "mfapi", price_metadata: { last_attempt_at } }, now), false);
  assert.equal(isRefreshDue({ ...item, price_metadata: { last_attempt_at: new Date(now).toISOString(), error: "offline" } }, now), false);
});

test("price states distinguish missing metadata, expired checks, provider outages, older publications and manual values", () => {
  const metadata = quoteMetadata(quote), now = Date.now();
  assert.equal(withPriceStatus(item).price_status, "unavailable");
  assert.equal(withPriceStatus({ ...item, price_metadata: metadata }).price_status, "latest");
  assert.equal(withPriceStatus({ ...item, price_metadata: metadata }, now + 121_000).price_status, "stale");
  assert.equal(withPriceStatus({ ...item, price_metadata: { ...metadata, error: "offline" } }).price_status, "stale");
  assert.equal(withPriceStatus({ ...item, price_metadata: { ...metadata, as_of: "2020-01-01" } }).price_status, "older");
  assert.equal(withPriceStatus({ ...item, market_provider: null }).price_status, "manual");
});
