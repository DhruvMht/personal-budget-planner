const { test } = require("node:test");
const assert = require("node:assert/strict");
const market = require("../services/marketInstrumentService");
const { autoValuateInvestment } = require("../services/priceScraperService");

const stock = { type: "Stocks / Equities", name: "Misspelled name", market_provider: "yahoo", instrument_id: "TCS.NS", units: 2.5, amount: 1000 };
const fund = { type: "Mutual Funds / SIP", market_provider: "mfapi", instrument_id: "120503", units: 10 };
const stockData = { chart: { result: [{ meta: { symbol: "TCS.NS", instrumentType: "EQUITY", currency: "INR", longName: "Tata Consultancy Services", regularMarketPrice: 400, regularMarketTime: 1700000000 } }] } };
const fundData = { meta: { scheme_code: 120503, scheme_name: "Exact Direct Growth Plan" }, data: [{ nav: "106.02070", date: "07-10-2026" }] };
function mockFetch(t, data) {
  return t.mock.method(global, "fetch", async () => ({ ok: true, json: async () => data }));
}

test("stock valuation uses saved ticker and actual quantity, irrespective of name or invested amount", async t => {
  const fetch = mockFetch(t, stockData);
  const value = await autoValuateInvestment(stock);
  assert.equal(value.current_value, 1000);
  assert.match(fetch.mock.calls[0].arguments[0], /chart\/TCS.NS/);
  assert.match(value.source, /as of/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("mutual fund uses the exact scheme code and units, including fractional NAV", async t => {
  const fetch = mockFetch(t, fundData);
  assert.equal((await autoValuateInvestment(fund)).current_value, 1060.21);
  assert.match(fetch.mock.calls[0].arguments[0], /mf\/120503\/latest$/);
});

test("unlinked and misspelled legacy investments do not trigger a search or estimated growth", async t => {
  const fetch = mockFetch(t, {});
  for (const type of ["Stocks / Equities", "Mutual Funds / SIP"]) {
    await assert.rejects(autoValuateInvestment({ type, name: "Random typo", amount: 5000 }), /Select a verified instrument/);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("outages leave valuation unavailable instead of substituting fixed returns", async t => {
  t.mock.method(global, "fetch", async () => { throw new Error("offline"); });
  await assert.rejects(autoValuateInvestment(stock), { status: 503 });
  await assert.rejects(autoValuateInvestment(fund), { status: 503 });
});

test("save validates provider/type pairing, symbol syntax, units and quote currency", async t => {
  const fetch = mockFetch(t, stockData);
  await assert.rejects(market.validateMarketSelection(fund.type, stock), /asset class/);
  await assert.rejects(market.validateMarketSelection(stock.type, { ...stock, instrument_id: "../bad" }), /search results/);
  for (const units of [0, -1, "not a number", 1e-9, Infinity]) {
    await assert.rejects(market.validateMarketSelection(stock.type, { ...stock, units }), /valid number/);
  }
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(market.validateMarketSelection(stock.type, stock, "USD"), /INR portfolios/);
});

test("saved display name comes from provider, not submitted text", async t => {
  mockFetch(t, stockData);
  const result = await market.validateMarketSelection(stock.type, stock);
  assert.equal(result.name, "Tata Consultancy Services");
  assert.equal(result.instrument_id, "TCS.NS");
  assert.equal(result.units, 2.5);
});

test("manual mode clears instrument fields and retains entered quantity without network calls", async t => {
  const fetch = mockFetch(t, {});
  assert.deepEqual(await market.validateMarketSelection(stock.type, { market_provider: null, instrument_id: null, units: 5 }), { market_provider: null, instrument_id: null, units: 5 });
  assert.equal(fetch.mock.callCount(), 0);
});

test("provider mismatches, missing quotes and wrong currencies are rejected", async t => {
  const fetch = mockFetch(t, { ...fundData, meta: { ...fundData.meta, scheme_code: 999 } });
  await assert.rejects(market.getQuote("mfapi", "120503"), { status: 422 });
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ chart: { result: [{ meta: { ...stockData.chart.result[0].meta, currency: "USD" } }] } }) }));
  await assert.rejects(market.getQuote("yahoo", "TCS.NS"), { status: 422 });
});

test("fund search retains all plan variants and never chooses one automatically", async t => {
  mockFetch(t, [{ schemeCode: 111, schemeName: "Example Regular Growth" }, { schemeCode: 222, schemeName: "Example Direct Growth" }]);
  const results = await market.searchInstruments(fund.type, "example variants");
  assert.equal(results.length, 2);
  assert.deepEqual(results.map(item => item.instrument_id), ["111", "222"]);
});

test("stock search excludes non-equities and foreign listings", async t => {
  mockFetch(t, { quotes: [{ symbol: "TCS.NS", quoteType: "EQUITY" }, { symbol: "TCS.BO", quoteType: "EQUITY" }, { symbol: "OTHER", quoteType: "EQUITY" }, { symbol: "FUND.NS", quoteType: "ETF" }] });
  assert.deepEqual((await market.searchInstruments(stock.type, "stock filtering")).map(item => item.instrument_id), ["TCS.NS", "TCS.BO"]);
});

test("empty results remain empty and exact fund code lookup resolves its own scheme", async t => {
  const fetch = mockFetch(t, []);
  assert.deepEqual(await market.searchInstruments(fund.type, "no matching scheme"), []);
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => fundData }));
  assert.equal((await market.searchInstruments(fund.type, "120503"))[0].instrument_id, "120503");
});
