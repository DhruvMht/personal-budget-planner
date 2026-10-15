const { test } = require("node:test");
const assert = require("node:assert/strict");
const { MANUAL_CATALOG, manualSuggestions } = require("../services/investmentCatalog");
const { searchInstruments } = require("../services/marketInstrumentService");
const { autoValuateInvestment } = require("../services/priceScraperService");

test("every manually valued asset class offers matching partial-name suggestions", async () => {
  for (const [type, query, expected] of [
    ["Fixed Deposit / RD", "fix", "Bank Fixed Deposit"],
    ["Gold / SGB", "sove", "Sovereign Gold Bond (SGB)"],
    ["PPF / EPF / NPS", "prov", "Public Provident Fund (PPF)"],
    ["Real Estate / REITs", "resi", "Residential Property"],
    ["Cryptocurrency", "bit", "Bitcoin (BTC)"],
    ["Other Investments", "corp", "Corporate Bonds"],
  ]) {
    const matches = await searchInstruments(type, query);
    assert.ok(matches.some(item => item.name === expected));
    assert.ok(matches.every(item => item.manual && !item.instrument_id));
  }
  assert.equal(Object.keys(MANUAL_CATALOG).length, 6);
});

test("saved names are filtered by the query and deduplicated against common suggestions", () => {
  const items = manualSuggestions("Cryptocurrency", "bit", ["Bitcoin (BTC)", "My Bitcoin Holding", "Unrelated"]);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Bitcoin (BTC)");
});

test("unknown labels do not produce an arbitrary suggestion", async () => {
  assert.deepEqual(await searchInstruments("Gold / SGB", "nonexistentfoobar"), []);
});

test("manual catalog selections never receive guessed market returns", async () => {
  for (const type of Object.keys(MANUAL_CATALOG)) {
    await assert.rejects(autoValuateInvestment({ type, name: "Example", amount: 1000, current_value: 1000 }), /manual valuation/);
  }
});
