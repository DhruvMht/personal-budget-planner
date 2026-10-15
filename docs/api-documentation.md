# API Documentation — Personal Budget Planner

Base URL: `http://localhost:5000/api`

All responses are JSON. Protected endpoints require an `Authorization: Bearer <token>` header.
Errors use the shape `{ "message": "..." }` (validation errors also include an `errors` array).
Money values are numbers. Months are strings in `YYYY-MM`; dates are `YYYY-MM-DD`.

| Status | Meaning |
| --- | --- |
| 200 / 201 | Success |
| 400 | Validation error |
| 401 | Missing / invalid token, or wrong credentials |
| 404 | Resource not found |
| 409 | Duplicate (email or category name) |
| 500 | Server error |

---

## Health

### GET /api/health
Response: `{ "status": "ok", "time": "2026-08-15T06:00:00.000Z" }`

---

## Auth

### POST /api/auth/register
Creates the user, then creates their 10 default expense categories, then returns the user.

Body: `{ "name": "Test User", "email": "t@example.com", "password": "password123" }`

Response `201`:
```json
{ "user": { "id": 1, "name": "Test User", "email": "t@example.com", "currency": "INR", "salary_date": 1, "theme": "light", "created_at": "..." }, "token": "<jwt>" }
```

### POST /api/auth/login
Body: `{ "email": "t@example.com", "password": "password123" }`
Response: `{ "user": {...}, "token": "<jwt>" }`

### POST /api/auth/logout  *(protected)*
Response: `{ "message": "Logged out successfully" }` — JWT is stateless, the client discards the token.

### GET /api/auth/profile  *(protected)*
Response: `{ "user": {...} }`

### PUT /api/auth/profile  *(protected)*
Body (all optional): `{ "name", "email", "currency", "salary_date", "theme", "password" }`
Response: `{ "user": {...} }`

---

## Expense categories

### GET /api/categories  *(protected)*
Response: `{ "categories": [ { "id": 1, "user_id": 1, "name": "Rent", "type": "fixed" } ] }`

### POST /api/categories  *(protected)*
Body: `{ "name": "Gym", "type": "variable" }` — `type` is `fixed` or `variable`.
Response `201`: `{ "category": {...} }`

### PUT /api/categories/:id  *(protected)*
Body: `{ "name": "Gym & Sports", "type": "variable" }` → `{ "category": {...} }`

### DELETE /api/categories/:id  *(protected)*
Response: `{ "message": "Category deleted" }`

### POST /api/categories/restore-defaults  *(protected)*
Re-creates any missing default categories. Response: `{ "added": 2, "categories": [...] }`

---

## Income

### GET /api/income?month=YYYY-MM  *(protected)*
Response: `{ "incomes": [ { "id", "user_id", "source", "amount", "month" } ], "total": 58000, "month": "2026-08" }`

### GET /api/income/total/:month  *(protected)*
Response: `{ "month": "2026-08", "total": 58000 }`

### POST /api/income  *(protected)*
Body: `{ "source": "Salary", "amount": 50000, "month": "2026-08" }` → `201 { "income": {...} }`

### PUT /api/income/:id  *(protected)*
Body (partial allowed): `{ "source", "amount", "month" }` → `{ "income": {...} }`

### DELETE /api/income/:id  *(protected)*
Response: `{ "message": "Income deleted" }`

---

## Expenses

### GET /api/expenses?month=&category_id=&search=  *(protected)*
Response:
```json
{ "expenses": [ { "id", "user_id", "category_id", "amount", "date", "description", "category_name", "category_type" } ],
  "total": 24000,
  "filters": { "month": "2026-08", "category_id": null, "search": "Food" } }
```

### GET /api/expenses/by-category/:month  *(protected)*
Response: `{ "month", "breakdown": [ { "category_id", "category_name", "type", "total" } ], "total": 24000 }`

### POST /api/expenses  *(protected)*
Body: `{ "category_id": 3, "amount": 1500, "date": "2026-08-05", "description": "Groceries" }` → `201 { "expense": {...} }`

### PUT /api/expenses/:id  *(protected)* — partial body allowed → `{ "expense": {...} }`

### DELETE /api/expenses/:id  *(protected)* → `{ "message": "Expense deleted" }`

---

## Budgets

### GET /api/budgets?month=YYYY-MM  *(protected)*
Runs the allocation algorithm (`utils/budgetCalculator.js`) for the month.
```json
{
  "month": "2026-08",
  "total_income": 50000,
  "fixed_required_total": 15000,
  "discretionary_remainder": 35000,
  "total_recommended": 50000,
  "weights": { "Low": 1, "Medium": 2, "High": 3, "Very High": 4 },
  "allocations": [
    { "category_id": 3, "category_name": "Food", "type": "variable", "priority": "High",
      "priority_weight": 3, "monthly_limit": 8000, "recommended_limit": 10500, "spent": 9000,
      "remaining": -1000, "exceeded": true, "nearly_exhausted": false, "utilisation_percent": 112.5 }
  ],
  "budgets": [ { "id", "name", "type", "priority", "monthly_limit", "spent", "budget_id" } ]
}
```

### GET /api/budgets/recommendation?month=YYYY-MM  *(protected)*
Same allocation payload without the stored `budgets` array (recommendation only).

### POST /api/budgets  *(protected)*
Creates or updates the budget row for a category.
Body: `{ "category_id": 3, "monthly_limit": 8000, "priority": "High" }` → `201 { "budget": {...} }`

### POST /api/budgets/apply-recommendation  *(protected)*
Body: `{ "month": "2026-08" }` → `{ "message": "Recommended limits applied", "month", "applied": 10 }`

