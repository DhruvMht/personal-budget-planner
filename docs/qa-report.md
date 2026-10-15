# QA report — 15 October 2026

## Final results

| Check | Result |
| --- | --- |
| Backend regression tests | 68 passed, 0 failed |
| Live API integration groups | 24 passed, 0 failed |
| Validation panel examples | All 125 matched the fixed rules: 17 valid, 108 invalid |
| Invalid examples submitted to real API routes | All 108 rejected with the intended field error |
| Local browser workflows and control audit | 19 groups passed; no uncaught page exceptions or HTTP 5xx responses |
| Responsive page checks | 10 pages at 1440px and 390px; no horizontal page overflow |
| Live stock search and quote | TCS search, selection, calculation, save and single/bulk refresh succeeded in one browser run; a later Yahoo quote request was unavailable (503) |
| Live mutual-fund search and NAV | HDFC search and scheme 120503 NAV succeeded |
| Frontend production build | Succeeded; Vite retains a bundle-size advisory |
| Investment value and ROI button checks | 7 API/browser groups passed with controlled provider fixtures and real local MySQL |

The top-level regression, API integration, validation-example and production-build results were rerun on 15 October 2026 for the final submission. The focused investment date/layout API and browser checks also passed, including all eight asset types, a browser in a different timezone, and desktop/mobile layouts. The broader 19 browser groups and provider observations below retain their earlier recorded scope.

Tests used disposable accounts. Their records were deleted afterward. The calendar
migration adds nullable reminder references and preserves existing financial values.

## Character validation follow-up — 15 October

Free-text input now permits letters, numbers and ordinary spaces only, including names,
income sources, categories, savings goals, reminders, optional notes and descriptions.
Create and edit routes reject punctuation, emoji, markup and invisible/control characters.
Names in Indian scripts and accented names remain valid. Passwords retain their exact
special characters; the email pattern accepts valid punctuation in the local part and
rejects repeated dots, invalid domains, whitespace and extra at signs.

Tests cover every free-text schema field, real create and update endpoints, invalid
searches, amount/quantity calculations, and password registration/login/change with
special characters. The UI shows an inline incorrect-value message, and the validation
panel uses the same backend rules. Manual investment suggestions now obey the rule.
Dates, decimals, enums and instrument codes retain their own formats; provider-verified
stock/fund names keep official punctuation. Historical records are not rewritten.

The regression, integration, 19 browser groups and frontend build results above were rerun for this change.
Real-provider observations and the seven price-refresh groups below refer to the earlier audit.

## Investment purchase calculation follow-up — 15 October

The form now always calculates amount from quantity and purchase price, or quantity
from amount and purchase price, for all eight asset types. Purchase price is persisted
as DECIMAL(24,12); money uses two decimal places and quantity eight. Decimal arithmetic
handles half-cent rounding. The server recalculates on save and rejects inconsistent
submitted values when no authoritative input is specified. Unrelated edits preserve
known quantities even when a backfilled purchase price is rounded.

The migration ran twice against the local database: all eight existing records retained
identical cost, quantity and current valuation. None had sufficient known quantity for a
purchase-price backfill, so no quantities or prices were invented. Older amount-only
records and calendar payments can still be recorded; their actual purchase details must
be supplied before unit-based market valuation.

`qa-investment-purchase.js` checks both directions, database round trips, partial edits,
invalid combinations and saved-price preservation across all eight asset types. Controlled
quotes verify a 50% ROI using saved quantity and historical cost. Browser coverage checks
all eight types through selection, calculation, save, reload and purchase-price edits,
including preservation of an entered historical price when a quote outage is retried.

Run `node scripts/qa-investment-purchase.js` from backend, with the same Playwright
variables below to include browser checks. These tests use disposable accounts and
controlled market responses. The 61 regression tests, 24 API workflow groups and
production build also pass; the three refresh API groups were rerun against the new schema.
The broader 19 browser groups above describe the earlier character-validation run.

## Defects fixed and retested

