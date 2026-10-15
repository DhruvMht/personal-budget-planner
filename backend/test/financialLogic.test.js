const { test } = require("node:test");
const assert = require("node:assert/strict");
const { allocateBudget } = require("../utils/budgetCalculator");
const { suggestContributions, computeGoal } = require("../utils/goalCalculator");
const { calendarPayments } = require("../utils/calendarPayments");

test("budget row totals match summaries and never exceed available cents", () => {
  for (const type of ["fixed", "variable"]) {
    for (let cents = 0; cents < 200; cents++) {
      const plan = allocateBudget(cents / 100, [1, 2, 3, 4, 5, 6, 7].map(id => ({ id, type, name: "Test", priority: "Low", monthly_limit: type === "fixed" ? 10 : 0 })));
      const total = Math.round(plan.allocations.reduce((sum, row) => sum + row.recommended_limit, 0) * 100);
      assert.equal(total, cents); assert.equal(total, Math.round(plan.total_recommended * 100));
      assert.ok(plan.allocations.every(row => row.recommended_limit >= 0));
    }
  }
});
test("an explicitly saved zero budget stays zero and warns on any spending", () => {
  const plan = allocateBudget(1000, [{ id: 1, budget_id: 5, name: "Rent", type: "fixed", monthly_limit: 0, spent: 1 }]);
  assert.equal(plan.allocations[0].monthly_limit, 0);
  assert.equal(plan.allocations[0].exceeded, true);
});
test("goal suggestions cap at remaining targets and redistribute available cents", () => {
  const goals = [{ id: 1, target_amount: 10, saved_amount: 9, priority: "Very High" }, { id: 2, target_amount: 100, saved_amount: 0, priority: "Low" }];
  assert.deepEqual(suggestContributions(goals, 10).map(row => row.suggested_contribution), [1, 9]);
  assert.deepEqual(suggestContributions(goals, 1000).map(row => row.suggested_contribution), [1, 100]);
  assert.equal(suggestContributions(goals, 0).reduce((s, r) => s + r.suggested_contribution, 0), 0);
});
test("calendar partial and shared-category payments are counted once", () => {
  const reminders = [1, 2].map(id => ({ id, type: "fixed", name: `Bill ${id}`, category_id: 3, amount: 100 }));
  let result = calendarPayments(reminders, [{ id: 1, category_id: 3, amount: 1 }], [], []);
  assert.equal(result.get(1).paid, 1); assert.equal(result.get(2).paid, 0);
  result = calendarPayments(reminders, [{ id: 1, category_id: 3, amount: 100, reminder_id: 2 }], [], []);
  assert.equal(result.get(1).paid, 0); assert.equal(result.get(2).paid, 100);
});
test("calendar income and investments use the correct transaction type and exact names", () => {
  const reminders = [{ id: 1, type: "income", name: "Salary", amount: 500, category_id: 3 }, { id: 2, type: "investment", name: "Fund A", amount: 100 }];
  const result = calendarPayments(reminders, [{ id: 1, category_id: 3, amount: 500 }], [{ id: 2, source: "Salary", amount: 500 }], [{ id: 3, name: "Fund ABC", amount: 100 }]);
  assert.equal(result.get(1).paid, 500); assert.equal(result.get(2).paid, 0);
});
test("goal completion clamps month-end dates and overdue goals are not on track", () => {
  const goal = { target_amount: 100, saved_amount: 0, deadline: "2026-01-01", priority: "Medium" };
  const result = computeGoal(goal, 100, new Date(2026, 0, 31, 12));
  assert.equal(result.expected_completion_date, "2026-02-28");
  assert.equal(result.on_track, false);
  assert.equal(computeGoal({ ...goal, saved_amount: 100 }, 100, new Date(2026, 0, 31, 12)).on_track, true);
});