### PUT /api/budgets/:id  *(protected)*
Body: `{ "monthly_limit", "priority" }` → `{ "budget": {...} }`

### DELETE /api/budgets/:id  *(protected)* → `{ "message": "Budget deleted" }`

---

## Goals

### GET /api/goals?month=YYYY-MM  *(protected)*
```json
{ "goals": [ { "id", "goal_name", "target_amount", "saved_amount", "deadline", "priority",
               "remaining_amount", "progress_percent", "months_left", "required_monthly_saving",
               "months_at_current_rate", "expected_completion_date", "on_track", "is_complete",
               "suggested_contribution" } ],
  "monthly_saving_capacity": 26000, "month": "2026-08" }
```

### GET /api/goals/:id  *(protected)* → `{ "goal": {...} }`

### POST /api/goals  *(protected)*
Body: `{ "goal_name": "Laptop", "target_amount": 80000, "saved_amount": 10000, "deadline": "2027-06-01", "priority": "High" }` → `201 { "goal": {...} }`

### POST /api/goals/:id/contribute  *(protected)*
Body: `{ "amount": 5000 }` → `{ "goal": {...} }` (never exceeds the target).

### PUT /api/goals/:id  *(protected)* — partial body allowed → `{ "goal": {...} }`

### DELETE /api/goals/:id  *(protected)* → `{ "message": "Goal deleted" }`

---

## Reports

### GET /api/reports/summary?month=YYYY-MM  *(protected)*
```json
{ "month": "2026-08",
  "totals": { "income": 50000, "expenses": 24000, "savings": 26000, "remaining": 26000 },
  "category_breakdown": [ { "category_id", "category_name", "type", "total" } ],
  "budget": { "...allocation payload..." },
  "goals": { "items": [], "total_target": 80000, "total_saved": 15000, "overall_progress_percent": 18.75 },
  "notifications": [ { "type": "budget_exceeded", "severity": "danger", "message": "..." } ] }
```

### GET /api/reports/monthly?months=6  *(protected)*
Response: `{ "trend": [ { "month", "income", "expenses", "savings", "remaining" } ], "months": 6 }`

### GET /api/reports/notifications?month=YYYY-MM  *(protected)*
Response: `{ "month", "notifications": [...] }`
Notification types: `budget_exceeded`, `budget_nearly_exhausted` (>= 80% used), `goal_contribution_pending`.

---

## Definitions used consistently across the API

- **Savings** = Total Income − Total Expenses for the selected month.
- **Remaining** (month level) = the same available balance as Savings.
- **Remaining** (budget allocation view) = category `monthly_limit` − category `spent`.
- Transfers between a user's own categories are not modelled as expenses.


## Investments (protected)

All paths below begin with `/api/investments` and require a bearer token.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | List own holdings, optional `month`, `type`, `search` filters |
| GET | `/summary?month=YYYY-MM` | Monthly cost and all-time valuation/distribution |
| GET | `/instruments?type=...&q=...` | Search instruments or manual asset suggestions |
| GET | `/instruments/quote?provider=...&instrument_id=...` | Fetch a selected instrument quote |
| POST | `/calculate` | Convert `{field: "amount" or "units", value, price}` |
| POST | `/` | Create an investment |
| PUT | `/:id` | Update an owned investment, including partial edits |
| DELETE | `/:id` | Delete an owned investment |
| POST | `/sync-prices` | Refresh all supported holdings across purchase months |
| POST | `/:id/sync-price` | Refresh one owned holding |

Purchase fields include `name`, `type`, `amount`, `units`, `purchase_price`, `date`, optional
`notes` and `current_value`. `calculation_basis` selects `amount` or `units` as the authoritative
input. For linked assets, `market_provider` and `instrument_id` identify the selected instrument.
Money rounds to two places, units to eight, and purchase price stores up to twelve places.
The save path recalculates conversions and rejects inconsistent pairs without a basis.
Legacy amount-only records remain supported. Dates must not exceed today in Asia/Kolkata.

`quantity_metadata` records provenance. Estimated records require positive actual purchase details
and `confirm_actual_quantity: true` before market linking. Owner-accepted quantities retain their
provenance and do not require repeated confirmation. An exact supported instrument is still required.
Refresh updates market value/status without changing purchase cost, units or purchase price.
Failed or unsupported updates retain saved values. Returns are unrealized and exclude fees,
taxes, dividends and realized sale proceeds.

## Bill calendar (protected)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/calendar?month=YYYY-MM` | Reminders and payment state for a month |
| POST | `/api/calendar/reminders` | Create a recurring or one-time reminder |
| PUT | `/api/calendar/reminders/:id` | Update an owned reminder |
| DELETE | `/api/calendar/reminders/:id` | Delete an owned reminder |
| POST | `/api/calendar/pay` | Record a payment linked to a reminder |

The calendar tracks partial/overdue balances and rejects duplicate quick payment after a
reminder is fully paid. Investment payments follow the same no-future-date rule as investment CRUD.

## Validation demonstration (protected)

- `GET /api/validation/catalog`: schemas, editable sample inputs and example cases.
- `POST /api/validation/check`: `{schema, payload, partial?}` returns input acceptance and field errors.
- `POST /api/validation/run`: evaluates the bundled examples.

The panel uses API validators but does not persist records, verify credentials or replace
ownership/market checks. Free-text fields accept Unicode letters, numbers and ordinary spaces.
Passwords preserve special characters, emails use their own pattern, and instrument codes and
provider-verified names retain their required formats. Example count: 125 as of 15 October 2026.