- Profile updates rejected a user's own email when only casing or whitespace changed.
- Category renaming allowed duplicate category names.
- Zero investment valuations fell back to purchase cost in totals and the holding list.
- Budget rounding could allocate more cents than available while reporting a capped total.
- An explicitly saved zero budget was replaced by a suggested nonzero limit.
- Reopening a zero fixed-commitment limit replaced it with an algorithmic amount.
- Goal suggestions exceeded remaining targets and could over-allocate available money.
- Goal completion dates skipped February for month-end starts; overdue goals could show as on track.
- Calendar income payments were recorded as expenses. The calendar also passed the wrong argument shape when loading income.
- A tiny expense marked all reminders sharing its category as fully paid.
- Calendar quick-pay had no explicit reminder link or protection against concurrent duplicate payments.
- One-time reminders appeared every month. They now apply to their creation month.
- Lifetime savings omitted history beyond the latest 60 months.
- Monthly reports could return more months than requested after merging income, expenses and investments.
- Registration could leave database connection failures outside its error handler.
- Authentication treated database failures as invalid credentials; the frontend discarded sessions on temporary connection failures.
- Expense cards and action bars overflowed narrow screens.
- The top-bar theme toggle did not persist its choice and could read stale theme state.
- Manual investments showed unusable per-holding market-refresh controls. One portfolio action now reports assets it cannot price and preserves their saved valuations.
- Fixed-payment Edit buttons opened a variable-category-only form that rejected saving. Existing fixed payments can now be edited while retaining their commitment category.

## Button and tab follow-up audit

The browser suite also exercises dashboard feed tabs and shortcuts; expense/budget tabs;
search and filter resets; recommendation/algorithm apply actions; new commitments;
calendar previous/next/today controls; modal cancel, close and Escape; category add/delete
and restore; report month/range controls; edit/delete actions; theme toggling in both
directions and after reload; and all ten sidebar links on mobile. The investment test
checks that manual holdings do not expose unusable refresh buttons. The source scan
found no placeholder links, empty click handlers or coming-soon actions.

The optional real-provider browser group passed selection of TCS.NS, latest-price
calculation, saving and both price-refresh buttons. A subsequent run encountered a
Yahoo quote outage: the API returned 503 and the form offered retry/manual calculation.
This external availability failure is recorded separately from the passing local checks.

Calendar quick-pay now records the correct transaction type in a database transaction,
links it to its reminder, and serializes payments for that reminder. Partial payments
remain pending, fully paid reminders reject another quick payment for the same month,
and deleting a linked transaction recalculates the reminder's status. Expense payments
require an owned category instead of silently choosing an unrelated category.

Historical payments without reminder links retain a conservative matching fallback:
expense amounts are allocated by category without double counting; income and investment
names must match exactly. Existing records are not rewritten to guess their intended bill.

## Coverage

- Registration, password mismatch, duplicate email, login errors, logout, profile changes,
  password changes, saved theme, session persistence and temporary network failure recovery.
- Income creation/editing/deletion and salary month boundaries, including year rollover.
- Expense CRUD, category ownership, category/search/month filters, duplicate categories,
  restore defaults, fixed commitments and budget editing.
- Budget totals, recommendations, cents, zero limits and overspending notifications.
- Goal CRUD, contribution limits, concurrent contributions, suggestions and completion dates.
- Manual investment search, amount/quantity conversion, save/edit, preserved cost,
  zero valuation and safe manual sync. Unit tests also cover provider selection,
  quote failures and linked valuation. Live provider availability was checked separately.
- Calendar reminder CRUD, ownership, February day clamping, income/expense/investment
  payments, partial payments, duplicate payments and one-time reminders.
- Dashboard/report reconciliation, lifetime totals, combined trend limits and empty states.
- Cross-account update/delete isolation and invalid inputs on live submission routes.
- Validation panel PASS/FAIL behavior and the required-fields-only interface.
- Desktop and mobile rendering of Dashboard, Income, Expenses, Fixed Commitments,
  Budgets, Calendar, Investments, Goals, Reports and Settings.

## Repeat the checks

Investment updates have additional coverage in `qa-investment-prices.js`:
price metadata persistence, backend refresh intervals, original-cost preservation,
manual asset exclusion, account isolation, currency restrictions, edits during a pending
quote, the single whole-portfolio live-value/ROI button, explicit result messages,
provider failure/recovery, page reload, mobile rendering, and no background polling.
The button updates all purchase months even when the visible list is filtered. Tests
verify exact identification of older entries, preservation of original cost, and clear
unchanged results for unsupported assets and missing quantities. Regression tests also
reject ambiguous or partial name matches instead of guessing an instrument.
Provider responses are controlled in this suite; these results do not assert uninterrupted live-provider availability.

After the single-button change, the 49 regression tests, 22 integration groups, 7
investment API/browser groups and production build were rerun successfully. The broader
18 browser groups and real-provider observations above are from the earlier audit.

