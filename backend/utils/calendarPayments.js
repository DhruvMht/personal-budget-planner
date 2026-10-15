const { round2 } = require("./budgetCalculator");

// Explicit links take priority. Legacy manual payments can cover only one bill's
// outstanding balance at a time; a tiny payment must never mark a full bill paid.
function calendarPayments(reminders, expenses, incomes, investments) {
  const groups = { income: incomes, investment: investments, expense: expenses };
  const remaining = new Map();
  for (const [type, rows] of Object.entries(groups)) {
    for (const row of rows) remaining.set(`${type}:${row.id}`, Number(row.amount));
  }
  const results = new Map();
  for (const reminder of reminders) {
    const type = ["income", "investment"].includes(reminder.type) ? reminder.type : "expense";
    const rows = groups[type];
    let paid = 0, matchedExpense = null;
    const linked = rows.filter(row => row.reminder_id === reminder.id);
    const legacy = rows.filter(row => row.reminder_id == null && (type === "expense"
      ? row.category_id === reminder.category_id
      : String(row.source ?? row.name).trim().toLowerCase() === reminder.name.trim().toLowerCase()));
    for (const row of [...linked, ...legacy]) {
      const key = `${type}:${row.id}`;
      const amount = Math.min(remaining.get(key) || 0, Math.max(0, Number(reminder.amount) - paid));
      remaining.set(key, round2((remaining.get(key) || 0) - amount));
      paid = round2(paid + amount);
      if (amount > 0 && type === "expense") matchedExpense = row.id;
    }
    results.set(reminder.id, { paid, matchedExpense });
  }
  return results;
}
module.exports = { calendarPayments };
