const BillReminder = require("../models/BillReminder");
const Expense = require("../models/Expense");
const Income = require("../models/Income");
const Investment = require("../models/Investment");
const ExpenseCategory = require("../models/ExpenseCategory");
const { pool } = require("../config/db");
const { validateSchema, rejectValidation } = require("../validation/validate");
const { calendarPayments } = require("../utils/calendarPayments");
const { round2 } = require("../utils/budgetCalculator");

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

async function getMonthCalendar(req, res, next) {
  try {
    const month = req.query.month || currentMonth();
    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const maxDays = daysInMonth(year, monthNum);

    const todayStr = new Date().toISOString().slice(0, 10);

    const [reminders, expenses, incomes, investments] = await Promise.all([
      BillReminder.findAllByUser(req.user.id),
      Expense.findAllByUser(req.user.id, { month }),
      Income.findAllByUser(req.user.id, month),
      Investment.findAllByUser(req.user.id, { month }),
    ]);

    const activeReminders = reminders.filter(r => r.is_recurring || currentMonthForDate(r.created_at) === month);
    const payments = calendarPayments(activeReminders, expenses, incomes, investments);

    // Process reminders into monthly calendar events
    let totalScheduled = 0;
    let totalPaid = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;

    const calendarEvents = [];
    const dayEventsMap = {};
    for (let d = 1; d <= maxDays; d++) {
      dayEventsMap[d] = [];
    }

    for (const r of activeReminders) {
      const dueDay = Math.min(r.due_day, maxDays);
      const dayPad = String(dueDay).padStart(2, "0");
      const dueDate = `${month}-${dayPad}`;

      totalScheduled = round2(totalScheduled + Number(r.amount));

      const payment = payments.get(r.id);
      const isPaid = payment.paid >= Number(r.amount);
      totalPaid = round2(totalPaid + payment.paid);

      const isOverdue = !isPaid && dueDate < todayStr;
      const isDueToday = !isPaid && dueDate === todayStr;
      const isUpcoming = !isPaid && dueDate > todayStr;

      if (isPaid) {
        paidCount++;
      } else {
        pendingCount++;
        if (isOverdue) overdueCount++;
      }

      const event = {
        id: r.id,
        name: r.name,
        amount: Number(r.amount),
        due_day: dueDay,
        due_date: dueDate,
        category_id: r.category_id,
        category_name: r.category_name,
        type: r.type,
        is_recurring: r.is_recurring,
        notes: r.notes,
        status: isPaid ? "paid" : isOverdue ? "overdue" : isDueToday ? "due_today" : "upcoming",
        paid_amount: payment.paid,
        remaining_amount: round2(Math.max(0, Number(r.amount) - payment.paid)),
        matched_expense_id: payment.matchedExpense,
      };

      calendarEvents.push(event);
      if (dayEventsMap[dueDay]) {
        dayEventsMap[dueDay].push(event);
      }
    }

    // Sort upcoming events to find the very next bill
    const upcomingEvents = calendarEvents
      .filter((e) => e.status !== "paid")
      .sort((a, b) => a.due_day - b.due_day);
    const nextBill = upcomingEvents[0] || null;

    res.json({
      month,
      year,
      month_num: monthNum,
      days_in_month: maxDays,
      today: todayStr,
      metrics: {
        total_scheduled: totalScheduled,
        total_paid: totalPaid,
        total_pending: round2(Math.max(0, totalScheduled - totalPaid)),
        paid_count: paidCount,
        pending_count: pendingCount,
        overdue_count: overdueCount,
        next_bill: nextBill,
      },
      events: calendarEvents,
      day_events: dayEventsMap,
      reminders,
    });
  } catch (err) {
    next(err);
  }
}

async function createReminder(req, res, next) {
  try {
    const { name, amount, due_day, category_id, type, is_recurring, notes } = req.body;
    if (!name || !(Number(amount) > 0) || !(Number(due_day) >= 1 && Number(due_day) <= 31)) {
      return res.status(400).json({ message: "Please provide valid name, amount, and due day (1-31)." });
    }

    if (category_id && !(await ExpenseCategory.findById(category_id, req.user.id))) {
      return res.status(400).json({ message: "Incorrect value: choose one of your own categories." });
    }
    const reminder = await BillReminder.create(req.user.id, {
      name: name.trim(),
      amount: Number(amount),
      due_day: Number(due_day),
      category_id: category_id ? Number(category_id) : null,
      type: type || "fixed",
      is_recurring: is_recurring !== undefined ? (is_recurring ? 1 : 0) : 1,
      notes: notes || "",
    });

    res.status(201).json({ reminder });
  } catch (err) {
    next(err);
  }
}