From `backend`, with local MySQL configured in `.env`:

```powershell
npm run migrate:calendar
npm run migrate:prices
npm test
npm run test:integration
node scripts/qa-investment-prices.js
```

The integration suite starts its own temporary API listener. It creates and removes
test accounts in the configured database; run it against the local development database.

For browser checks, start the backend on port 5000 and frontend on port 5173, make
Playwright available, and run from `backend`:

```powershell
node scripts/qa-browser.js
```

If Playwright is provided outside this project's dependencies, set
`PLAYWRIGHT_MODULE_PATH` to its module directory. `QA_BROWSER_PATH` optionally selects
an installed Edge/Chrome executable; `QA_FRONTEND_URL` overrides the default frontend URL.
The browser script also creates and removes a disposable account.
Set `QA_LIVE_MARKET=1` to include the external-provider stock selection and refresh check;
that optional check can fail when the provider is unavailable.

From `frontend`, run `npm run build` for the production build check.

## Practical limits

This is a functional and regression QA pass against local MySQL and headless Edge,
not proof that every possible input, browser or concurrency pattern is error-free.
Stock quotes and mutual-fund NAVs depend on external providers and can become unavailable
or stale after the test. Their failure paths are covered by regression tests. Sustained
load testing, a full security audit and Safari/Firefox compatibility were not performed.


## Estimated legacy quantities — 15 October 2026

- Applied a reviewed reference-price plan to eight existing local holdings, after backing up their original rows outside version control. References use published 14 October fund/ETF NAVs and gold spot rates; ambiguous products remain labelled as comparable estimates. PPF uses one deposit.
- Verified every original name, type, amount, current value, date, month, notes and provider identity against the backup. Each estimated quantity times its reference price reproduces its saved valuation within one paisa; implied cost times quantity reproduces original invested amount within one paisa.
- 64 regression tests passed, including blocking provider calls for estimates and requiring confirmation before using actual quantities for live valuation.
- `node scripts/qa-estimated-quantities.js` passed real API/MySQL checks and headless Edge checks with a disposable account: provenance and reference labels, edit/save/reload, unchanged ROI, blocked unconfirmed linking, and clearing the estimate after actual details are confirmed. No external provider calls occurred.
- `node scripts/qa-investment-purchase.js` passed API/database conversion and ROI checks for all eight asset types. Frontend production build passed with the existing bundle-size advisory.
- Backend restarted and both the health endpoint and frontend returned successfully. Estimates are not verified holdings and do not enable live scraping on their own.


## Owner-accepted ROI baseline — 15 October 2026

At the owner's explicit request, all eight reference-derived quantities and costs
were accepted as the project's working holdings. The acceptance script backed up
all records, changed only provenance metadata, and verified the remaining columns
were unchanged. Earlier derivation remains recorded internally. These records no
longer display estimate warnings or require quantity confirmation.

67 regression tests passed. Disposable-account API/MySQL and headless Edge checks
verified normal quantity display, no confirmation checkbox, edit persistence,
linking a price source without overwriting accepted quantities or purchase cost,
and reopening the linked holding. Controlled quote changes from 275 to 300 for
20 units on a 5000 cost updated valuation from 5500 to 6000 and ROI to 20 percent,
without changing quantity or cost. No external provider requests were made in QA.
The production frontend build passed with the existing bundle-size advisory.
Unidentified instruments still require a supported pricing identity; accepting
quantities does not establish a stock symbol, fund scheme, or unsupported feed.


## Investment dates and record layout — 15 October 2026

Investment creation and edits now reject dates after the current IST calendar day.
The same rule is used by the Settings validation panel and calendar investment
payments. The date picker has today's maximum and displays a field error for a
future typed date. Date-only display/edit helpers preserve calendar dates across
browser time zones. A tomorrow-date example is included in the validation panel.

68 regression tests passed, including all eight asset classes, create/partial edit,
IST midnight/year rollover and leap-day boundaries. The real API/database and
headless browser script `node scripts/qa-investment-dates-layout.js` passed future
create/edit/calendar rejection, no writes on rejection, today/past acceptance,
validation-panel parity and add/edit form checks in a Los Angeles browser timezone.
Desktop columns aligned with long names/notes; 768px and 390px checks found no
horizontal overflow or displaced action buttons. Missing quantities have no empty
label. Desktop/mobile record screenshots were inspected. The production build passed.
