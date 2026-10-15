// Real API + MySQL, with controlled provider quotes and optional browser checks.
const assert = require("node:assert/strict");
const app = require("../server");
const { pool } = require("../config/db");
const Investment = require("../models/Investment");
const { SCHEMAS } = require("../validation/schemas");

async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const nativeFetch = global.fetch, users = [];
  let browser, session, marketPrice = 120, quoteOffline = false;
  global.fetch = async (url, options) => {
    const address = String(url);
    if (quoteOffline && (address.includes("/v8/finance/chart/") || address.includes("/mf/120503/latest"))) return { ok: false };
    if (address.startsWith("https://query1.finance.yahoo.com/")) return { ok: true, json: async () => address.includes("/search?")
      ? { quotes: [{ symbol: "TCS.NS", quoteType: "EQUITY", longname: "QA Stock" }] }
      : { chart: { result: [{ meta: { symbol: "TCS.NS", instrumentType: "EQUITY", currency: "INR", longName: "QA Stock", regularMarketPrice: marketPrice, regularMarketTime: Math.floor(Date.now() / 1000) } }] } } };
    if (address.startsWith("https://api.mfapi.in/")) return { ok: true, json: async () => address.includes("/search?")
      ? [{ schemeCode: 120503, schemeName: "QA Fund" }]
      : { meta: { scheme_code: 120503, scheme_name: "QA Fund" }, data: [{ nav: String(marketPrice), date: "15-10-2026" }] } };
    return nativeFetch(url, options);
  };
  async function api(path, method = "GET", body, expected = 200) {
    const response = await nativeFetch(base + path, { method, headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
  }
  async function account() {
    session = await api("/auth/register", "POST", { name: "Purchase QA", email: `qa-purchase-${Date.now()}-${users.length}@example.invalid`, password: "ValidPass123!" }, 201);
    users.push(session.user.id);
  }
  const date = new Date().toISOString().slice(0, 10);
  try {
    await account();
    for (const type of Investment.INVESTMENT_TYPES) {
      const instrument = type === "Stocks / Equities" ? { market_provider: "yahoo", instrument_id: "TCS.NS" }
        : type === "Mutual Funds / SIP" ? { market_provider: "mfapi", instrument_id: "120503" } : {};
      for (const input of [{ amount: 1000 }, { units: 10 }]) {
        let item = (await api("/investments", "POST", { name: "QA Purchase", type, date, purchase_price: 100, ...input, ...instrument }, 201)).investment;
        assert.equal(item.amount, 1000); assert.equal(item.units, 10); assert.equal(item.purchase_price, 100);
        item = (await api(`/investments/${item.id}`, "PUT", { amount: 1500 })).investment;
        assert.equal(item.units, 15); assert.equal(item.purchase_price, 100);
        item = (await api(`/investments/${item.id}`, "PUT", { units: 20 })).investment;
        assert.equal(item.amount, 2000); assert.equal(item.purchase_price, 100);
        const read = await Investment.findById(item.id, session.user.id);
        assert.equal(read.units, 20); assert.equal(read.amount, 2000); assert.equal(read.purchase_price, 100);
        const unchanged = (await api(`/investments/${item.id}`, "PUT", { notes: "Saved note" })).investment;
        assert.equal(unchanged.amount, 2000); assert.equal(unchanged.units, 20);
        await api(`/investments/${item.id}`, "PUT", { amount: 1000, units: 999, purchase_price: 100 }, 400);
      }
      console.log(`PASS API + database: both directions, edits and mismatched inputs for ${type}`);
    }
    const before = await Investment.findAllByUser(session.user.id);
    marketPrice = 150;
    const result = await api("/investments/sync-prices", "POST", {});
    assert.equal(result.updated.length, 4);
    for (const row of result.updated) {
      assert.equal(row.new_value, 3000); assert.equal(row.invested_amount, 2000); assert.equal(row.roi_percent, 50);
    }
    const after = await Investment.findAllByUser(session.user.id);
    for (const row of after) {
      const previous = before.find(item => item.id === row.id);
      for (const field of ["amount", "units", "purchase_price"]) assert.equal(row[field], previous[field]);
    }
    console.log("PASS ROI: refresh uses persisted quantity and cost, and does not overwrite purchase price");

    if (!process.env.PLAYWRIGHT_MODULE_PATH) return;
    await account();
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH);
    browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER_PATH });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(15000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      await route.continue({ url: base + url.pathname.slice(4) + url.search });
    });
    await page.addInitScript(({ token, user }) => { localStorage.setItem("bp_token", token); localStorage.setItem("bp_user", JSON.stringify(user)); }, session);
    await page.goto((process.env.QA_FRONTEND_URL || "http://localhost:5173") + "/investments");
    for (const [index, type] of Investment.INVESTMENT_TYPES.entries()) {
      await page.getByRole("button", { name: "Add Investment", exact: true }).first().click();
      const modal = page.getByRole("dialog");
      await modal.getByLabel("Asset Class / Option").selectOption(type);
      const search = modal.locator("#investment-instrument-search");
      const linked = ["Stocks / Equities", "Mutual Funds / SIP"].includes(type);
      quoteOffline = linked;
      await search.fill(linked ? "QA" : `Purchase QA ${index}`);
      if (linked) await modal.getByRole("list", { name: "Matching investments" }).getByRole("button").first().click();
      else await modal.getByRole("button", { name: /as a manual investment/ }).click();
      if (linked) await modal.getByRole("button", { name: "Retry price lookup" }).waitFor();
      assert.equal(await modal.getByRole("checkbox", { name: "Calculate using quantity and price" }).count(), 0);
      await modal.locator("#investment-unit-price").fill("100");
      await modal.getByLabel("Invested Amount", { exact: true }).fill("1000");
      await page.waitForFunction(() => document.querySelector("#investment-units")?.value === "10");
      if (linked) {
        quoteOffline = false;
        const retried = page.waitForResponse(r => r.url().includes("/instruments/quote?") && r.status() === 200);
        await modal.getByRole("button", { name: "Retry price lookup" }).click(); await retried;
        assert.equal(await modal.locator("#investment-unit-price").inputValue(), "100", "quote retry must preserve the entered historical price");
        assert.equal(await modal.locator("#investment-units").inputValue(), "10");
      }
      await modal.locator("#investment-units").fill("12");
      await page.waitForFunction(() => document.querySelector("#investment-amount")?.value === "1200.00");
      const savedResponse = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/investments" && r.status() === 201);
      await modal.getByRole("button", { name: "Save Investment", exact: true }).click();
      const item = (await (await savedResponse).json()).investment;
      assert.equal(item.units, 12); assert.equal(item.amount, 1200); assert.equal(item.purchase_price, 100);
      await modal.waitFor({ state: "hidden" });
      await page.reload();
      const row = page.getByRole("group", { name: `Investment ${item.name}`, exact: true });
      await row.getByTitle("Edit investment", { exact: true }).click();
      assert.equal(await modal.locator("#investment-unit-price").inputValue(), "100");
      assert.equal(await modal.locator("#investment-units").inputValue(), "12");
      await modal.locator("#investment-unit-price").fill("150");
      await page.waitForFunction(() => document.querySelector("#investment-units")?.value === "8");
      await modal.getByRole("button", { name: "Update Investment", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
      const stored = await Investment.findById(item.id, session.user.id);
      assert.equal(stored.amount, 1200); assert.equal(stored.units, 8); assert.equal(stored.purchase_price, 150);
      console.log(`PASS browser: automatic conversion, save, reload and purchase-price edit for ${type}`);
    }
    assert.deepEqual(errors, []);
    console.log("PASS browser: no page exceptions across all 8 asset types");
  } finally {
    if (browser) await browser.close(); global.fetch = nativeFetch;
    for (const id of users) await pool.execute("DELETE FROM Users WHERE id = ?", [id]);
    await new Promise(resolve => server.close(resolve)); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
