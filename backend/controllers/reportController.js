const Income = require("../models/Income");
const Expense = require("../models/Expense");
const Goal = require("../models/Goal");
const Investment = require("../models/Investment");
const BillReminder = require("../models/BillReminder");
const { allocateBudget, calculateSavings, round2 } = require("../utils/budgetCalculator");
const { computeGoal } = require("../utils/goalCalculator");
const { buildCategoryRows } = require("./budgetController");

function currentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Builds in-app notifications from budget + goal state (no push/email). */
function buildNotifications(plan, goals, savings, reminders = [], today = new Date(), month = currentMonth()) {
  const notifications = [];
  const todayDate = today.getDate();
  const currentYM = currentMonth();
  const isCurrentMonth = month === currentYM;
  const isPastMonth = month < currentYM;

  for (const a of plan.allocations) {
    const isFixed = a.type === "fixed";

    if (isFixed) {
      // For Fixed Commitments:
      // When paid (100%), it is a SUCCESS, not a danger alert!
      // Only alert if PENDING BEYOND DUE DATE (Overdue) or due today.
      const rem = reminders.find(
        (r) =>
          r.category_id === a.category_id ||
          r.name.toLowerCase().includes(a.category_name.toLowerCase()) ||
          a.category_name.toLowerCase().includes(r.name.toLowerCase())
      );
      const dueDay = rem
        ? Number(rem.due_day)
        : a.category_name.toLowerCase().includes("rent")
        ? 1
        : a.category_name.toLowerCase().includes("emi")
        ? 5
        : a.category_name.toLowerCase().includes("insurance")
        ? 15
        : a.category_name.toLowerCase().includes("internet")
        ? 20
        : 1;

      const spent = Number(a.spent) || 0;
      const limit = Number(a.monthly_limit) || 0;
      const isUnpaid = limit > 0 && spent < limit;
      const isOverdue = isUnpaid && (isPastMonth || (isCurrentMonth && todayDate > dueDay));
      const isDueToday = isUnpaid && isCurrentMonth && todayDate === dueDay;

      if (a.exceeded) {
        notifications.push({
          type: "fixed_commitment_overpaid",
          severity: "warning",
          message: `${a.category_name} payment (${spent}) exceeded scheduled limit (${limit}).`,
        });
      } else if (isOverdue) {
        const daysLate = isCurrentMonth ? todayDate - dueDay : 0;
        notifications.push({
          type: "fixed_commitment_overdue",
          severity: "danger",
          message: `⚠️ Overdue: ${a.category_name} payment of ${round2(limit - spent)} was due on Day ${dueDay}${
            daysLate > 0 ? ` (${daysLate} day${daysLate === 1 ? "" : "s"} late)` : ""
          }.`,
        });
      } else if (isDueToday) {
        notifications.push({
          type: "fixed_commitment_due_today",
          severity: "warning",
          message: `⚡ Due Today: ${a.category_name} payment of ${round2(limit - spent)} is due today (Day ${dueDay}).`,
        });
      }
      // If paid (spent >= limit), NO warning is added!
    } else {
      // For Variable Discretionary Expenses:
      const exhausted = a.exhausted || Number(a.utilisation_percent) >= 100;
      if (a.exceeded) {
        notifications.push({
          type: "budget_exceeded",
          severity: "danger",
          message: `Budget exceeded for ${a.category_name}: spent ${a.spent} of ${a.monthly_limit}.`,
        });
      } else if (exhausted) {
        notifications.push({
          type: "budget_exhausted",
          severity: "danger",
          message: `${a.category_name} variable spending limit has reached 100%.`,
        });
      } else if (a.nearly_exhausted) {
        notifications.push({
          type: "budget_nearly_exhausted",
          severity: "warning",
          message: `${a.category_name} spending is nearly exhausted (${a.utilisation_percent}% used).`,
        });
      }
    }
  }

  for (const g of goals) {
    if (g.is_complete) continue;
    if (g.required_monthly_saving > 0 && g.required_monthly_saving > Math.max(0, savings)) {
      notifications.push({
        type: "goal_contribution_pending",
        severity: "warning",
        message: `${g.goal_name} needs ${g.required_monthly_saving} saved this month, but only ${round2(Math.max(0, savings))} is available.`,
      });
    }
  }

  return notifications;
}

