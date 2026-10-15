# Personal Budget Planner

Full-stack personal budgeting app: React (Vite) + Tailwind frontend, Express REST API, MySQL
via the `mysql2` driver with raw parameterized SQL (no ORM), JWT + bcrypt auth.

All financial logic (budget allocation, goal maths, monthly totals, validation) lives in the
backend under `backend/utils/`. The frontend only renders values returned by the API, so any
other client — e.g. a React Native app later — gets the same complete behaviour.

## Tech Stack

| Layer | Technologies / Libraries |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, Recharts (Data Visualizations), Lucide React (Icons), Axios, React Router DOM |
| **Backend** | Node.js, Express.js, JWT (`jsonwebtoken`), Password Hashing (`bcryptjs`), CORS, Dotenv |
| **Database** | MySQL 8 / MariaDB with relational schemas, indexed foreign keys, and raw parameterized SQL (`mysql2`) |
| **Market Data Scraper** | AMFI India Daily NAVs API (`mfapi.in`), Yahoo Finance Quotes API, CoinGecko Crypto Spot API |
| **DevOps / Tooling** | Postman / REST Client, ESLint, Git |

## Key Features

- **Authentication & Security:** JWT-based user authentication, bcrypt password hashing, protected API routes, and user profile management.
- **Income & Cash Flow Tracking:** Track primary salaries, freelance income, and secondary cash flows with monthly categorization.
- **Fixed Commitments & Bill Calendar:** Schedule recurring bills (rent, EMIs, insurance, internet) with status toggles and overdue alerts.
- **Variable Expenses & Smart Budget Limits:** Visual category progress bars, budget allocation algorithm based on priority weights (Low 1, Medium 2, High 3, Very High 4).
- **Investment Portfolio:** Search suggestions in every asset class, verified scheme selection for Indian mutual funds/SIPs and NSE/BSE stocks, and automatic conversion between invested amount and shares or units. Other assets support manual valuations.
- **Interactive Analytics & Reporting:** Monthly visual trends, expense-to-income breakdown, asset allocation pie charts, savings rate, and exportable financial summaries.
- **Modern Responsive UI:** Dark and light mode themes, skeleton loaders, and animated counter metrics.

- Node.js 18+
- MySQL 8 (or MariaDB 10.6+) running locally

## 1. Database

```bash
# create schema (creates the budget_planner database and all tables)
mysql -u root -p < database/schema.sql

# OPTIONAL: sample starter data
mysql -u root -p budget_planner < database/seed.sql
```

`database/seed.sql` is for development only. Real users get their own 10 default categories
from the backend registration flow (`ExpenseCategory.createDefaultsForUser`).

## 2. Backend

```bash
cd backend
npm install
cp .env.example .env    # then edit the values
npm run dev             # or: npm start
```

`backend/.env`:

| Variable | Example | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | `secret` | MySQL password |
| `DB_NAME` | `budget_planner` | Database name |
| `JWT_SECRET` | long random string | Signs JWTs |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allow-list for the Vite frontend |

Check it is up: `curl http://localhost:5000/api/health`

