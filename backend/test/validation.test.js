const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateSchema, validateFields } = require("../validation/validate");
const { validate } = require("../middleware/validateSchema");
const { examples, samples } = require("../validation/examples");
const { SCHEMAS } = require("../validation/schemas");
const { commonFilters } = require("../middleware/validateSchema");

test("investment dates allow today/past and reject future dates on create and edit for every asset class", () => {
  for (const [now, today, tomorrow] of [
    ["2026-10-15T06:00:00Z", "2026-10-15", "2026-10-16"],
    ["2026-12-31T18:29:59Z", "2026-12-31", "2027-01-01"],
    ["2026-12-31T18:30:00Z", "2027-01-01", "2027-01-02"],
    ["2028-02-28T18:30:00Z", "2028-02-29", "2028-03-01"],
  ]) {
    for (const type of SCHEMAS.investment.fields.type.values) {
      for (const partial of [false, true]) {
        const options = { now: new Date(now), partial };
        const body = partial ? {} : { ...samples.investment, type };
        for (const date of [today, "2024-02-29"]) assert.deepEqual(validateSchema("investment", { ...body, date }, options), []);
        const errors = validateSchema("investment", { ...body, date: tomorrow }, options);
        assert.ok(errors.some(error => error.field === "date" && /later than today/.test(error.message)));
      }
    }
  }
});

test("all free-text fields reject punctuation, markup, emoji and invisible characters on create and edit", () => {
  const invalid = ["Name@", "Name#1", "Name!", "Name-1", "Name_1", "Name's", "Name & Co", "<script>alert(1)</script>", "Name\\path", "Name/1", "Name.1", "Name,1", "Name🙂", "Name\u200b", "Name\u202e", "Name\n", "Name\t", "Name\0", "Name\u00a0"];
  for (const [schema, { fields }] of Object.entries(SCHEMAS)) {
    for (const [field, rule] of Object.entries(fields)) {
      if (rule.characters !== "plain") continue;
      for (const value of invalid) {
        for (const partial of [false, true]) {
          assert.ok(validateSchema(schema, { ...samples[schema], [field]: value }, { partial }).some(e => e.field === field), `${schema}.${field}: ${JSON.stringify(value)}`);
        }
      }
      for (const value of ["Valid name 123", "ध्रुव १२३", "José 123"]) {
        assert.equal(validateSchema(schema, { ...samples[schema], [field]: value }).some(e => e.field === field), false, `${schema}.${field}: ${value}`);
      }
    }
  }
});

test("password symbols remain valid and are not changed", () => {
  const password = "Aa!@#$%^&*()_+-=[]{};:'\",.<>/?\\|`~123";
  for (const schema of ["registration", "login", "profile"]) {
    const payload = { ...samples[schema], password };
    assert.deepEqual(validateSchema(schema, payload), []);
    assert.equal(payload.password, password);
  }
});

test("the fixed email pattern accepts email punctuation and rejects malformed local parts and domains", () => {
  for (const schema of ["registration", "login", "profile"]) {
    for (const email of ["demo.user+tag@example.com", "o'connor@sub.example.co.in", "user_name@example-domain.com", " Demo@Example.com "]) {
      assert.deepEqual(validateSchema(schema, { ...samples[schema], email }), [], email);
    }
    for (const email of ["a..b@example.com", ".ab@example.com", "ab.@example.com", "a@-example.com", "a@example-.com", "a@exam_ple.com", "a@exam!ple.com", "a@@example.com", "<a>@example.com", "a@localhost", "a@example.com\n", "a b@example.com", "a".repeat(65) + "@example.com"]) {
      assert.ok(validateSchema(schema, { ...samples[schema], email }).some(e => e.field === "email"), email);
    }
  }
});

test("searches reject punctuation while exact stock codes keep their required format", () => {
  for (const [query, accepted] of [[{ search: "Rent 2026" }, true], [{ search: "Rent%" }, false], [{ q: "Tata" }, true], [{ q: "M&M.NS" }, true], [{ q: "Tata@" }, false]]) {
    let called = false;
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    commonFilters({ query }, res, () => { called = true; });
    assert.equal(called, accepted);
    if (!accepted) assert.equal(res.code, 400);
  }
});

test("verified instrument names can contain provider punctuation but manual names cannot", () => {
  const linked = { ...samples.investment, name: "Company & Co. (India)", market_provider: "yahoo", instrument_id: "M&M.NS", units: 1 };
  assert.deepEqual(validateSchema("investment", linked), []);
  assert.ok(validateSchema("investment", { ...linked, market_provider: null, instrument_id: null }).some(e => e.field === "name"));
  assert.ok(validateSchema("investment", { ...linked, instrument_id: "M&M@.NS" }).some(e => e.field === "instrument_id"));
});

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
