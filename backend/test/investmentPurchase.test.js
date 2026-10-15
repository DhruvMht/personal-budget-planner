const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizePurchase } = require("../utils/investmentPurchase");
const { calculateInvestment } = require("../utils/investmentCalculator");
const { validateSchema } = require("../validation/validate");
const { SCHEMAS } = require("../validation/schemas");

test("every asset type supports amount to quantity and quantity to amount on save", () => {
  for (const type of SCHEMAS.investment.fields.type.values) {
    const base = { name: "Test investment", type, date: "2026-10-15", purchase_price: 125.5 };
    for (const input of [{ ...base, amount: 251 }, { ...base, units: 2 }]) {
      assert.deepEqual(validateSchema("investment", input), [], type);
      assert.deepEqual(normalizePurchase(input), { amount: 251, units: 2, purchase_price: 125.5 });
    }
  }
});

test("fractional quantities retain actual cost and half-cent products round correctly", () => {
  assert.deepEqual(calculateInvestment({ field: "units", value: "1", price: "1.005" }), { amount: "1.01", units: "1" });
  assert.deepEqual(calculateInvestment({ field: "units", value: "3", price: "0.335" }), { amount: "1.01", units: "3" });
  assert.deepEqual(normalizePurchase({ amount: 100, purchase_price: 3 }), { amount: 100, units: 33.33333333, purchase_price: 3 });
});

test("edits use the saved purchase price and preserve purchase data for unrelated changes", () => {
  const current = { amount: 100, units: 2, purchase_price: 50 };
  assert.deepEqual(normalizePurchase({ units: 3 }, current), { amount: 150, units: 3, purchase_price: 50 });
  assert.deepEqual(normalizePurchase({ amount: 200 }, current), { amount: 200, units: 4, purchase_price: 50 });
  assert.deepEqual(normalizePurchase({ purchase_price: 25 }, current), { amount: 100, units: 4, purchase_price: 25 });
  assert.deepEqual(normalizePurchase({ notes: "Updated note" }, current), current);
  const roundedPrice = { amount: 1, units: 3000000, purchase_price: 0.000000333333 };
  assert.deepEqual(validateSchema("investment", roundedPrice, { partial: true }), []);
  assert.deepEqual(normalizePurchase({ ...roundedPrice, notes: "Full form save", calculation_basis: "amount" }, roundedPrice), roundedPrice);
});

test("mismatched values cannot be saved without an explicit authoritative input", () => {
  assert.throws(() => normalizePurchase({ amount: 100, units: 999, purchase_price: 50 }), { status: 400 });
  assert.deepEqual(normalizePurchase({ amount: 100, units: 999, purchase_price: 50, calculation_basis: "amount" }), { amount: 100, units: 2, purchase_price: 50 });
  assert.deepEqual(normalizePurchase({ amount: 999, units: 2, purchase_price: 50, calculation_basis: "units" }), { amount: 100, units: 2, purchase_price: 50 });
});

test("unknown legacy quantity stays unknown and known cost plus quantity can supply a purchase price", () => {
  assert.deepEqual(normalizePurchase({ amount: 100 }), { amount: 100, units: null, purchase_price: null });
  assert.deepEqual(normalizePurchase({ amount: 100, units: 4 }), { amount: 100, units: 4, purchase_price: 25 });
  for (const purchase_price of [0, -1, null, "", "bad", Infinity, 1e13]) {
    assert.throws(() => normalizePurchase({ amount: 100, purchase_price }), { status: 400 });
  }
});
