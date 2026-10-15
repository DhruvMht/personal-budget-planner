// Requires Playwright and an installed browser. See docs/qa-report.md.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const assert = require("node:assert/strict");
const { pool } = require("../config/db");
const { currentMonth } = require("../validation/validate");

async function main() {
  const email = `qa-browser-${Date.now()}@example.invalid`;
  const origin = process.env.QA_FRONTEND_URL || "http://localhost:5173";
  const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(12000);
  const errors = [], serverErrors = [], failures = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.url().includes("/api/") && response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`); });
  page.on("dialog", dialog => dialog.accept());
  async function check(name, fn) {
    try { await fn(); console.log(`PASS ${name}`); }
    catch (error) { failures.push(name); console.log(`FAIL ${name}: ${error.message}`); }
  }
  async function go(route) { await page.goto(origin + route); await page.locator("main").waitFor(); }
  async function save(label) {
    await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  try {
    await page.goto(origin + "/goals"); await page.waitForURL("**/login");
    await page.goto(origin + "/register");
    await page.getByLabel("Full Name", { exact: true }).fill("Browser QA");
    await page.getByLabel("Email Address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("ValidPass123!");
    await page.getByLabel("Confirm Password", { exact: true }).fill("Mismatch123!");
    await page.getByRole("button", { name: "Create Account", exact: true }).click();
    await page.getByText("Passwords do not match", { exact: true }).waitFor();
    await page.getByLabel("Confirm Password", { exact: true }).fill("ValidPass123!");
    await page.getByRole("button", { name: "Create Account", exact: true }).click();
    await page.waitForURL(origin + "/");
    console.log("PASS registration, password mismatch and protected routes");
    await check("income validation, create, edit and persistence", async () => {
      await go("/income"); await page.getByRole("button", { name: "Add Income", exact: true }).click();
      let modal = page.getByRole("dialog");
      await modal.getByLabel("Amount", { exact: true }).fill("-1");
      await modal.getByRole("button", { name: "Save Income", exact: true }).click();
      await modal.getByText("Amount must be greater than zero", { exact: true }).waitFor();
      await modal.getByLabel("Amount", { exact: true }).fill("1000");
      await modal.getByLabel("Period Month").fill("9999-01");
      await modal.getByRole("button", { name: "Save Income", exact: true }).click();
      await modal.getByText(/Salary month cannot be later/).waitFor();
      await modal.getByLabel("Period Month").fill(currentMonth()); await save("Save Income");
      await page.getByTitle("Edit income", { exact: true }).click();
      await page.getByRole("dialog").getByLabel("Amount", { exact: true }).fill("1200"); await save("Update Income");
      await page.reload(); await page.getByRole("cell", { name: /1,200/ }).waitFor();
    });
    await check("expense create, filtering and persistence", async () => {
      await go("/expenses"); await page.getByRole("button", { name: "Add Expense", exact: true }).click();
      const modal = page.getByRole("dialog"); await modal.getByLabel("Category (Variable Spending Only)").selectOption({ label: "Food" });
      await modal.getByLabel("Amount", { exact: true }).fill("50"); await modal.getByLabel("Description / Merchant").fill("Browser groceries"); await save("Save Expense");
      await page.getByLabel("Search", { exact: true }).fill("no-matching-expense"); await page.getByText("No expenses found", { exact: true }).waitFor();
      await page.getByLabel("Search", { exact: true }).fill("Browser groceries"); await page.getByText("Browser groceries", { exact: true }).waitFor();
    });
    await check("goal create, contribution and over-contribution rejection", async () => {
      await go("/goals"); await page.getByRole("button", { name: "Add Goal", exact: true }).click();
      const modal = page.getByRole("dialog"); await modal.getByLabel("Goal Name").fill("Browser goal"); await modal.getByLabel("Target Amount", { exact: true }).fill("100"); await save("Save Goal");
      await page.getByRole("button", { name: "Add savings", exact: true }).click();
      await page.getByRole("dialog").getByLabel("Contribution Amount").fill("101");
      await page.getByRole("dialog").getByRole("button", { name: "Add Contribution", exact: true }).click();
      await page.getByRole("dialog").getByText(/exceeds|exceed/).waitFor();
      await page.getByRole("dialog").getByLabel("Contribution Amount").fill("25"); await save("Add Contribution");
    });
    await check("investment manual search, bidirectional calculation and save", async () => {
      await go("/investments"); await page.getByRole("button", { name: "Add Investment", exact: true }).first().click();
      const modal = page.getByRole("dialog"); await modal.getByLabel("Asset Class / Option").selectOption("Gold / SGB");
      await modal.getByLabel("Search Gold / SGB", { exact: true }).fill("Browser gold");
      await modal.getByRole("button", { name: /Use .* as a manual investment/ }).click();
      await modal.getByRole("checkbox", { name: "Calculate using quantity and price" }).check();
      await modal.getByLabel("Price per unit used for calculation").fill("100");
      await modal.getByLabel("Number of units", { exact: true }).fill("2");
      await page.waitForFunction(() => document.querySelector("#investment-amount")?.value === "200.00");
      await modal.getByLabel("Invested Amount", { exact: true }).fill("300");
      await page.waitForFunction(() => document.querySelector("#investment-units")?.value === "3");
      await save("Save Investment"); await page.getByText("Browser gold", { exact: true }).waitFor();
      await page.getByTitle("Edit investment", { exact: true }).click();
      assert.equal(await page.getByRole("dialog").getByLabel("Invested Amount", { exact: true }).inputValue(), "300");
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    });
    await check("budget edit and fixed commitment payment", async () => {
      await go("/budgets"); await page.getByTitle("Edit limit & priority", { exact: true }).first().click();
      await page.getByRole("dialog").getByLabel("Monthly Limit", { exact: true }).fill("100"); await save("Save Changes");
      await go("/fixed-commitments"); await page.getByTitle("Edit monthly commitment limit", { exact: true }).first().click();
      await page.getByRole("dialog").getByLabel("Monthly Limit Amount").fill("100"); await save("Save Limit");
      await page.getByRole("button", { name: "Record Payment", exact: true }).first().click();
      await page.getByRole("dialog").getByLabel("Payment Amount").fill("25"); await save("Confirm Payment");
      await page.getByTitle("Delete transaction", { exact: true }).waitFor();
    });
    await check("calendar reminder create and quick payment", async () => {
      await go("/calendar"); await page.getByRole("button", { name: "+ Add Bill Reminder", exact: true }).click();
      const modal = page.getByRole("dialog"); await modal.getByLabel("Bill / Commitment Name").fill("Browser reminder");
      await modal.getByLabel("Amount", { exact: true }).fill("10"); await modal.getByLabel("Due Day of Month (1 - 31)").fill(String(new Date().getDate()));
      await modal.getByLabel("Linked Category").selectOption({ label: "Internet (fixed)" }); await save("Save Reminder");
      await page.getByRole("button", { name: "Mark Paid", exact: true }).first().click(); await save("Confirm Payment");
      await page.getByRole("button", { name: "Mark Paid", exact: true }).waitFor({ state: "hidden" });
    });
    await check("settings persistence, dark mode and validation panel", async () => {
      await go("/settings"); await page.getByLabel("Full Name", { exact: true }).fill("Browser QA Updated");
      await page.getByLabel("Interface Theme").selectOption("dark"); await page.getByRole("button", { name: "Save Settings", exact: true }).click();
      await page.getByText("Your settings have been saved successfully.", { exact: true }).waitFor(); await page.reload();
      await page.waitForFunction(() => Array.from(document.querySelectorAll("input")).some(input => input.value === "Browser QA Updated"));
      assert.equal(await page.getByLabel("Full Name", { exact: true }).inputValue(), "Browser QA Updated");
      assert.ok(await page.locator("html").evaluate(node => node.classList.contains("dark")));
      const panel = page.getByRole("region", { name: "Validation Test Panel" });
      assert.equal(await panel.getByRole("checkbox").count(), 0);
      await panel.getByLabel("Invested amount *", { exact: true }).fill("-100"); await panel.getByRole("button", { name: "Check input", exact: true }).click(); await panel.getByText("Test FAIL", { exact: true }).waitFor();
      await panel.getByLabel("Invested amount *", { exact: true }).fill("100"); await panel.getByRole("button", { name: "Check input", exact: true }).click(); await panel.getByText("Test PASS", { exact: true }).waitFor();
      await panel.getByRole("button", { name: /Run all \d+ examples/ }).click(); await panel.getByRole("heading", { name: /86 checked/ }).waitFor();
    });
    await check("dashboard tabs, refresh and shortcut links", async () => {
      await go("/");
      await page.getByRole("button", { name: /^Alerts/ }).click();
      assert.equal(await page.getByText("Recent Activity Stream", { exact: true }).count(), 0);
      await page.getByRole("button", { name: /^Activity \(/ }).click(); await page.getByText("Recent Activity Stream", { exact: true }).waitFor();
      await page.getByRole("button", { name: /^All \(/ }).click();
      const refreshed = page.waitForResponse(r => r.url().includes("/reports/summary") && r.status() === 200);
      await page.getByTitle("Refresh data", { exact: true }).click(); await refreshed;
      for (const route of ["/income", "/expenses", "/fixed-commitments", "/investments", "/goals"]) {
        await go("/"); await page.locator(`main a[href="${route}"]`).first().click(); await page.waitForURL(origin + route);
      }
    });
    await check("expense and budget tabs, reset and apply buttons", async () => {
      await go("/expenses");
      for (const name of [/^Fixed Commitments \(/, /^Variable Spending \(/, /^All \(/]) {
        const tab = page.getByRole("button", { name }); await tab.click(); assert.ok((await tab.getAttribute("class")).includes("bg-white"));
      }
      await page.getByLabel("Search", { exact: true }).fill("missing"); await page.getByRole("button", { name: "Reset", exact: true }).click(); assert.equal(await page.getByLabel("Search", { exact: true }).inputValue(), "");
      await go("/budgets");
      for (const name of [/^Fixed Commitments \(/, /^Variable Expenses \(/, /^Investments \(/, /^All Allocations \(/]) {
        const tab = page.getByRole("button", { name }); await tab.click(); assert.ok((await tab.getAttribute("class")).includes("border-brand-600"));
      }
      const applied = page.waitForResponse(r => r.url().includes("/budgets/apply-recommendation") && r.status() === 200);
      await page.getByRole("button", { name: "Apply Recommendations", exact: true }).click(); await applied;
      await go("/fixed-commitments");
      const algorithm = page.waitForResponse(r => r.url().includes("/budgets/apply-recommendation") && r.status() === 200);
      await page.getByRole("button", { name: "Apply Algorithmic Limits", exact: true }).click(); await algorithm;
      await page.getByRole("button", { name: "New Commitment", exact: true }).click();
      await page.getByRole("dialog").getByLabel("Commitment Name").fill("Button audit commitment"); await save("Add Commitment");
    });
    await check("calendar navigation, edit/delete, modal cancel and close", async () => {
      await go("/calendar"); const monthInput = page.locator('main input[type="month"]'); const original = await monthInput.inputValue();
      await page.getByTitle("Previous Month", { exact: true }).click(); assert.notEqual(await monthInput.inputValue(), original);
      await page.getByTitle("Next Month", { exact: true }).click(); assert.equal(await monthInput.inputValue(), original);
      await page.getByRole("button", { name: "Today", exact: true }).click();
      await page.getByTitle("Edit reminder", { exact: true }).first().click();
      await page.getByRole("dialog").getByLabel("Bill / Commitment Name").fill("Edited browser reminder"); await save("Update Reminder");
      await page.getByTitle("Delete reminder", { exact: true }).first().click(); await page.getByTitle("Delete reminder", { exact: true }).waitFor({ state: "hidden" });
      for (const action of ["Cancel", "Close modal", "Escape"]) {
        await page.getByRole("button", { name: "+ Add Bill Reminder", exact: true }).click();
        if (action === "Escape") await page.keyboard.press("Escape");
        else await page.getByRole("dialog").getByRole("button", { name: action, exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
      }
    });
    await check("report controls and investment filters hide irrelevant refresh actions", async () => {
      await go("/reports");
      const trend = page.waitForResponse(r => r.url().includes("/reports/monthly?months=12") && r.status() === 200);
      await page.getByLabel("Report range", { exact: true }).selectOption("12"); await trend;
      const report = page.waitForResponse(r => r.url().includes("/reports/summary?month=2020-01") && r.status() === 200);
      await page.getByLabel("Report month", { exact: true }).fill("2020-01"); await report;
      await go("/investments"); await page.getByLabel("Asset Class", { exact: true }).selectOption("Gold / SGB");
      await page.getByLabel("Search", { exact: true }).fill("no-match"); await page.getByRole("button", { name: "Reset Filters", exact: true }).click();
      assert.equal(await page.getByLabel("Search", { exact: true }).inputValue(), "");
      await page.getByText("Browser gold", { exact: true }).waitFor();
      assert.ok(await page.getByTitle("Update every investment in your portfolio using the latest available prices", { exact: true }).isVisible());
      assert.equal(await page.getByTitle("Update every investment in your portfolio using the latest available prices", { exact: true }).isDisabled(), false);
      assert.equal(await page.getByTitle("Refresh using the latest available market price", { exact: true }).count(), 0);
    });
    if (process.env.QA_LIVE_MARKET === "1") await check("live stock selection, latest-price calculation and portfolio refresh", async () => {
      await go("/investments"); await page.getByRole("button", { name: "Add Investment", exact: true }).first().click();
      const modal = page.getByRole("dialog"); await modal.getByLabel("Asset Class / Option").selectOption("Stocks / Equities");
      await modal.getByLabel("Search Indian stocks (NSE / BSE)").fill("TCS");
      await modal.getByRole("list", { name: "Matching investments" }).getByRole("button").filter({ hasText: "TCS.NS" }).first().click();
      await modal.getByRole("button", { name: "Use latest price", exact: true }).click();
      await modal.getByLabel("Number of shares", { exact: true }).fill("2");
      await page.waitForFunction(() => Number(document.querySelector("#investment-amount")?.value) > 0);
      await save("Save Investment");
      const bulk = page.waitForResponse(r => r.url().includes("/investments/sync-prices") && r.status() === 200);
      await page.getByTitle("Update every investment in your portfolio using the latest available prices", { exact: true }).click(); await bulk;
      await page.getByRole("button", { name: "✕", exact: true }).click();
      await page.getByLabel("Asset Class", { exact: true }).selectOption("Stocks / Equities");
      await page.getByText("Browser gold", { exact: true }).waitFor({ state: "hidden" });
      await page.getByTitle("Delete investment", { exact: true }).click(); await page.getByTitle("Delete investment", { exact: true }).waitFor({ state: "hidden" });
    });
    await check("theme toggle persists and mobile navigation links work", async () => {
      await go("/settings");
      const before = await page.locator("html").evaluate(n => n.classList.contains("dark"));
      const changed = page.waitForResponse(r => r.url().includes("/auth/profile") && r.request().method() === "PUT" && r.status() === 200);
      await page.getByRole("button", { name: "Toggle theme", exact: true }).click(); await changed; await page.reload(); await page.getByLabel("Full Name", { exact: true }).waitFor();
      await page.waitForFunction(wasDark => document.documentElement.classList.contains("dark") !== wasDark, before);
      for (const wasDark of [!before, before]) {
        await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
        await page.waitForFunction(value => document.documentElement.classList.contains("dark") !== value, wasDark);
      }
      await page.setViewportSize({ width: 390, height: 900 });
      for (const [name, route] of [["Income", "/income"], ["Expenses", "/expenses"], ["Fixed Commitments", "/fixed-commitments"], ["Budgets", "/budgets"], ["Bill Calendar", "/calendar"], ["Investments", "/investments"], ["Goals", "/goals"], ["Reports", "/reports"], ["Settings", "/settings"], ["Dashboard", "/"]]) {
        await page.getByRole("button", { name: "Toggle navigation", exact: true }).click(); await page.locator("aside").getByRole("link", { name, exact: true }).click(); await page.waitForURL(origin + route);
        assert.equal(await page.getByRole("button", { name: "Toggle navigation", exact: true }).getAttribute("aria-expanded"), "false");
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await check("category add/delete and restore defaults", async () => {
      await go("/expenses"); await page.getByRole("button", { name: "Categories", exact: true }).click();
      const modal = page.getByRole("dialog"); await modal.getByLabel("New Variable Category Name").fill("Audit category");
      await modal.getByRole("button", { name: "Add", exact: true }).click(); await modal.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Categories", exact: true }).click(); await modal.getByText("Audit category", { exact: true }).waitFor();
      await modal.getByRole("listitem").filter({ hasText: "Audit category" }).getByTitle("Delete category").click();
      await modal.getByText("Audit category", { exact: true }).waitFor({ state: "hidden" });
      await modal.getByRole("button", { name: "Done", exact: true }).click();
      await go("/settings"); await page.getByRole("button", { name: "Restore Categories", exact: true }).click();
      await page.getByText(/Restored \d+ missing default categories/).waitFor();
    });
    await check("expense, investment and goal edits plus delete actions", async () => {
      await go("/expenses"); await page.getByRole("button", { name: /^Fixed Commitments \(/ }).click();
      await page.getByTitle("Edit expense", { exact: true }).first().click();
      const fixed = page.getByRole("dialog");
      assert.ok(await fixed.getByLabel("Fixed Commitment", { exact: true }).isDisabled());
      await fixed.getByLabel("Amount", { exact: true }).fill("12");
      await fixed.getByLabel("Description / Merchant").fill("Edited fixed payment"); await save("Update Expense");
      await page.getByText("Edited fixed payment", { exact: true }).waitFor();
      await go("/expenses"); await page.getByLabel("Search", { exact: true }).fill("Browser groceries");
      await page.waitForFunction(() => document.querySelectorAll('[title="Edit expense"]').length === 1);
      await page.getByTitle("Edit expense", { exact: true }).click();
      await page.getByRole("dialog").getByLabel("Description / Merchant").fill("Edited groceries"); await save("Update Expense");
      await page.getByLabel("Search", { exact: true }).fill("Edited groceries"); await page.getByText("Edited groceries", { exact: true }).waitFor(); await page.getByTitle("Delete expense", { exact: true }).click();
      await page.getByText("Edited groceries", { exact: true }).waitFor({ state: "hidden" });
      await go("/investments"); await page.getByTitle("Edit investment", { exact: true }).click();
      await page.getByRole("dialog").getByLabel("Invested Amount", { exact: true }).fill("400"); await save("Update Investment");
      await page.getByTitle("Edit investment", { exact: true }).click();
      assert.equal(await page.getByRole("dialog").getByLabel("Invested Amount", { exact: true }).inputValue(), "400");
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByTitle("Delete investment", { exact: true }).click(); await page.getByText("Browser gold", { exact: true }).waitFor({ state: "hidden" });
      await go("/goals"); await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByRole("dialog").getByLabel("Goal Name", { exact: true }).fill("Edited goal"); await save("Update Goal");
      await page.getByRole("heading", { name: "Edited goal", exact: true }).waitFor(); await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByRole("heading", { name: "Edited goal", exact: true }).waitFor({ state: "hidden" });
      await go("/income"); await page.getByTitle("Delete income", { exact: true }).click(); await page.getByTitle("Delete income", { exact: true }).waitFor({ state: "hidden" });
      await go("/fixed-commitments");
      while (await page.getByTitle("Delete transaction", { exact: true }).count()) {
        const deleted = page.waitForResponse(r => r.request().method() === "DELETE" && r.url().includes("/expenses/") && r.status() === 200);
        await page.getByTitle("Delete transaction", { exact: true }).first().click(); await deleted;
        await page.waitForTimeout(200);
      }
    });
    await check("all pages render on desktop and mobile without horizontal page overflow", async () => {
      const overflows = [];
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of ["/", "/income", "/expenses", "/fixed-commitments", "/budgets", "/calendar", "/investments", "/goals", "/reports", "/settings"]) {
          await go(route); await page.waitForTimeout(250);
          assert.ok(await page.locator("main h1").count(), route);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (overflow > 1) console.log("Overflow elements", await page.locator("main *").evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 6).map(n => ({ tag: n.tagName, classes: n.className, text: n.textContent.slice(0, 60) }))));
          if (overflow > 1) overflows.push(`${route} at ${width}px overflows by ${overflow}px`);
        }
      }
      assert.deepEqual(overflows, []);
    });
    await check("temporary server outage preserves session and offers retry", async () => {
      await page.route("**/api/auth/profile", route => route.abort());
      await page.goto(origin + "/settings"); await page.getByRole("heading", { name: "Unable to connect to the server", exact: true }).waitFor();
      assert.ok(await page.evaluate(() => localStorage.getItem("bp_token")));
      await page.unroute("**/api/auth/profile"); await page.getByRole("button", { name: "Retry connection", exact: true }).click(); await page.locator("main").waitFor();
    });
    await check("logout, invalid login and successful login", async () => {
      await page.setViewportSize({ width: 1440, height: 1000 }); await go("/settings");
      await page.getByRole("button", { name: "Logout", exact: true }).click(); await page.waitForURL("**/login");
      await page.getByLabel("Email Address", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill("WrongPass!");
      await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.getByText("Invalid email or password", { exact: true }).waitFor();
      await page.getByLabel("Password", { exact: true }).fill("ValidPass123!"); await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.waitForURL(origin + "/settings");
    });
    assert.deepEqual(errors, [], "browser exceptions"); assert.deepEqual(serverErrors, [], "server errors");
    if (failures.length) process.exitCode = 1;
    console.log(`Browser groups failed: ${failures.length}; page exceptions: ${errors.length}; HTTP 5xx: ${serverErrors.length}`);
  } finally {
    await browser.close(); await pool.execute("DELETE FROM Users WHERE email = ?", [email]); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