async function updateReminder(req, res, next) {
  try {
    const reminder = await BillReminder.findById(req.params.id, req.user.id);
    if (!reminder) return res.status(404).json({ message: "Reminder not found" });

    if (req.body.category_id && !(await ExpenseCategory.findById(req.body.category_id, req.user.id))) {
      return res.status(400).json({ message: "Incorrect value: choose one of your own categories." });
    }
    const updated = await BillReminder.update(req.params.id, req.user.id, {
      ...reminder, ...req.body,
      name: req.body.name !== undefined ? req.body.name.trim() : reminder.name,
    });
    res.json({ reminder: updated });
  } catch (err) {
    next(err);
  }
}

async function deleteReminder(req, res, next) {
  try {
    const ok = await BillReminder.remove(req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ message: "Reminder not found" });
    res.json({ message: "Reminder deleted successfully" });
  } catch (err) {
    next(err);
  }
}

async function quickPay(req, res, next) {
  let connection;
  try {
    const { reminder_id, amount, date, description, category_id, type } = req.body;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute("SELECT * FROM BillReminders WHERE id = ? AND user_id = ? FOR UPDATE", [reminder_id, req.user.id]);
    const reminder = rows[0];
    if (!reminder) return res.status(404).json({ message: "Reminder not found" });
    if (type && type !== reminder.type) return res.status(400).json({ message: "Incorrect value: payment type must match the reminder." });

    const payDate = date || new Date().toISOString().slice(0, 10);
    const payAmount = Number(amount ?? reminder.amount);
    const month = payDate.slice(0, 7);
    if (!reminder.is_recurring && currentMonthForDate(reminder.created_at) !== month) return res.status(400).json({ message: "Incorrect value: a one-time reminder can only be paid in its scheduled month." });
    const table = reminder.type === "income" ? "Income" : reminder.type === "investment" ? "Investments" : "Expenses";
    const monthColumn = table === "Expenses" ? "DATE_FORMAT(date, '%Y-%m')" : "month";
    const [existing] = await connection.execute(`SELECT COALESCE(SUM(amount),0) total FROM ${table} WHERE user_id = ? AND reminder_id = ? AND ${monthColumn} = ?`, [req.user.id, reminder.id, month]);
    if (Number(existing[0].total) >= Number(reminder.amount)) return res.status(409).json({ message: "This reminder has already been paid for that month." });

    if (reminder.type === "income") {
      const payload = { source: reminder.name, amount: payAmount, month };
      const errors = validateSchema("income", payload);
      if (errors.length) return rejectValidation(res, errors);
      const income = await Income.create(req.user.id, { ...payload, reminder_id: reminder.id }, connection);
      await connection.commit();
      return res.json({ message: "Income recorded successfully", income });
    }

    if (reminder.type === "investment") {
      const inv = await Investment.create(req.user.id, {
        name: reminder.name,
        type: "Mutual Funds / SIP",
        amount: payAmount,
        current_value: payAmount,
        date: payDate,
        notes: description || `SIP payment for ${reminder.name}`,
        reminder_id: reminder.id,
      }, connection);
      await connection.commit();
      return res.json({ message: "Investment recorded successfully", investment: inv });
    }

    // Default: Log as expense
    const catId = category_id || reminder.category_id;
    let targetCatId = catId;

    const [categories] = await connection.execute("SELECT id FROM ExpenseCategory WHERE id = ? AND user_id = ?", [targetCatId || null, req.user.id]);
    if (!categories.length) {
      return res.status(400).json({ message: "Incorrect value: choose one of your own expense categories." });
    }

    const exp = await Expense.create(req.user.id, {
      category_id: targetCatId,
      amount: payAmount,
      date: payDate,
      description: description || `${reminder.name} Payment`,
      reminder_id: reminder.id,
    }, connection);
    await connection.commit();

    res.json({ message: "Bill marked as paid and logged into expenses", expense: exp });
  } catch (err) {
    next(err);
  } finally {
    if (connection) { await connection.rollback(); connection.release(); }
  }
}

function currentMonthForDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

module.exports = {
  getMonthCalendar,
  createReminder,
  updateReminder,
  deleteReminder,
  quickPay,
};
