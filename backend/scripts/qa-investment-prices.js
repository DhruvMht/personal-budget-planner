// Real local MySQL + API + optional browser. Provider responses are controlled fixtures,
// so outages and recovery can be verified without depending on external availability.
const assert = require("node:assert/strict");
const app = require("../server");
const { pool } = require("../config/db");
const Investment = require("../models/Investment");
const market = require("../services/marketInstrumentService");
const { refreshHolding } = require("../services/investmentPriceRefresh");

async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const originalQuote = market.getQuote;
  const originalSearch = market.searchInstruments;
  market.searchInstruments = async () => [{ provider: "yahoo", instrument_id: "TCS.NS", name: "Exact older stock" }];
  let offline = false, stockPrice = 120, calls = 0, browser;
  const accounts = [];
  market.getQuote = async (provider, instrument_id) => {
    calls++;
    if (offline) throw Object.assign(new Error("Test provider unavailable"), { status: 503 });
    return { provider, instrument_id, price: provider === "yahoo" ? stockPrice : 100, as_of: new Date().toISOString(), source: "Controlled QA provider", currency: "INR" };
  };
  let session;
  async function api(path, method = "GET", body, status = 200, token = session?.token) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  }
  async function account() {
    const result = await api("/auth/register", "POST", { name: "Price QA", email: `qa-prices-${Date.now()}-${accounts.length}@example.invalid`, password: "ValidPass123!" }, 201);
    accounts.push(result.user.id); return result;
  }
  async function makeDue() {
    await pool.execute("UPDATE Investments SET price_metadata = JSON_SET(COALESCE(price_metadata, JSON_OBJECT()), '$.last_attempt_at', '2000-01-01T00:00:00.000Z') WHERE user_id = ?", [session.user.id]);
  }
  try {
    session = await account();
    const userId = session.user.id, date = new Date().toISOString().slice(0, 10);
    const stock = await Investment.create(userId, { name: "QA Stock", type: "Stocks / Equities", amount: 1000, date, market_provider: "yahoo", instrument_id: "TCS.NS", units: 10 });
    const fund = await Investment.create(userId, { name: "QA Fund", type: "Mutual Funds / SIP", amount: 200, date, market_provider: "mfapi", instrument_id: "120503", units: 2.5 });
    const manual = await Investment.create(userId, { name: "QA Manual", type: "Gold / SGB", amount: 300, date });
    const result = await api("/investments/sync-prices?automatic=true", "POST", {});
    assert.equal(result.updated_count, 2); assert.equal(calls, 2);
    const saved = await Investment.findById(stock.id, userId);
    assert.equal(saved.amount, 1000); assert.equal(saved.current_value, 1200);
    assert.equal(saved.price_metadata.price, 120); assert.ok(saved.price_metadata.as_of);
    assert.equal((await Investment.findById(fund.id, userId)).current_value, 250);
    assert.equal((await Investment.findById(manual.id, userId)).current_value, 300);
    assert.equal((await api("/investments/sync-prices?automatic=true", "POST", {})).attempted_count, 0);
    console.log("PASS API: automatic stock/NAV refresh, preserved cost, saved metadata, manual exclusion and refresh intervals");

    offline = true;
    await api(`/investments/${stock.id}/sync-price`, "POST", {}, 503);
    const afterFailure = (await api("/investments")).investments.find(item => item.id === stock.id);
    assert.equal(afterFailure.current_value, 1200); assert.equal(afterFailure.amount, 1000);
    assert.equal(afterFailure.price_status, "stale"); assert.match(afterFailure.price_metadata.error, /unavailable/);
    assert.equal(afterFailure.price_metadata.as_of, saved.price_metadata.as_of);
    assert.equal((await api("/investments/sync-prices?automatic=true", "POST", {})).attempted_count, 0);
    offline = false; stockPrice = 125;
    await api(`/investments/${stock.id}/sync-price`, "POST", {});
    assert.equal((await Investment.findById(stock.id, userId)).price_metadata.error, null);
    console.log("PASS API: outage retains value and source date, backs off, then recovers");

    const oldSnapshot = await Investment.findById(stock.id, userId);
    await pool.execute("UPDATE Investments SET units = 20 WHERE id = ? AND user_id = ?", [stock.id, userId]);
    await assert.rejects(refreshHolding(oldSnapshot), { status: 409 });
    assert.equal((await Investment.findById(stock.id, userId)).current_value, 1250);
    await pool.execute("UPDATE Investments SET units = 10 WHERE id = ? AND user_id = ?", [stock.id, userId]);
    const other = await account();
    await api(`/investments/${stock.id}/sync-price`, "POST", {}, 404, other.token);
    await api("/auth/profile", "PUT", { currency: "USD" });
    await api(`/investments/${stock.id}/sync-price`, "POST", {}, 422);
    await api("/auth/profile", "PUT", { currency: "INR" });
    console.log("PASS API: concurrent edits, account ownership and INR eligibility guards");

    if (!process.env.PLAYWRIGHT_MODULE_PATH) { console.log("Browser checks skipped: set PLAYWRIGHT_MODULE_PATH to enable."); return; }
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH);
    browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER_PATH });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(20_000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    let automaticRequests = 0;
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/sync-prices") && url.searchParams.get("automatic") === "true") automaticRequests++;
      await route.continue({ url: base + url.pathname.slice(4) + url.search });
    });
    await page.addInitScript(({ token, user }) => { localStorage.setItem("bp_token", token); localStorage.setItem("bp_user", JSON.stringify(user)); }, session);
    await page.clock.install();
    stockPrice = 130;
    const historical = await Investment.create(userId, { name: "Exact older stock", type: "Stocks / Equities", amount: 100, date: "2020-01-01", units: 2 });
    const missing = await Investment.create(userId, { name: "Missing quantity", type: "Stocks / Equities", amount: 100, date });
    const origin = process.env.QA_FRONTEND_URL || "http://localhost:5173";
    await page.goto(origin + "/investments");
    const update = page.getByRole("button", { name: "Update all live values & ROI", exact: true });
    const stockRow = page.getByRole("group", { name: "Investment QA Stock", exact: true });
    await stockRow.getByText(/250.00 \(25.00%\)/).waitFor();
    assert.equal(await update.count(), 1);
    assert.equal(await page.getByRole("button", { name: "Link for live ROI", exact: true }).count(), 0);
    assert.equal(await page.getByRole("switch").count(), 0);
    await update.click();
    await stockRow.getByText(/300.00 \(30.00%\)/).waitFor();
    const resultPanel = page.getByRole("status", { name: "Live valuation result" });
    await resultPanel.getByText(/Exact older stock:.*ROI 160.00%/).waitFor();
    await resultPanel.getByText(/Missing quantity: Quantity is missing/).waitFor();
    await resultPanel.getByText(/QA Manual: No supported public live price/).waitFor();
    await resultPanel.getByText(/Whole portfolio:.*includes unchanged valuations/).waitFor();
    const olderSaved = await Investment.findById(historical.id, userId);
    assert.equal(olderSaved.current_value, 260); assert.equal(olderSaved.instrument_id, "TCS.NS");
    assert.equal(olderSaved.amount, 100);
    assert.equal((await Investment.findById(missing.id, userId)).units, null);
    console.log("PASS browser/API: single button updates all months, resolves exact old entries, calculates ROI and lists unsupported/missing details");

    await page.getByLabel("Asset Class", { exact: true }).selectOption("Gold / SGB");
    await stockRow.waitFor({ state: "hidden" });
    stockPrice = 140;
    await update.click();
    await resultPanel.getByText(/QA Stock:.*ROI 40.00%/).waitFor();
    assert.equal((await Investment.findById(stock.id, userId)).current_value, 1400);
    assert.equal((await Investment.findById(historical.id, userId)).current_value, 280);
    console.log("PASS browser: filters do not limit the portfolio update; hidden holdings and older purchases update too");

    await page.reload(); await stockRow.waitFor();
    offline = true; await update.click();
    await stockRow.getByText(/Outdated — showing last saved valuation/).waitFor();
    await stockRow.getByText(/400.00 \(40.00%\)/).waitFor();
    await resultPanel.getByText(/No values or ROI were updated/).waitFor();
    assert.equal((await Investment.findById(stock.id, userId)).current_value, 1400);
    offline = false; stockPrice = 150; await update.click();
    await stockRow.getByText(/500.00 \(50.00%\)/).waitFor();
    await stockRow.getByText(/Outdated — showing last saved valuation/).waitFor({ state: "hidden" });
    await page.reload(); await stockRow.getByText(/500.00 \(50.00%\)/).waitFor();
    console.log("PASS browser: bulk outage preserves saved ROI, one-button retry recovers, and new values survive reload");

    await page.clock.runFor(121_000); assert.equal(automaticRequests, 0);
    await page.setViewportSize({ width: 390, height: 900 });
    await update.click(); await resultPanel.waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "mobile overflow");
    await page.goto(origin + "/settings"); await page.locator("main").waitFor();
    await page.clock.runFor(61_000); assert.equal(automaticRequests, 0);
    assert.deepEqual(errors, []);
    console.log("PASS browser: single visible update action on mobile, no background polling or page exceptions");
  } finally {
    if (browser) await browser.close();
    market.getQuote = originalQuote;
    market.searchInstruments = originalSearch;
    for (const id of accounts) await pool.execute("DELETE FROM Users WHERE id = ?", [id]);
    await new Promise(resolve => server.close(resolve)); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
