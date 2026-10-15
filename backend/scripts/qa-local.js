// Uses disposable accounts against the configured local database; deletes them on exit.
const assert = require("node:assert/strict");
const app = require("../server");
const { pool } = require("../config/db");
const { currentMonth } = require("../validation/validate");
const { allocateBudget } = require("../utils/budgetCalculator");
const { suggestContributions } = require("../utils/goalCalculator");
const { examples } = require("../validation/examples");

async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const users = [], results = [];
  const month = currentMonth(), date = `${month}-01`;
  async function api(path, method = "GET", body, session, status = 200) {
    const response = await fetch(base + path, { method, headers: {
      "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${data.message || response.status}`);
    return data;
  }
  async function check(name, fn) {
    try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
  }
  async function account(label) {
    const email = `qa-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.invalid`;
    const session = await api("/auth/register", "POST", { name: `QA ${label}`, email, password: "ValidPass123!" }, null, 201);
    users.push(session.user.id); return { ...session, email };
  }
  try {
    const a = await account("main"), b = await account("isolation"), c = await account("edge");
    const categories = (await api("/categories", "GET", undefined, a)).categories;
    const foreignCategories = (await api("/categories", "GET", undefined, b)).categories;
    const category = categories.find(item => item.name === "Food");
    await check("registration defaults, no password disclosure and authentication", async () => {
      assert.equal(categories.length, 10); assert.equal(a.user.password, undefined);
      await api("/income", "GET", undefined, null, 401);
      await api("/auth/login", "POST", { email: a.email, password: "wrong" }, null, 401);
      await api("/auth/login", "POST", { email: a.email.toUpperCase(), password: "ValidPass123!" });
      await api("/auth/register", "POST", { name: "Duplicate", email: a.email, password: "ValidPass123!" }, null, 409);
    });
    await check("profile normalization and password change", async () => {
      await api("/auth/profile", "PUT", { email: ` ${a.email.toUpperCase()} `, salary_date: 31, theme: "dark" }, a);
      await api("/auth/profile", "PUT", { password: "ChangedPass123!" }, a);
      await api("/auth/login", "POST", { email: a.email, password: "ValidPass123!" }, null, 401);
      await api("/auth/login", "POST", { email: a.email, password: "ChangedPass123!" });
      await api("/auth/profile", "PUT", { email: b.email }, a, 409);
      await api("/auth/profile", "PUT", { salary_date: 32 }, a, 400);
    });
    await check("empty-state endpoints", async () => {
      for (const path of ["/income", "/expenses", "/budgets", "/goals", "/calendar", "/investments", "/investments/summary", "/reports/summary", "/reports/monthly", "/reports/notifications", "/validation/catalog"]) {
        await api(path, "GET", undefined, b);
      }
    });
    const income = (await api("/income", "POST", { source: "Salary", amount: 1000, month }, a, 201)).income;
    const expense = (await api("/expenses", "POST", { category_id: category.id, amount: 100, date, description: "QA groceries" }, a, 201)).expense;
    const investment = (await api("/investments", "POST", { name: "QA deposit", type: "Fixed Deposit / RD", amount: 200, date }, a, 201)).investment;
    const budget = (await api("/budgets", "POST", { category_id: category.id, monthly_limit: 50, priority: "High" }, a, 201)).budget;
    const goal = (await api("/goals", "POST", { goal_name: "QA saving", target_amount: 100, saved_amount: 0, priority: "Medium" }, a, 201)).goal;
    await check("income, expense and investment edits preserve omitted fields", async () => {
      assert.equal((await api(`/income/${income.id}`, "PUT", { amount: 1100 }, a)).income.source, "Salary");
      assert.equal((await api(`/expenses/${expense.id}`, "PUT", { description: "edited" }, a)).expense.date, date);
      assert.equal((await api(`/investments/${investment.id}`, "PUT", { notes: "edited" }, a)).investment.month, month);
      await api(`/budgets/${budget.id}`, "PUT", { priority: "Very High" }, a);
      await api(`/goals/${goal.id}`, "PUT", { goal_name: "Renamed" }, a);
    });
    await check("monthly totals, dashboard and budget alerts reconcile", async () => {
      const report = await api(`/reports/summary?month=${month}`, "GET", undefined, a);
      assert.equal(report.totals.income, 1100); assert.equal(report.totals.expenses, 100);
      assert.equal(report.totals.investments, 200); assert.equal(report.totals.net_cash_added, 800);
      assert.equal(report.totals.cumulative_savings, 1000);
      assert.ok(report.notifications.some(n => n.type === "budget_exceeded"));
      const plan = await api(`/budgets?month=${month}`, "GET", undefined, a);
      assert.equal(plan.summary.net_surplus, 800);
    });
    await check("search, category and month filters", async () => {
      assert.equal((await api(`/expenses?month=${month}&category_id=${category.id}&search=edited`, "GET", undefined, a)).expenses.length, 1);
      assert.equal((await api("/expenses?search=does-not-exist", "GET", undefined, a)).expenses.length, 0);
      assert.equal((await api("/investments?search=QA", "GET", undefined, a)).investments.length, 1);
      for (const route of ["/income?month=2026-13", "/reports/summary?month=invalid", "/expenses?category_id=-1", "/reports/monthly?limit=abc"]) await api(route, "GET", undefined, a, 400);
    });
    await check("cross-account update/delete isolation", async () => {
      for (const [route, id] of [["income", income.id], ["expenses", expense.id], ["investments", investment.id], ["budgets", budget.id], ["goals", goal.id]]) {
        await api(`/${route}/${id}`, "PUT", {}, b, 404);
        await api(`/${route}/${id}`, "DELETE", undefined, b, 404);
      }
      await api("/expenses", "POST", { category_id: foreignCategories[0].id, amount: 1, date }, a, 400);
      await api("/budgets", "POST", { category_id: foreignCategories[0].id, monthly_limit: 1, priority: "Low" }, a, 400);
    });
    await check("concurrent goal contributions cannot exceed target", async () => {
      const responses = await Promise.all([1, 2].map(() => fetch(base + `/goals/${goal.id}/contribute`, { method: "POST", headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: 60 }) })));
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]);
      await api(`/goals/${goal.id}`, "PUT", { target_amount: 50 }, a, 400);
    });
    await check("investment conversion, manual search and safe sync", async () => {
      const conversion = await api("/investments/calculate", "POST", { field: "units", value: 2, price: 100 }, a);
      assert.equal(Number(conversion.amount), 200);
      const search = await api("/investments/instruments?type=Gold%20%2F%20SGB&q=gold", "GET", undefined, a);
      assert.ok(search.results.length > 0);
      assert.equal((await api("/investments/sync-prices", "POST", {}, a)).updated_count, 0);
    });
    await check("zero investment valuation remains zero", async () => {
      await api(`/investments/${investment.id}`, "PUT", { current_value: 0 }, a);
      assert.equal((await api("/investments", "GET", undefined, a)).total_current_value, 0);
    });
    await check("category create, rename, duplicate rejection, delete and restore", async () => {
      const added = (await api("/categories", "POST", { name: "QA category", type: "variable" }, a, 201)).category;
      await api(`/categories/${added.id}`, "PUT", { name: "Food" }, a, 409);
      await api(`/categories/${added.id}`, "PUT", { name: "QA renamed" }, a);
      await api(`/categories/${added.id}`, "DELETE", undefined, a);
      assert.equal((await api("/categories/restore-defaults", "POST", {}, a)).added, 0);
    });
    const reminder = (await api("/calendar/reminders", "POST", { name: "QA bill", amount: 100, due_day: 31, type: "fixed", category_id: category.id }, a, 201)).reminder;
    await check("reminder CRUD, ownership and day clamping", async () => {
      await api(`/calendar/reminders/${reminder.id}`, "PUT", { name: "QA bill edited" }, a);
      await api(`/calendar/reminders/${reminder.id}`, "PUT", {}, b, 404);
      await api(`/calendar/reminders/${reminder.id}`, "DELETE", undefined, b, 404);
      const cal = await api("/calendar?month=2027-02", "GET", undefined, a);
      assert.equal(cal.events.find(r => r.id === reminder.id).due_day, 28);
    });
    await check("calendar income payment creates income, obeys salary date rule and marks paid", async () => {
      const item = (await api("/calendar/reminders", "POST", { name: "Salary", amount: 250, due_day: 1, type: "income" }, c, 201)).reminder;
      await api("/calendar/pay", "POST", { reminder_id: item.id, date: "9999-01-01" }, c, 400);
      const paid = await api("/calendar/pay", "POST", { reminder_id: item.id, date }, c);
      assert.ok(paid.income); assert.equal((await api("/expenses", "GET", undefined, c)).expenses.length, 0);
      assert.equal((await api(`/calendar?month=${month}`, "GET", undefined, c)).events.find(r => r.id === item.id).status, "paid");
    });
    await check("calendar small payment cannot pay multiple bills", async () => {
      const cat = (await api("/categories", "POST", { name: "QA shared bills", type: "fixed" }, c, 201)).category;
      const items = [];
      for (const name of ["First bill", "Second bill"]) items.push((await api("/calendar/reminders", "POST", { name, amount: 100, due_day: 1, type: "fixed", category_id: cat.id }, c, 201)).reminder);
      await api("/calendar/pay", "POST", { reminder_id: items[0].id, amount: 1, date }, c);
      const cal = await api(`/calendar?month=${month}`, "GET", undefined, c);
      assert.ok(cal.events.filter(r => items.some(i => i.id === r.id)).every(r => r.status !== "paid"));
      const rest = await api("/calendar/pay", "POST", { reminder_id: items[0].id, amount: 99, date }, c);
      await api("/calendar/pay", "POST", { reminder_id: items[0].id, amount: 100, date }, c, 409);
      await api(`/expenses/${rest.expense.id}`, "DELETE", undefined, c);
      assert.notEqual((await api(`/calendar?month=${month}`, "GET", undefined, c)).events.find(r => r.id === items[0].id).status, "paid");
    });
    await check("calendar investment payments, concurrent duplicate protection and one-time reminders", async () => {
      const item = (await api("/calendar/reminders", "POST", { name: "QA fund", amount: 10, due_day: 1, type: "investment", is_recurring: false }, c, 201)).reminder;
      const responses = await Promise.all([1, 2].map(() => fetch(base + "/calendar/pay", { method: "POST", headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ reminder_id: item.id, date }) })));
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      assert.equal((await api(`/calendar?month=${month}`, "GET", undefined, c)).events.find(r => r.id === item.id).status, "paid");
      assert.ok(!(await api("/calendar?month=2027-02", "GET", undefined, c)).events.some(r => r.id === item.id));
      await api("/calendar/pay", "POST", { reminder_id: item.id, type: "income", date }, c, 400);
    });
    await check("lifetime savings includes more than 60 months", async () => {
      const before = (await api("/reports/summary", "GET", undefined, b)).totals.cumulative_savings;
      for (let i = 0; i < 61; i++) {
        const m = currentMonth(new Date(2010, i, 1));
        await api("/income", "POST", { source: "Salary", amount: 1, month: m }, b, 201);
      }
      assert.equal((await api("/reports/summary", "GET", undefined, b)).totals.cumulative_savings, before + 61);
    });
    await check("monthly trend respects the requested combined limit", async () => {
      await api("/expenses", "POST", { category_id: foreignCategories[0].id, amount: 1, date }, b, 201);
      assert.equal((await api("/reports/monthly?limit=1", "GET", undefined, b)).trend.length, 1);
    });
    await check("budget recommendation cents never exceed income", () => {
      for (const type of ["fixed", "variable"]) {
        const plan = allocateBudget(0.02, [1, 2, 3].map(id => ({ id, name: "Test", type, priority: "Low", monthly_limit: type === "fixed" ? 1 : 0 })));
        const actual = Math.round(plan.allocations.reduce((s, r) => s + r.recommended_limit, 0) * 100);
        assert.ok(actual <= 2, `${type} allocated ${actual} cents from 2 cents`);
        assert.equal(actual, Math.round(plan.total_recommended * 100));
      }
    });
    await check("goal suggestions respect remaining target and available capacity", () => {
      const suggestions = suggestContributions([{ id: 1, target_amount: 10, saved_amount: 9, priority: "High" }], 100);
      assert.ok(suggestions[0].suggested_contribution <= 1);
    });
    await check("all validation examples reflect real input validity", async () => {
      const data = await api("/validation/run", "POST", {}, a);
      assert.equal(data.total, examples.length);
      for (const result of data.results) {
        const example = examples.find(e => e.id === result.id);
        assert.equal(result.passed, example.expected === "accept", result.id);
      }
    });
    await check("every invalid example is rejected by its real submission endpoint", async () => {
      const paths = { investment: "/investments", income: "/income", expense: "/expenses", budget: "/budgets", goal: "/goals", contribution: `/goals/${goal.id}/contribute`, reminder: "/calendar/reminders", payment: "/calendar/pay", category: "/categories", profile: "/auth/profile", registration: "/auth/register", login: "/auth/login" };
      for (const item of examples.filter(example => example.expected === "reject")) {
        const response = item.schema === "filters"
          ? await api(`/reports/summary?month=${encodeURIComponent(item.payload.month)}`, "GET", undefined, a, 400)
          : await api(paths[item.schema], item.schema === "profile" ? "PUT" : "POST", item.payload, a, 400);
        assert.ok(response.fieldErrors?.some(error => error.field === item.errorField), item.id);
      }
    });
    await check("delete financial records and confirm persistence", async () => {
      for (const [route, id] of [["income", income.id], ["expenses", expense.id], ["investments", investment.id], ["budgets", budget.id], ["goals", goal.id]]) {
        await api(`/${route}/${id}`, "DELETE", undefined, a);
        await api(`/${route}/${id}`, "DELETE", undefined, a, 404);
      }
      await api(`/calendar/reminders/${reminder.id}`, "DELETE", undefined, a);
      assert.equal((await api("/reports/summary", "GET", undefined, a)).totals.income, 0);
    });
    const failed = results.filter(r => !r.passed);
    console.log(`\n${results.length - failed.length}/${results.length} workflow groups passed.`);
    if (failed.length) process.exitCode = 1;
  } finally {
    for (const id of users) await pool.execute("DELETE FROM Users WHERE id = ?", [id]);
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