/** GET /api/reports/summary?month=YYYY-MM — powers the dashboard & reports overview. */
async function summary(req, res, next) {
  try {
    const month = req.query.month || currentMonth();
    const userId = req.user.id;

    const [
      totalIncome,
      totalExpenses,
      totalInvestments,
      categoryBreakdown,
      rawGoals,
      investmentStats,
      investmentDistribution,
      allIncomeRows,
      allExpenseRows,
      reminders,
    ] = await Promise.all([
      Income.totalForMonth(userId, month),
      Expense.totalForMonth(userId, month),
      Investment.totalForMonth(userId, month),
      Expense.totalsByCategory(userId, month),
      Goal.findAllByUser(userId),
      Investment.allTimeStats(userId),
      Investment.totalsByType(userId, month),
      Income.monthlyTotals(userId, 60),
      Expense.monthlyTotals(userId, 60),
      BillReminder.findAllByUser(userId).catch(() => []),
    ]);

    const savings = calculateSavings(totalIncome, totalExpenses);
    const rows = await buildCategoryRows(userId, month);
    const plan = allocateBudget(totalIncome, rows);
    const goals = rawGoals.map((g) => computeGoal(g, Math.max(0, savings)));

    const goalTarget = round2(goals.reduce((s, g) => s + Number(g.target_amount), 0));
    const goalSaved = round2(goals.reduce((s, g) => s + Number(g.saved_amount), 0));

    // Cumulative Savings calculation across all historical months
    const lifetimeIncome = allIncomeRows.reduce((s, r) => s + Number(r.total), 0);
    const lifetimeExpenses = allExpenseRows.reduce((s, r) => s + Number(r.total), 0);
    const allTimeCumulativeSavings = round2(lifetimeIncome - lifetimeExpenses);

    res.json({
      month,
      totals: {
        income: round2(totalIncome),
        expenses: round2(totalExpenses),
        investments: round2(totalInvestments),
        savings,
        remaining: savings,
        net_cash_added: round2(totalIncome - totalExpenses - totalInvestments),
        cumulative_savings: allTimeCumulativeSavings,
      },
      category_breakdown: categoryBreakdown,
      goals: {
        total_target: goalTarget,
        total_saved: goalSaved,
        overall_progress_percent: goalTarget > 0 ? round2((goalSaved / goalTarget) * 100) : 0,
        items: goals,
      },
      investments: {
        stats: investmentStats,
        distribution: investmentDistribution,
      },
      notifications: buildNotifications(plan, goals, savings, reminders, new Date(), month),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/reports/monthly?limit=12 — historical bar/line chart trend. */
async function monthlyTrend(req, res, next) {
  try {
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 12));
    const userId = req.user.id;

    const [incomeRows, expenseRows, investmentRows] = await Promise.all([
      Income.monthlyTotals(userId, limit),
      Expense.monthlyTotals(userId, limit),
      Investment.monthlyTotals(userId, limit),
    ]);

    const monthSet = new Set([
      ...incomeRows.map((r) => r.month),
      ...expenseRows.map((r) => r.month),
      ...investmentRows.map((r) => r.month),
    ]);
    const months = Array.from(monthSet).sort();

    const incMap = new Map(incomeRows.map((r) => [r.month, Number(r.total)]));
    const expMap = new Map(expenseRows.map((r) => [r.month, Number(r.total)]));
    const invMap = new Map(investmentRows.map((r) => [r.month, Number(r.total)]));

    const trend = months.map((m) => {
      const inc = incMap.get(m) || 0;
      const exp = expMap.get(m) || 0;
      const inv = invMap.get(m) || 0;
      return {
        month: m,
        income: round2(inc),
        expenses: round2(exp),
        investments: round2(inv),
        savings: round2(inc - exp),
        net_cash: round2(inc - exp - inv),
      };
    });

    res.json({ trend });
  } catch (err) {
    next(err);
  }
}

/** GET /api/reports/notifications */
async function notifications(req, res, next) {
  try {
    const month = req.query.month || currentMonth();
    const userId = req.user.id;
    const [totalIncome, totalExpenses, rawGoals, reminders] = await Promise.all([
      Income.totalForMonth(userId, month),
      Expense.totalForMonth(userId, month),
      Goal.findAllByUser(userId),
      BillReminder.findAllByUser(userId).catch(() => []),
    ]);
    const savings = calculateSavings(totalIncome, totalExpenses);
    const rows = await buildCategoryRows(userId, month);
    const plan = allocateBudget(totalIncome, rows);
    const goals = rawGoals.map((g) => computeGoal(g, Math.max(0, savings)));
    const notifs = buildNotifications(plan, goals, savings, reminders, new Date(), month);
    res.json({ notifications: notifs });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  summary,
  monthly: monthlyTrend,
  monthlyTrend,
  notifications,
  buildNotifications,
};
