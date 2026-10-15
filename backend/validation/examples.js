const { currentMonth } = require("./validate");
const samples = {
  investment: { name: "Demo investment", type: "Stocks / Equities", amount: 5000, date: "2026-10-14" },
  income: { source: "Salary", amount: 50000, get month() { return currentMonth(); } },
  expense: { category_id: 1, amount: 250, date: "2026-10-14", description: "Demo expense" },
  budget: { category_id: 1, monthly_limit: 5000, priority: "Medium" },
  goal: { goal_name: "Emergency fund", target_amount: 10000, saved_amount: 0, deadline: "2027-01-31", priority: "High" },
  contribution: { amount: 500 },
  reminder: { name: "Internet bill", amount: 1000, due_day: 15, type: "fixed", is_recurring: true },
  payment: { reminder_id: 1, amount: 1000, date: "2026-10-14" },
  category: { name: "Travel", type: "variable" },
  profile: { name: "Demo User", email: "demo@example.com", salary_date: 1, currency: "INR", theme: "light" },
  registration: { name: "Demo User", email: "demo@example.com", password: "Demo123!" },
  login: { email: "demo@example.com", password: "Demo123!" },
  filters: { month: "2026-10" },
};
const examples = Object.entries(samples).map(([schema, payload]) => ({ id: `${schema}-valid`, schema, title: "Valid input", payload, expected: "accept" }));
function example(schema, suffix, title, changes, field) {
  examples.push({ id: `${schema}-${suffix}`, schema, title, payload: { ...samples[schema], ...changes }, expected: "reject", errorField: field });
}
for (const [schema, field] of [["investment", "amount"], ["income", "amount"], ["expense", "amount"], ["budget", "monthly_limit"], ["goal", "target_amount"], ["contribution", "amount"], ["reminder", "amount"], ["payment", "amount"]]) {
  example(schema, "negative", "Reject a negative value", { [field]: -5000 }, field);
  example(schema, "text", "Reject text in a numeric field", { [field]: "incorrect" }, field);
  example(schema, "large", "Reject an amount outside database limits", { [field]: 10000000000 }, field);
  example(schema, "precision", "Reject money with more than two decimal places", { [field]: 10.001 }, field);
  if (schema !== "budget") example(schema, "zero", "Reject zero amount", { [field]: 0 }, field);
}
for (const [schema, field] of [["investment", "name"], ["income", "source"], ["goal", "goal_name"], ["category", "name"], ["reminder", "name"], ["profile", "name"]]) example(schema, "blank", "Reject a blank name", { [field]: "   " }, field);
for (const [schema, field] of [["investment", "date"], ["expense", "date"], ["goal", "deadline"], ["payment", "date"]]) example(schema, "date", "Reject an impossible calendar date", { [field]: "2026-02-30" }, field);
example("profile", "day", "Reject salary day 32", { salary_date: 32 }, "salary_date");
example("profile", "fraction", "Reject a fractional salary day", { salary_date: 1.5 }, "salary_date");
example("reminder", "day", "Reject due day 0", { due_day: 0 }, "due_day");
example("reminder", "fraction", "Reject a fractional due day", { due_day: 10.5 }, "due_day");
example("goal", "saved", "Reject savings above the target", { saved_amount: 11000 }, "saved_amount");
example("goal", "negative-saved", "Reject negative saved amount", { saved_amount: -1 }, "saved_amount");
example("registration", "email", "Reject malformed email", { email: "demo@" }, "email");
example("registration", "password", "Reject a short password", { password: "abc" }, "password");
example("login", "blank-password", "Reject an empty password", { password: "" }, "password");
example("profile", "email", "Reject malformed email", { email: "not-an-email" }, "email");
example("profile", "currency", "Reject unsupported currency", { currency: "XYZ" }, "currency");
example("profile", "theme", "Reject an unknown theme", { theme: "purple" }, "theme");
example("category", "type", "Reject an unknown category type", { type: "random" }, "type");
example("expense", "category", "Reject a negative category ID", { category_id: -1 }, "category_id");
example("budget", "priority", "Reject an unknown priority", { priority: "Urgent" }, "priority");
example("filters", "month", "Reject month 13", { month: "2026-13" }, "month");
example("investment", "asset", "Reject an unknown asset class", { type: "Random asset" }, "type");
example("investment", "units", "Reject negative shares", { market_provider: "yahoo", instrument_id: "TCS.NS", units: -5 }, "units");
example("investment", "missing-code", "Reject tracking without an instrument code", { market_provider: "yahoo", units: 5 }, "instrument_id");
example("investment", "mismatch", "Reject the wrong provider for the asset class", { market_provider: "mfapi", instrument_id: "120503", units: 5 }, "type");
examples.push({ id: "budget-zero", schema: "budget", title: "Allow a zero budget limit", payload: { ...samples.budget, monthly_limit: 0 }, expected: "accept" });
examples.push({ id: "goal-leap", schema: "goal", title: "Allow a valid leap-day deadline", payload: { ...samples.goal, deadline: "2028-02-29" }, expected: "accept" });
for (const [suffix, title, offset] of [["future-month", "Reject salary for next month", 1], ["future-year", "Reject salary for next year", 12]]) {
  examples.push({ id: `income-${suffix}`, schema: "income", title, expected: "reject", errorField: "month",
    get payload() {
      const now = new Date();
      const future = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      return { ...samples.income, month: currentMonth(future) };
    },
  });
}
module.exports = { samples, examples };