## 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env    # VITE_API_URL=http://localhost:5000/api
npm run dev             # http://localhost:5173
```

Run both together: two terminals, backend first (the frontend needs the API for login).

## Investment price tracking

For existing databases, run `npm run migrate:investments` from `backend` once before
using investment search. This adds nullable instrument and unit fields and preserves
existing investments. New databases include these fields in `database/schema.sql`.
Also run `npm run migrate:prices` once to add nullable quote metadata for saved prices,
publication dates and refresh failures. It preserves all existing purchase costs and valuations.
Do not rerun the schema file on an existing database: it drops tables.

For INR portfolios, stocks and mutual funds can be selected from provider search results.
Choose the exact NSE/BSE listing or mutual fund plan. Its latest available price loads
automatically. Enter shares/units to calculate invested amount, or enter amount to calculate
quantity. The calculation price is editable for historical purchases; opening an existing
holding preserves its saved cost. Amounts round to two decimals and quantities to eight.
There is no separate current-value input: saving a linked investment calculates its
current value from quantity × latest provider quote, independently of its purchase cost.
New manual entries default to invested amount; editing them preserves their saved valuation.
The backend validates and saves the Yahoo symbol or MFAPI scheme code. Older names are
accepted only when there is one exact provider match. Refresh calculates units × latest available quote. Stock
quotes may be delayed and fund NAVs are daily, not intraday prices.
Click **Update all live values & ROI** to fetch prices for the entire portfolio across
all purchase months, regardless of the visible filters. This single button saves
quantity × price as each supported holding's value and recalculates ROI against its
original cost. The result shows portfolio totals, updated holdings and reasons for
unchanged holdings. Totals include those unchanged valuations when any updates fail.
There are no per-holding refresh buttons, linking switches or background polling.
The button is always visible; market updates are supported for INR portfolios.

Each linked holding shows the source price, its publication date, unrealized gain/loss
and percentage return. Refresh never changes invested amount. Provider failures preserve
the last successful valuation and mark it outdated; a successful refresh clears that warning.
Older published quotes are labelled separately from failed updates. Returns exclude fees,
taxes, dividends and realized sale proceeds. Manual assets do not receive estimated market returns.

Run `node scripts/qa-investment-prices.js` from `backend` for the price-refresh API and
database checks with controlled provider fixtures. Set `PLAYWRIGHT_MODULE_PATH` and
`QA_BROWSER_PATH` as described in the QA report to include the browser checks.

Older stocks/funds with a saved quantity are identified automatically when their name
or code matches exactly one provider result. Ambiguous names, missing quantities,
unsupported assets and failed quotes retain their saved valuations with an explanation.
Use Edit Investment to select the correct instrument or enter the actual quantity if
needed; quantities are never inferred from historical cost during refresh.
Other asset classes offer searchable
common labels and the user's saved names. These are clearly marked manual suggestions,
with an explicit custom-name option. Enable “Calculate using quantity and price” to use
the same amount/quantity conversion with an entered unit price. Manual assets keep their
saved valuation during market refresh; the previous guessed growth estimates are removed.

Backend regression checks: run `npm test` from `backend`.

For existing databases, run `npm run migrate:calendar` from `backend` to add nullable
reminder references for calendar payments. This preserves existing transactions and
enables accurate partial-payment tracking and duplicate-payment protection.

Run `npm run test:integration` from `backend` for the disposable-account API checks.
See [the QA report](docs/qa-report.md) for browser checks, coverage and known limits.

## Validation demo in Settings

Open **Settings → Validation Test Panel** while signed in. Select a form and
edit its inputs, then click **Check input**. Fixed backend
rules determine the result: **PASS** for valid input and **FAIL** for incorrect
input, with field-specific reasons. There is no user-selected expected outcome.

For example, enter `-500` as an investment amount. The panel shows **Incorrect
value** and **Test FAIL** because investment amounts must be greater than zero.
Change it to `500` with the remaining fields valid to see **Test PASS**.
Click **Run all examples** to check the built-in valid, invalid and boundary
cases together; expand a result to inspect its input and validation messages.
Deliberately invalid examples show FAIL; these counts describe input validity.

The panel uses the same backend input validators as the real API routes, covering
investments, income, expenses, budgets, goals, contributions, bill reminders and
payments, categories, profile settings, registration, login input and month filters.
Rules cover required fields, numeric ranges and precision, valid dates, supported
choices and relevant relationships between fields. Real submissions also check
record ownership and existing data; goal contributions cannot exceed the target.
Salary income allows only the current month or earlier, including when editing
an existing record. Future months and years are rejected in the form and test panel.

Panel checks do not save financial records or attempt a real login or market-data
lookup. They test input validation, not credentials, network availability or every
database-dependent operation. Use the normal forms to demonstrate those workflows.
Password inputs are hidden in displayed test results. Rules and examples live in
`backend/validation`; `npm test` in `backend` includes their regression checks.

## Budget allocation algorithm (backend/utils/budgetCalculator.js)

1. Total monthly income for the selected month.
2. Subtract the required fixed-category spend (Rent, Electricity, Internet, EMI, Insurance —
   the stored monthly limit, or the actual spend when no limit is set) → **discretionary remainder**.
   Fixed requirements are scaled down proportionally if they exceed income.
3. Split the discretionary remainder across variable categories in proportion to their priority
   weight (Low 1, Medium 2, High 3, Very High 4).
4. Recommendations are never negative and never total more than the monthly income.
5. Categories where actual spend exceeds the limit are flagged (`exceeded`), and categories at
   80%+ of the limit are flagged `nearly_exhausted`.

## Definitions

- **Savings** = Total Income − Total Expenses for the selected month.
- **Remaining** = the same available balance, except inside a budget allocation view where it
  means allocated limit − spent for that category.
- Transfers between a user's own categories are not treated as expenses.

## Project structure

```
budget-planner/
├── frontend/   React + Vite + Tailwind + React Router + Axios + Recharts
├── backend/    Express + mysql2 + JWT + bcrypt (controllers / routes / models / middleware / utils)
├── database/   schema.sql, seed.sql, er-diagram.png
└── docs/       api-documentation.md, project-report.md, screenshots/
```

Full endpoint reference: [docs/api-documentation.md](docs/api-documentation.md)
