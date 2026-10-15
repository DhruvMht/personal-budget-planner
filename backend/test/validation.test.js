const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateSchema, validateFields } = require("../validation/validate");
const { validate } = require("../middleware/validateSchema");
const { examples, samples } = require("../validation/examples");

test("salary allows past/current months but rejects later months and years across year boundaries", () => {
  for (const [now, allowed, rejected] of [
    [new Date(2026, 9, 14), ["2025-12", "2026-09", "2026-10"], ["2026-11", "2027-01"]],
    [new Date(2026, 11, 31), ["2026-11", "2026-12"], ["2027-01", "2027-12"]],
    [new Date(2027, 0, 1), ["2026-12", "2027-01"], ["2027-02", "2028-01"]],
  ]) {
    for (const month of allowed) assert.deepEqual(validateSchema("income", { ...samples.income, month }, { now }), []);
    for (const month of rejected) {
      assert.ok(validateSchema("income", { ...samples.income, source: " SALARY ", month }, { now }).some(error => error.field === "month"));
      assert.deepEqual(validateSchema("income", { ...samples.income, source: "Freelancing", month }, { now }), []);
    }
  }
});

test("all demonstration cases match actual shared validation, including the intended failing field", () => {
  for (const item of examples) {
    const errors = validateSchema(item.schema, item.payload);
    assert.equal(errors.length === 0, item.expected === "accept", item.id);
    if (item.errorField) assert.ok(errors.some(error => error.field === item.errorField), item.id);
  }
});

test("live request middleware has identical results to the panel's validation for every example", () => {
  for (const item of examples) {
    let nextCalled = false;
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    validate(item.schema)({ body: item.payload }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, item.expected === "accept", item.id);
    if (!nextCalled) { assert.equal(res.code, 400); assert.match(res.body.message, /Incorrect value/); }
  }
});

test("number fields reject booleans, arrays, objects, null, blanks, infinity and hex strings", () => {
  for (const value of [true, false, [], [50], {}, null, "", "  ", Infinity, NaN, "0x10"]) {
    assert.ok(validateSchema("income", { ...samples.income, amount: value }).some(error => error.field === "amount"), String(value));
  }
});

test("partial updates skip missing fields but validate every explicitly supplied field", () => {
  assert.deepEqual(validateSchema("income", { amount: 10 }, { partial: true }), []);
  assert.ok(validateSchema("income", { source: " " }, { partial: true }).length);
  assert.ok(validateSchema("reminder", { amount: -1, due_day: 32 }, { partial: true }).length === 2);
  assert.ok(validateSchema("profile", { salary_date: -1 }, { partial: true }).length);
  assert.deepEqual(validateSchema("goal", { deadline: null }, { partial: true }), []);
});

test("dates reject rollover, malformed dates and timestamps but allow real leap dates", () => {
  for (const date of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-01-00", "2026-1-1", "2026-01-01T12:00:00Z", 1234]) {
    assert.ok(validateSchema("expense", { ...samples.expense, date }).some(error => error.field === "date"));
  }
  assert.deepEqual(validateSchema("expense", { ...samples.expense, date: "2028-02-29" }), []);
});

test("minimum and maximum money limits preserve legitimate zero balances", () => {
  assert.deepEqual(validateSchema("income", { ...samples.income, amount: 0.01 }), []);
  assert.deepEqual(validateSchema("income", { ...samples.income, amount: 9999999999.99 }), []);
  assert.deepEqual(validateSchema("budget", { ...samples.budget, monthly_limit: 0 }), []);
  assert.deepEqual(validateSchema("goal", { ...samples.goal, saved_amount: 0 }), []);
  assert.ok(validateSchema("income", { ...samples.income, amount: 0 }).length);
});

test("linked instruments validate identifier, quantity, asset class and date/month agreement", () => {
  const value = { ...samples.investment, market_provider: "yahoo", instrument_id: "TCS.NS", units: 2 };
  assert.deepEqual(validateSchema("investment", value), []);
  assert.ok(validateSchema("investment", { ...value, instrument_id: "../other" }).length);
  assert.ok(validateSchema("investment", { ...value, units: 0.000000001 }).length);
  assert.ok(validateSchema("investment", { ...value, month: "2026-11" }).length);
});

test("password rules enforce bcrypt's byte limit, not just character count", () => {
  assert.ok(validateSchema("registration", { ...samples.registration, password: "界".repeat(25) }).some(error => error.field === "password"));
});

test("request bodies and optional values must have the correct types", () => {
  assert.ok(validateSchema("income", null).length);
  assert.ok(validateSchema("income", []).length);
  assert.ok(validateFields({ email: { type: "email", label: "Email" } }, { email: ["a@b.com"] }).length);
  assert.ok(validateSchema("reminder", { ...samples.reminder, is_recurring: "false" }).length);
});
