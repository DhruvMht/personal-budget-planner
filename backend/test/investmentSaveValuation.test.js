const { test } = require("node:test");
const assert = require("node:assert/strict");
const Investment = require("../models/Investment");
const controller = require("../controllers/investmentController");

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function quote(t) {
  const mock = t.mock.method(global, "fetch", async () => ({ ok: true, json: async () => ({
    chart: { result: [{ meta: { symbol: "TCS.NS", instrumentType: "EQUITY", currency: "INR", longName: "Tata Consultancy Services", regularMarketPrice: 250, regularMarketTime: 1700000000 } }] },
  }) }));
  return mock;
}
const user = { id: 1, currency: "INR" };
const holding = { id: 2, name: "TCS", type: "Stocks / Equities", amount: 100, current_value: 900, date: "2026-10-08", market_provider: "yahoo", instrument_id: "TCS.NS", units: 2 };

test("create computes current value from latest quote instead of purchase cost or submitted valuation", async t => {
  const fetch = quote(t);
  t.mock.method(Investment, "create", async (_id, item) => item);
  const res = response();
  await controller.create({ user, body: { ...holding, current_value: 99999 } }, res, error => { throw error; });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.investment.amount, 100);
  assert.equal(res.body.investment.current_value, 500);
  assert.equal(fetch.mock.callCount(), 1);
});

test("editing quantity recalculates current value without changing historical cost", async t => {
  quote(t);
  t.mock.method(Investment, "findById", async () => holding);
  t.mock.method(Investment, "update", async (_id, _user, item) => item);
  const res = response();
  await controller.update({ user, params: { id: 2 }, body: { units: 3 } }, res, error => { throw error; });
  assert.equal(res.body.investment.amount, 100);
  assert.equal(res.body.investment.current_value, 750);
});

test("manual entries default to cost when created and retain saved valuation when edited", async t => {
  t.mock.method(Investment, "create", async (_id, item) => item);
  t.mock.method(Investment, "findById", async () => ({ ...holding, market_provider: null, instrument_id: null, units: null, current_value: 375 }));
  t.mock.method(Investment, "update", async (_id, _user, item) => item);
  const created = response();
  await controller.create({ user, body: { name: "Manual", type: "Other Investments", amount: 100 } }, created, error => { throw error; });
  assert.equal(created.body.investment.current_value, 100);
  const updated = response();
  await controller.update({ user, params: { id: 2 }, body: { notes: "Updated note" } }, updated, error => { throw error; });
  assert.equal(updated.body.investment.current_value, 375);
});

test("quote failure cannot save an invented current value", async t => {
  t.mock.method(global, "fetch", async () => { throw new Error("offline"); });
  const create = t.mock.method(Investment, "create", async () => {});
  let failure;
  await controller.create({ user, body: holding }, response(), error => { failure = error; });
  assert.equal(failure.status, 503);
  assert.equal(create.mock.callCount(), 0);
});
