const PRIORITIES = ["Low", "Medium", "High", "Very High"];
const ASSETS = ["Mutual Funds / SIP", "Stocks / Equities", "Fixed Deposit / RD", "Gold / SGB", "PPF / EPF / NPS", "Real Estate / REITs", "Cryptocurrency", "Other Investments"];
const text = (label, max, required = true, min = 1) => ({ label, type: "string", required, min, max, characters: "plain", hint: "Letters, numbers and spaces only. No special characters." });
const money = (label, required = true, min = 0.01) => ({ label, type: "number", required, min, max: 9999999999.99, decimals: 2 });
const id = (label, required = true) => ({ label, type: "number", required, integer: true, min: 1, max: 2147483647 });
const date = (label, required = true) => ({ label, type: "date", required });
const month = { label: "Month", type: "month" };
const choice = (label, values, required = true) => ({ label, type: "enum", values, required });
const note = label => ({ ...text(label, 255, false, 0), allowBlank: true, nullable: true });
const priority = choice("Priority", PRIORITIES);
const SCHEMAS = {
  investment: { label: "Investments", fields: {
    name: text("Investment name", 255), type: choice("Asset class", ASSETS), amount: money("Invested amount"),
    date: { ...date("Investment date"), noFuture: true, hint: "Today or earlier (India Standard Time)." }, notes: note("Notes"),
    market_provider: { ...choice("Price provider", ["mfapi", "yahoo"], false), nullable: true },
    instrument_id: { label: "Instrument code", type: "string", max: 80, nullable: true, characters: "instrument" },
    units: { label: "Shares / units", type: "number", min: 0.00000001, max: 999999999999, decimals: 8, nullable: true },
    purchase_price: { label: "Purchase price per unit", type: "number", min: 0.000000000001, max: 999999999999, decimals: 12 },
    calculation_basis: choice("Calculate from", ["amount", "units"], false),
    confirm_actual_quantity: { label: "Actual purchase details confirmed", type: "boolean" },
    current_value: money("Current value", false, 0), month,
  } },
  income: { label: "Income", fields: { source: text("Income source", 100), amount: money("Income amount"), month: { ...month, required: true } } },
  expense: { label: "Expenses / fixed payments", fields: { category_id: id("Category"), amount: money("Expense amount"), date: date("Payment date"), description: note("Description") } },
  budget: { label: "Budgets / fixed limits", fields: { category_id: id("Category"), monthly_limit: money("Monthly limit", true, 0), priority } },
  goal: { label: "Savings goals", fields: { goal_name: text("Goal name", 100), target_amount: money("Target amount"), saved_amount: money("Saved amount", false, 0), deadline: { ...date("Deadline", false), nullable: true, allowBlank: true }, priority } },
  contribution: { label: "Goal contributions", fields: { amount: money("Contribution") } },
  reminder: { label: "Bill calendar reminders", fields: { name: text("Reminder name", 100), amount: money("Bill amount"), due_day: { label: "Due day", type: "number", required: true, integer: true, min: 1, max: 31 }, category_id: { ...id("Category", false), nullable: true }, type: choice("Reminder type", ["fixed", "variable", "investment", "income"]), is_recurring: { label: "Recurring", type: "boolean" }, notes: note("Notes") } },
  payment: { label: "Bill calendar payments", fields: { reminder_id: id("Reminder"), amount: money("Payment amount", false), date: date("Payment date", false), category_id: { ...id("Category", false), nullable: true }, description: note("Description"), type: choice("Payment type", ["fixed", "variable", "investment", "income"], false) } },
  category: { label: "Categories", fields: { name: text("Category name", 60), type: choice("Category type", ["fixed", "variable"]) } },
  profile: { label: "Settings / profile", fields: { name: text("Full name", 100, false, 2), email: { label: "Email", type: "email", max: 150 }, salary_date: { label: "Salary day", type: "number", integer: true, min: 1, max: 31 }, currency: choice("Currency", ["INR", "USD", "EUR", "GBP", "JPY"], false), theme: choice("Theme", ["light", "dark"], false), password: { label: "New password", type: "password", min: 6, max: 72 } } },
  registration: { label: "Registration", fields: { name: text("Full name", 100, true, 2), email: { label: "Email", type: "email", required: true, max: 150 }, password: { label: "Password", type: "password", required: true, min: 6, max: 72 } } },
  login: { label: "Login input", fields: { email: { label: "Email", type: "email", required: true, max: 150 }, password: { label: "Password", type: "password", required: true, min: 1, max: 72 } } },
  filters: { label: "Dashboard / reports / month filters", fields: { month: { ...month, required: true } } },
};

module.exports = { SCHEMAS, PRIORITIES };
