const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const app = require("../server");
const { pool } = require("../config/db");
const Investment = require("../models/Investment");
const { currentDate } = require("../utils/currentDate");

async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let session, browser;
  async function api(url, method = "GET", body, status = 200) {
    const response = await fetch(base + url, { method, headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  }
  const today = currentDate(), tomorrow = currentDate(new Date(Date.now() + 86400000));
  const yesterday = currentDate(new Date(Date.now() - 86400000));
  try {
    session = await api("/auth/register", "POST", { name: "Date Layout QA", email: `qa-date-layout-${Date.now()}@example.invalid`, password: "ValidPass123!" }, 201);
    for (const type of Investment.INVESTMENT_TYPES) {
      const body = { name: "Date QA", type, amount: 5000, date: tomorrow };
      const invalid = await api("/investments", "POST", body, 400);
      assert.ok(invalid.fieldErrors.some(error => error.field === "date"));
      const panel = await api("/validation/check", "POST", { schema: "investment", payload: body });
      assert.equal(panel.passed, false);
    }
    const first = (await api("/investments", "POST", { name: "Long Investment Record Name For Layout Verification", type: "Fixed Deposit / RD", notes: "Long note for checking investment record alignment ".repeat(4).trim(), amount: 5000, units: 10, purchase_price: 500, date: today }, 201)).investment;
    await api(`/investments/${first.id}`, "PUT", { date: tomorrow }, 400);
    assert.equal((await Investment.findById(first.id, session.user.id)).date, today);
    await api(`/investments/${first.id}`, "PUT", { date: yesterday });
    await api(`/investments/${first.id}`, "PUT", { date: today });
    const reminder = (await api("/calendar/reminders", "POST", { name: "Calendar Investment", amount: 5000, due_day: 1, type: "investment", is_recurring: true }, 201)).reminder;
    await api("/calendar/pay", "POST", { reminder_id: reminder.id, date: tomorrow }, 400);
    await api("/calendar/pay", "POST", { reminder_id: reminder.id, date: today });
    const second = (await Investment.findAllByUser(session.user.id)).find(row => row.reminder_id === reminder.id);
    assert.equal(second.units, null);
    assert.equal((await Investment.findAllByUser(session.user.id)).length, 2);
    console.log("PASS API + database: future dates rejected for every asset, edits, calendar and test panel; today/past allowed");

    const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH);
    browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER_PATH });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, timezoneId: "America/Los_Angeles" });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { const url = new URL(route.request().url()); return route.continue({ url: base + url.pathname.slice(4) + url.search }); });
    await page.addInitScript(({ token, user }) => { localStorage.setItem("bp_token", token); localStorage.setItem("bp_user", JSON.stringify(user)); }, session);
    await page.goto("http://localhost:5173/investments");
    const row = page.getByRole("group", { name: `Investment ${first.name}`, exact: true });
    const other = page.getByRole("group", { name: "Investment Calendar Investment", exact: true });
    await row.waitFor(); await other.waitFor();
    await row.getByText(today.split("-").reverse().join("/"), { exact: true }).waitFor();
    assert.equal(await other.getByText(/Quantity:/).count(), 0);
    const left = await row.getByText("Invested Amount", { exact: true }).boundingBox();
    const right = await other.getByText("Invested Amount", { exact: true }).boundingBox();
    assert.ok(Math.abs(left.x - right.x) <= 1, "Financial columns must align despite long notes");
    const folder = path.resolve(__dirname, "../../.local-backups"); fs.mkdirSync(folder, { recursive: true });
    await page.getByText("Investment Records", { exact: true }).scrollIntoViewIfNeeded();
    await row.locator("..").screenshot({ path: path.join(folder, "investment-records-desktop.png") });
    await row.getByTitle("Edit investment", { exact: true }).click();
    const modal = page.getByRole("dialog"), input = modal.locator("#investment-date");
    assert.equal(await input.getAttribute("max"), today);
    assert.equal(await input.inputValue(), today);
    await input.fill(tomorrow);
    await modal.getByRole("button", { name: "Update Investment", exact: true }).click();
    await modal.getByText("Incorrect value: Investment date cannot be later than today.", { exact: true }).waitFor();
    assert.equal((await Investment.findById(first.id, session.user.id)).date, today);
    await input.fill(today);
    await modal.getByRole("button", { name: "Update Investment", exact: true }).click();
    await modal.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Add Investment", exact: true }).first().click();
    assert.equal(await input.inputValue(), today);
    await modal.getByLabel("Asset Class / Option").selectOption("Fixed Deposit / RD");
    await modal.locator("#investment-instrument-search").fill("Date QA Deposit");
    await modal.getByRole("button", { name: /as a manual investment/ }).click();
    await modal.locator("#investment-unit-price").fill("500");
    await modal.getByLabel("Invested Amount", { exact: true }).fill("1000");
    await page.waitForFunction(() => document.querySelector("#investment-units")?.value === "2");
    await input.fill(tomorrow);
    await modal.getByRole("button", { name: "Save Investment", exact: true }).click();
    await modal.getByText("Incorrect value: Investment date cannot be later than today.", { exact: true }).waitFor();
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await row.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No overflow at ${width}`);
      for (const record of [row, other]) {
        const recordBox = await record.boundingBox();
        for (const title of ["Edit investment", "Delete investment"]) {
          const box = await record.getByTitle(title, { exact: true }).boundingBox();
          assert.ok(box.x >= recordBox.x && box.x + box.width <= recordBox.x + recordBox.width + 1);
        }
      }
    }
    await row.locator("..").screenshot({ path: path.join(folder, "investment-records-mobile.png") });
    assert.deepEqual(errors, []);
    console.log("PASS browser: date limits in add/edit with different browser timezone; aligned desktop columns, no mobile/tablet overflow or empty quantity label");
  } finally {
    if (browser) await browser.close();
    if (session) await pool.execute("DELETE FROM Users WHERE id = ?", [session.user.id]);
    await new Promise(resolve => server.close(resolve)); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
