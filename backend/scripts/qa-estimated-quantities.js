// Real API/database checks on a disposable account; provider access is forbidden.
const assert = require("node:assert/strict");
const app = require("../server");
const { pool } = require("../config/db");
const Investment = require("../models/Investment");

async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const nativeFetch = global.fetch;
  let session, browser, remoteCalls = 0, acceptedQuotePrice = null;
  global.fetch = async url => {
    if (acceptedQuotePrice && String(url).startsWith("https://api.mfapi.in/mf/search?")) return { ok: true, json: async () => [{ schemeCode: 119063, schemeName: "Accepted QA Fund" }] };
    if (acceptedQuotePrice && String(url) === "https://api.mfapi.in/mf/119063/latest") return { ok: true, json: async () => ({ meta: { scheme_code: 119063, scheme_name: "Accepted QA Fund" }, data: [{ nav: String(acceptedQuotePrice), date: "15-10-2026" }] }) };
    remoteCalls++; throw new Error("Unexpected external request");
  };
  async function api(path, method = "GET", body, expected = 200) {
    const response = await nativeFetch(base + path, { method, headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return data;
  }
  try {
    session = await api("/auth/register", "POST", { name: "Estimate QA", email: `qa-estimate-${Date.now()}@example.invalid`, password: "ValidPass123!" }, 201);
    const metadata = { kind: "estimated", reference_price: 221.4115, reference_label: "Comparable fund NAV", reference_as_of: "2026-10-14", unit_label: "units", currency: "INR", note: "Estimated units only" };
    let row = (await api("/investments", "POST", { name: "Estimate QA Fund", type: "Mutual Funds / SIP", amount: 5000, units: 23.03403391, date: new Date().toISOString().slice(0, 10) }, 201)).investment;
    await pool.execute("UPDATE Investments SET current_value = ?, quantity_metadata = ? WHERE id = ? AND user_id = ?", [5100, JSON.stringify(metadata), row.id, session.user.id]);
    row = (await api("/investments")).investments[0];
    assert.deepEqual(row.quantity_metadata, metadata);
    const refreshed = await api("/investments/sync-prices", "POST", {});
    assert.equal(refreshed.updated_count, 0);
    assert.match(refreshed.skipped[0].reason, /Estimated units/);
    assert.equal(refreshed.portfolio.current_value, 5100);
    assert.equal(refreshed.portfolio.gain_percent, 2);
    const edited = (await api(`/investments/${row.id}`, "PUT", { notes: "Updated note" })).investment;
    for (const key of ["amount", "units", "purchase_price", "current_value"]) assert.equal(edited[key], row[key]);
    assert.deepEqual(edited.quantity_metadata, metadata);
    await api(`/investments/${row.id}`, "PUT", { market_provider: "mfapi", instrument_id: "119063" }, 400);
    console.log("PASS API + MySQL: estimate provenance, unchanged costs/ROI, ordinary edits, blocked unconfirmed link");

    if (process.env.PLAYWRIGHT_MODULE_PATH) {
      const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH);
      browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER_PATH });
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => {
        const url = new URL(route.request().url());
        return route.continue({ url: base + url.pathname.slice(4) + url.search });
      });
      await page.addInitScript(({ token, user }) => { localStorage.setItem("bp_token", token); localStorage.setItem("bp_user", JSON.stringify(user)); }, session);
      await page.goto("http://localhost:5173/investments");
      await page.getByText(/Estimated quantity:/).waitFor();
      await page.getByText(/Reference: Comparable fund NAV/).waitFor();
      await page.getByTitle("Edit investment", { exact: true }).click();
      const modal = page.getByRole("dialog");
      assert.equal(await modal.locator("#investment-units").inputValue(), "23.03403391");
      assert.ok(Number(await modal.locator("#investment-unit-price").inputValue()) > 0);
      assert.equal(await modal.getByRole("checkbox", { name: "I have entered my actual quantity and purchase price" }).isChecked(), false);
      await modal.getByRole("button", { name: "Choose verified stock or fund" }).waitFor();
      await modal.locator("#investment-notes").fill("Browser updated note");
      await modal.getByRole("button", { name: "Update Investment", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
      const saved = await Investment.findById(row.id, session.user.id);
      for (const key of ["amount", "units", "purchase_price", "current_value"]) assert.equal(saved[key], row[key]);
      assert.deepEqual(saved.quantity_metadata, metadata);
      await page.reload();
      await page.getByText(/Estimated quantity:/).waitFor();
      assert.deepEqual(errors, []);
      console.log("PASS browser: estimate labels/reference, editable persisted quantity, ordinary save/reload preserves ROI");
    }
    const confirmed = (await api(`/investments/${row.id}`, "PUT", { units: 20, purchase_price: 250, confirm_actual_quantity: true })).investment;
    assert.equal(confirmed.quantity_metadata, null);
    assert.equal(confirmed.units, 20);
    assert.equal(confirmed.amount, 5000);
    assert.equal(confirmed.current_value, 5100);
    assert.equal(remoteCalls, 0);
    console.log("PASS: confirmed actual details clear the estimate; no external provider requests during QA");
    const acceptedMetadata = { ...metadata, kind: "accepted", original_kind: "estimated", accepted_at: new Date().toISOString() };
    await pool.execute("UPDATE Investments SET quantity_metadata = ? WHERE id = ? AND user_id = ?", [JSON.stringify(acceptedMetadata), row.id, session.user.id]);
    if (browser) {
      const page = await browser.newPage();
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => {
        const url = new URL(route.request().url());
        return route.continue({ url: base + url.pathname.slice(4) + url.search });
      });
      await page.addInitScript(({ token, user }) => { localStorage.setItem("bp_token", token); localStorage.setItem("bp_user", JSON.stringify(user)); }, session);
      await page.goto("http://localhost:5173/investments");
      await page.getByText("Estimate QA Fund", { exact: true }).waitFor();
      assert.equal(await page.getByText(/Estimated quantity:|Reference: Comparable fund NAV/).count(), 0);
      await page.getByTitle("Edit investment", { exact: true }).click();
      const modal = page.getByRole("dialog");
      assert.equal(await modal.locator("#investment-units").inputValue(), "20");
      assert.equal(await modal.locator("#investment-unit-price").inputValue(), "250");
      assert.equal(await modal.getByRole("checkbox", { name: "I have entered my actual quantity and purchase price" }).count(), 0);
      await modal.getByRole("button", { name: "Select instrument for live pricing" }).waitFor();
      await modal.locator("#investment-notes").fill("Accepted baseline note");
      await modal.getByRole("button", { name: "Update Investment", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
      const saved = await Investment.findById(row.id, session.user.id);
      assert.equal(saved.quantity_metadata.kind, "accepted");
      assert.equal(saved.units, 20);
      assert.equal(saved.current_value, 5100);
      assert.deepEqual(errors, []);
      console.log("PASS browser: accepted units display normally, no estimate warning/confirmation, edit retains values");
      await page.getByRole("button", { name: "Update all live values & ROI", exact: true }).click();
      const feedback = page.getByRole("status", { name: "Live valuation result" });
      await feedback.getByText("Estimate QA Fund: Unchanged", { exact: true }).waitFor();
      assert.doesNotMatch(await feedback.innerText(), /Select a stock|confirm actual|Estimated units/);

      acceptedQuotePrice = 275;
      await page.getByTitle("Edit investment", { exact: true }).click();
      await modal.getByRole("button", { name: "Select instrument for live pricing" }).click();
      await modal.locator("#investment-instrument-search").fill("Accepted");
      const quoteLoaded = page.waitForResponse(response => response.url().includes("/instruments/quote?") && response.status() === 200);
      await modal.getByRole("list", { name: "Matching investments" }).getByRole("button").first().click();
      await quoteLoaded;
      assert.equal(await modal.locator("#investment-unit-price").inputValue(), "250");
      assert.equal(await modal.locator("#investment-units").inputValue(), "20");
      await modal.getByRole("button", { name: "Update Investment", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
      const linkedInBrowser = await Investment.findById(row.id, session.user.id);
      assert.equal(linkedInBrowser.units, 20);
      assert.equal(linkedInBrowser.purchase_price, 250);
      assert.equal(linkedInBrowser.amount, 5000);
      assert.equal(linkedInBrowser.current_value, 5500);
      await page.reload();
      await page.getByText("Accepted QA Fund", { exact: true }).waitFor();
      acceptedQuotePrice = 300;
      await page.getByRole("button", { name: "Update all live values & ROI", exact: true }).click();
      await feedback.getByText(/Accepted QA Fund:.*6,000.*ROI 20\.00%/).waitFor();
      assert.doesNotMatch(await feedback.innerText(), /unchanged/i);
      console.log("PASS browser: missing price displays only Unchanged; successful refresh displays new value and ROI instead");

      await page.getByTitle("Edit investment", { exact: true }).click();
      assert.equal(await modal.locator("#investment-units").inputValue(), "20");
      assert.equal(await modal.locator("#investment-unit-price").inputValue(), "250");
      assert.deepEqual(errors, []);
      console.log("PASS browser: linking and reopening preserve accepted quantity and cost while applying the latest quote");
    }
    acceptedQuotePrice = 275;
    const linked = (await api(`/investments/${row.id}`, "PUT", { market_provider: "mfapi", instrument_id: "119063", units: 20, purchase_price: 250, amount: 5000 })).investment;
    assert.equal(linked.units, 20);
    assert.equal(linked.amount, 5000);
    assert.equal(linked.purchase_price, 250);
    assert.equal(linked.current_value, 5500);
    assert.equal(linked.quantity_metadata.kind, "accepted");
    acceptedQuotePrice = 300;
    const live = await api("/investments/sync-prices", "POST", {});
    assert.equal(live.updated_count, 1);
    assert.equal(live.updated[0].new_value, 6000);
    assert.equal(live.updated[0].roi_percent, 20);
    const final = await Investment.findById(row.id, session.user.id);
    assert.equal(final.amount, 5000);
    assert.equal(final.purchase_price, 250);
    assert.equal(final.units, 20);
    assert.equal(remoteCalls, 0);
    console.log("PASS API + MySQL: accepted units drive future quote updates and ROI without re-confirmation; cost unchanged");
  } finally {
    if (browser) await browser.close();
    global.fetch = nativeFetch;
    if (session) await pool.execute("DELETE FROM Users WHERE id = ?", [session.user.id]);
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
