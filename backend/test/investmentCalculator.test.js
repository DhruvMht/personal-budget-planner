const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calculateInvestment } = require("../utils/investmentCalculator");

test("shares to amount uses the supplied unit price", () => {
  assert.deepEqual(calculateInvestment({ field: "units", value: "5", price: "1200.50" }), { units: "5", amount: "6002.50" });
});
test("amount to fractional units rounds to stored quantity precision", () => {
  assert.deepEqual(calculateInvestment({ field: "amount", value: "1000", price: "106.0207" }), { amount: "1000.00", units: "9.43212033" });
});
test("actual purchase price can replace the latest quote", () => {
  assert.equal(calculateInvestment({ field: "units", value: 2, price: 150 }).amount, "300.00");
  assert.equal(calculateInvestment({ field: "amount", value: 300, price: 150 }).units, "2");
});
test("invalid, zero and out-of-range inputs never produce a saveable conversion", () => {
  for (const value of ["", " ", 0, -1, "bad", Infinity, null, true, 1e20]) {
    assert.throws(() => calculateInvestment({ field: "amount", value, price: 100 }), { status: 400 });
  }
  for (const price of ["", 0, -1, NaN, Infinity, null, true]) {
    assert.throws(() => calculateInvestment({ field: "units", value: 2, price }), { status: 400 });
  }
  assert.throws(() => calculateInvestment({ field: "amount", value: 0.01, price: 1e12 }), { status: 400 });
});
