import { useCallback, useEffect, useState } from "react";
import {
  Lock,
  Plus,
  Calendar,
  Home,
  Shield,
  CreditCard,
  Zap,
  Wifi,
  Landmark,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Edit2,
  Trash2,
  Check,
  Sparkles,
  ArrowUpRight,
  SlidersHorizontal,
  Lightbulb,
} from "lucide-react";
import useAuth from "../hooks/useAuth";
import expenseService, { categoryService } from "../services/expenseService";
import budgetService from "../services/budgetService";
import billCalendarService from "../services/billCalendarService";
import { getErrorMessage } from "../services/api";
import {
  currentMonth,
  formatCurrency,
  formatDate,
  formatMonth,
  toDateInput,
} from "../utils/formatCurrency";
import Button from "../components/common/Button";
import Input from "../components/common/Input";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import CountUp from "../components/common/CountUp";
import { MetricSkeleton, TransactionRowSkeleton } from "../components/common/Skeleton";

function getCommitmentIcon(name = "") {
  const lower = name.toLowerCase();
  if (lower.includes("rent") || lower.includes("house") || lower.includes("flat")) return Home;
  if (lower.includes("insurance") || lower.includes("policy") || lower.includes("lic")) return Shield;
  if (lower.includes("emi") || lower.includes("loan") || lower.includes("mortgage")) return Landmark;
  if (lower.includes("electric") || lower.includes("power") || lower.includes("utility")) return Zap;
  if (lower.includes("internet") || lower.includes("wifi") || lower.includes("broadband")) return Wifi;
  if (lower.includes("card") || lower.includes("bill")) return CreditCard;
  return Receipt;
}

function getAlgorithmicRatioInfo(categoryName) {
  const lower = String(categoryName || "").toLowerCase();
  if (lower.includes("emi") || lower.includes("loan")) {
    return { ratio: 0.20, label: "20% of Income (Safe EMI Ceiling)" };
  }
  if (lower.includes("insurance") || lower.includes("policy")) {
    return { ratio: 0.05, label: "5% of Income (Health/Life Protection)" };
  }
  if (lower.includes("rent") || lower.includes("house")) {
    return { ratio: 0.30, label: "30% of Income (Housing Standard)" };
  }
  if (lower.includes("internet") || lower.includes("wifi")) {
    return { ratio: 0.02, label: "2% of Income (Connectivity)" };
  }
  return null;
}

function getCategoryDueDay(cat, reminders = []) {
  const matched = reminders.find(
    (r) =>
      r.category_id === cat.id ||
      r.name.toLowerCase().includes(cat.name.toLowerCase()) ||
      cat.name.toLowerCase().includes(r.name.toLowerCase())
  );
  if (matched) return Number(matched.due_day);
  const lower = cat.name.toLowerCase();
  if (lower.includes("rent")) return 1;
  if (lower.includes("emi") || lower.includes("loan")) return 5;
  if (lower.includes("insurance")) return 15;
  if (lower.includes("internet") || lower.includes("wifi")) return 20;
  return 1;
}

export default function FixedCommitments() {
  const { currency } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applyingAlgo, setApplyingAlgo] = useState(false);

  // Data states
  const [fixedCategories, setFixedCategories] = useState([]);
  const [budgetPlan, setBudgetPlan] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [reminders, setReminders] = useState([]);

  // Modals
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", date: toDateInput(new Date()), description: "" });
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState("");

  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [limitTarget, setLimitTarget] = useState(null);
  const [limitForm, setLimitForm] = useState({ monthly_limit: "", priority: "High" });
  const [limitSaving, setLimitSaving] = useState(false);
  const [limitError, setLimitError] = useState("");

  const [newCatModalOpen, setNewCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSaving, setNewCatSaving] = useState(false);
  const [newCatError, setNewCatError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catRes, planRes, expRes, calRes] = await Promise.all([
        categoryService.list(),
        budgetService.list(month),
        expenseService.list({ month }),
        billCalendarService.getMonth(month).catch(() => ({ reminders: [] })),
      ]);

      const fixedCats = catRes.categories.filter((c) => c.type === "fixed");
      setFixedCategories(fixedCats);
      setBudgetPlan(planRes);
      setReminders(calRes?.reminders || []);

      // Filter only fixed transactions
      const fixedCatIds = new Set(fixedCats.map((c) => c.id));
      const fixedTxs = expRes.expenses.filter((e) => fixedCatIds.has(e.category_id));
      setTransactions(fixedTxs);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute fixed allocations
  const allocationsMap = new Map(
    (budgetPlan?.allocations || []).map((a) => [a.category_id, a])
  );

  const totalIncome = Number(budgetPlan?.total_income || 0);

  // Date timing calculations
  const today = new Date();
  const currentYM = currentMonth();
  const todayDate = today.getDate();
  const isCurrentMonth = month === currentYM;
  const isPastMonth = month < currentYM;
  const isFutureMonth = month > currentYM;

  const commitmentCards = fixedCategories.map((cat) => {
    const allocation = allocationsMap.get(cat.id);
    const limit = Number(allocation?.monthly_limit || 0);
    const spent = Number(allocation?.spent || 0);
    const remaining = Math.max(0, limit - spent);
    const percent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
    
    // Status resolution
    const isPaidInFull = (limit > 0 && spent >= limit) || (spent > 0 && remaining === 0);
    const isPartiallyPaid = spent > 0 && spent < limit;
    const isPending = spent === 0;
    const isOverpaid = limit > 0 && spent > limit;

    const dueDay = getCategoryDueDay(cat, reminders);
    
    // Alert logic: Red Alert only if pending/unpaid AND beyond due date!
    const isOverdue = !isPaidInFull && (isPastMonth || (isCurrentMonth && todayDate > dueDay));
    const isDueToday = !isPaidInFull && isCurrentMonth && todayDate === dueDay;
    const isUpcoming = !isPaidInFull && (isFutureMonth || (isCurrentMonth && todayDate < dueDay));
    const daysLate = isCurrentMonth && todayDate > dueDay ? todayDate - dueDay : null;

    const algoInfo = getAlgorithmicRatioInfo(cat.name);
    const algoBenchmarkAmount =
      algoInfo && totalIncome > 0 ? Math.round(totalIncome * algoInfo.ratio) : null;

    return {
      category: cat,
      allocation,
      limit,
      spent,
      remaining,
      percent,
      dueDay,
      isPaidInFull,
      isPartiallyPaid,
      isPending,
      isOverpaid,
      isOverdue,
      isDueToday,
      isUpcoming,
      daysLate,
      algoInfo,
      algoBenchmarkAmount,
    };
  });

  // Overview metrics
  const totalCommitted = commitmentCards.reduce((acc, c) => acc + c.limit, 0);
  const totalPaid = commitmentCards.reduce((acc, c) => acc + c.spent, 0);
  const totalPending = Math.max(0, totalCommitted - totalPaid);
  const overdueCards = commitmentCards.filter((c) => c.isOverdue);
  const overdueCount = overdueCards.length;

  function openPayModal(card) {
    setPayTarget(card);
    setPayForm({
      amount: card.remaining > 0 ? String(card.remaining) : card.limit > 0 ? String(card.limit) : "",
      date: toDateInput(new Date()),
      description: `${card.category.name} payment for ${formatMonth(month)}`,
    });
    setPayError("");
    setPayModalOpen(true);
  }

  async function handleSavePayment() {
    if (!(Number(payForm.amount) > 0)) {
      return setPayError("Please enter a valid payment amount greater than zero.");
    }
    setPaySaving(true);
    setPayError("");
    try {
      await expenseService.create({
        category_id: payTarget.category.id,
        amount: Number(payForm.amount),
        date: payForm.date,
        description: payForm.description,
      });
      setPayModalOpen(false);
      await loadData();
    } catch (err) {
      setPayError(getErrorMessage(err));
    } finally {
      setPaySaving(false);
    }
  }

  function openLimitModal(card) {
    setLimitTarget(card);
    setLimitForm({
      monthly_limit: String(card.limit ?? card.algoBenchmarkAmount ?? ""),
      priority: card.allocation?.priority || "High",
    });
    setLimitError("");
    setLimitModalOpen(true);
  }

  async function handleSaveLimit() {
    if (String(limitForm.monthly_limit).trim() === "" || !Number.isFinite(Number(limitForm.monthly_limit))) {
      setLimitError("Incorrect value: enter a valid monthly limit.");
      return;
    }
    if (Number(limitForm.monthly_limit) < 0) {
      return setLimitError("Limit cannot be negative.");
    }
    setLimitSaving(true);
    setLimitError("");
    try {
      await budgetService.save({
        category_id: limitTarget.category.id,
        monthly_limit: Number(limitForm.monthly_limit) || 0,
        priority: limitForm.priority,
      });
      setLimitModalOpen(false);
      await loadData();
    } catch (err) {
      setLimitError(getErrorMessage(err));
    } finally {
      setLimitSaving(false);
    }
  }

  async function handleApplyAlgorithmicLimits() {
    setApplyingAlgo(true);
    setError("");
    try {
      await budgetService.applyRecommendation(month);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setApplyingAlgo(false);
    }
  }

  async function handleCreateCommitment() {
    if (!newCatName.trim()) {
      return setNewCatError("Please provide a commitment name (e.g. Car Loan).");
    }
    setNewCatSaving(true);
    setNewCatError("");
    try {
      await categoryService.create({
        name: newCatName.trim(),
        type: "fixed",
      });
      setNewCatName("");
      setNewCatModalOpen(false);
      await loadData();
    } catch (err) {
      setNewCatError(getErrorMessage(err));
    } finally {
      setNewCatSaving(false);
    }
  }

  async function handleDeleteTransaction(tx) {
    if (!window.confirm("Delete this payment transaction?")) return;
    try {
      await expenseService.remove(tx.id);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Fixed Commitments
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Lock className="h-3 w-3" />
              Non-Discretionary
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Mandatory monthly obligations (Rent, EMI: 20% Income, Insurance: 5% Income, Utilities) for {formatMonth(month)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="field w-auto font-medium"
          />
          <Button
            variant="secondary"
            onClick={handleApplyAlgorithmicLimits}
            loading={applyingAlgo}
            title="Auto-calculate EMI (20%), Insurance (5%), and Rent (30%) from your income"
          >
            <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <span>Apply Algorithmic Limits</span>
          </Button>
          <Button variant="secondary" onClick={() => setNewCatModalOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>New Commitment</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Top 3 Summary Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        {loading ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <div className="card-interactive flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Total Committed
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  <CountUp value={totalCommitted} currency={currency} isCurrency={true} />
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {commitmentCards.length} recurring commitment{commitmentCards.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Lock className="h-5 w-5" strokeWidth={2} />
              </div>
            </div>

            <div className="card-interactive flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Paid This Month
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  <CountUp value={totalPaid} currency={currency} isCurrency={true} />
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  ✓ {commitmentCards.filter((c) => c.isPaidInFull).length} of {commitmentCards.length} paid in full
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 ring-1 ring-emerald-500/20">
                <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
              </div>
            </div>

            <div
              className={`card-interactive flex items-center justify-between ${
                overdueCount > 0 ? "border-rose-300 bg-rose-50/30 dark:border-rose-900/60 dark:bg-rose-950/20" : ""
              }`}
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Pending / Due
                </p>
                <p
                  className={`mt-1 text-2xl font-bold tabular-nums ${
                    overdueCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  <CountUp value={totalPending} currency={currency} isCurrency={true} />
                </p>
                <p
                  className={`mt-0.5 text-[11px] font-bold ${
                    overdueCount > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-400"
                  }`}
                >
                  {overdueCount > 0
                    ? `⚠️ ${overdueCount} Overdue (Due Date Passed)`
                    : totalPending === 0
                    ? "✓ All commitments paid!"
                    : "Scheduled on time"}
                </p>
              </div>
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                  overdueCount > 0
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 ring-1 ring-rose-500/30"
                    : "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 ring-1 ring-amber-500/20"
                }`}
              >
                {overdueCount > 0 ? (
                  <AlertTriangle className="h-5 w-5" strokeWidth={2.2} />
                ) : (
                  <Clock className="h-5 w-5" strokeWidth={2} />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Commitment Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Commitment Breakdown & Algorithmic Limits
          </h2>
          <p className="text-xs text-slate-400">
            EMI (20%) · Insurance (5%) · Rent (30%)
          </p>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </div>
        ) : commitmentCards.length === 0 ? (
          <EmptyState
            title="No fixed commitments found"
            subtitle="Add recurring commitments like Rent, EMI, or Insurance to organize your monthly obligations."
            actionLabel="Add Commitment"
            onAction={() => setNewCatModalOpen(true)}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {commitmentCards.map((card) => {
              const Icon = getCommitmentIcon(card.category.name);

              return (
                <div
                  key={card.category.id}
                  className={`card-interactive flex flex-col justify-between transition-all ${
                    card.isOverdue
                      ? "border-rose-400/90 bg-rose-50/25 dark:border-rose-800 dark:bg-rose-950/15 shadow-card"
                      : card.isPaidInFull
                      ? "border-emerald-200/80 dark:border-emerald-900/40"
                      : ""
                  }`}
                >
                  <div>
                    {/* Top Row: Icon, Name & Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            card.isPaidInFull
                              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 ring-1 ring-emerald-500/20"
                              : card.isOverdue
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 ring-1 ring-rose-500/40"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          }`}
                        >
                          <Icon className="h-5 w-5" strokeWidth={2} />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            {card.category.name}
                          </h3>
                          <span
                            className={`badge mt-0.5 text-[10px] uppercase font-bold ${
                              card.isPaidInFull
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 ring-1 ring-emerald-500/20"
                                : card.isOverdue
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 ring-1 ring-rose-500/40 animate-pulse"
                                : card.isDueToday
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 ring-1 ring-amber-400"
                                : card.isPartiallyPaid
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {card.isPaidInFull
                              ? "✓ Paid in Full"
                              : card.isOverdue
                              ? `⚠️ Overdue (Due Day ${card.dueDay})`
                              : card.isDueToday
                              ? `⚡ Due Today (Day ${card.dueDay})`
                              : card.isPartiallyPaid
                              ? "Partially Paid"
                              : `🕒 Due on Day ${card.dueDay}`}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => openLimitModal(card)}
                        title="Edit monthly commitment limit"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 active:scale-95 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Overdue Alert Banner (Only when pending beyond due date!) */}
                    {card.isOverdue && (
                      <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-rose-300/80 bg-rose-100/70 p-2 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        <span>
                          Payment Overdue! Due on Day {card.dueDay}
                          {card.daysLate ? ` (${card.daysLate} day${card.daysLate === 1 ? "" : "s"} late)` : ""}
                        </span>
                      </div>
                    )}

                    {/* Algorithmic Benchmark Pill */}
                    {card.algoInfo && (
                      <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-brand-50/70 px-2.5 py-1 text-[11px] text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                        <Lightbulb className="h-3 w-3 shrink-0" />
                        <span className="font-semibold">{card.algoInfo.label}:</span>
                        <span>{formatCurrency(card.algoBenchmarkAmount || 0, currency)}</span>
                      </div>
                    )}

                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-500 dark:text-slate-400">Payment Progress</span>
                        <span className="tabular-nums text-slate-800 dark:text-slate-200">
                          {card.limit > 0 ? `${card.percent}%` : "No limit set"}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${
                            card.isPaidInFull
                              ? "bg-emerald-500"
                              : card.isOverdue
                              ? "bg-rose-500"
                              : card.isPartiallyPaid
                              ? "bg-amber-500"
                              : "bg-slate-300 dark:bg-slate-600"
                          }`}
                          style={{ width: `${card.percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Numerical Stats */}
                    <dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50/70 p-3 text-xs dark:bg-slate-800/40">
                      <div>
                        <dt className="text-slate-400">Commitment Limit</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                          {card.limit > 0 ? formatCurrency(card.limit, currency) : "Not set"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Paid This Month</dt>
                        <dd
                          className={`mt-0.5 font-semibold tabular-nums ${
                            card.isPaidInFull ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-200"
                          }`}
                        >
                          {formatCurrency(card.spent, currency)}
                        </dd>
                      </div>
                      <div className="col-span-2 border-t border-slate-200/60 pt-2 dark:border-slate-700/60">
                        <dt className="text-slate-400">Remaining Due</dt>
                        <dd
                          className={`mt-0.5 font-bold tabular-nums ${
                            card.isOverdue
                              ? "text-rose-600 dark:text-rose-400"
                              : card.isPaidInFull
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-900 dark:text-white"
                          }`}
                        >
                          {formatCurrency(card.remaining, currency)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-2">
                    <Button
                      variant={card.isOverdue ? "danger" : card.isPaidInFull ? "secondary" : "primary"}
                      size="sm"
                      className="w-full justify-center"
                      onClick={() => openPayModal(card)}
                    >
                      {card.isPaidInFull ? (
                        <>
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add Extra Payment</span>
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Record Payment</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment History Table / List */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Fixed Commitment Payment History
            </h2>
            <p className="text-xs text-slate-400">
              Transactions recorded for fixed commitments in {formatMonth(month)}
            </p>
          </div>
          <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold">
            {transactions.length} record{transactions.length === 1 ? "" : "s"}
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No fixed commitment payments logged for this month yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 text-slate-400 dark:border-slate-800 font-semibold">
                <tr>
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Commitment</th>
                  <th className="pb-3 font-semibold">Description</th>
                  <th className="pb-3 font-semibold text-right">Amount</th>
                  <th className="pb-3 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 text-slate-500 dark:text-slate-400">
                      {formatDate(tx.date)}
                    </td>
                    <td className="py-3 font-bold text-slate-900 dark:text-white">
                      {tx.category_name}
                    </td>
                    <td className="py-3 text-slate-500 dark:text-slate-400">
                      {tx.description || "—"}
                    </td>
                    <td className="py-3 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(tx.amount, currency)}
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => handleDeleteTransaction(tx)}
                        title="Delete transaction"
                        className="rounded-lg p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pay Modal */}
      <Modal
        open={payModalOpen}
        title={`Record Payment — ${payTarget?.category?.name || ""}`}
        subtitle={`Log payment for ${formatMonth(month)} (Remaining: ${formatCurrency(
          payTarget?.remaining || 0,
          currency
        )})`}
        onClose={() => setPayModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePayment} loading={paySaving}>
              Confirm Payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {payError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {payError}
            </p>
          )}

          <Input
            label="Payment Amount"
            type="number"
            min="0.01"
            step="0.01"
            value={payForm.amount}
            onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
          />

          <Input
            label="Payment Date"
            type="date"
            value={payForm.date}
            onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
          />

          <Input
            label="Description / Notes"
            value={payForm.description}
            onChange={(e) => setPayForm({ ...payForm, description: e.target.value })}
            placeholder="e.g. HDFC Payment Reference 1234"
          />
        </div>
      </Modal>

      {/* Limit Modal */}
      <Modal
        open={limitModalOpen}
        title={`Set Commitment Limit — ${limitTarget?.category?.name || ""}`}
        subtitle="Configure the monthly mandatory payment requirement"
        onClose={() => setLimitModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLimitModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveLimit} loading={limitSaving}>
              Save Limit
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {limitError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {limitError}
            </p>
          )}

          {limitTarget?.algoInfo && (
            <div className="rounded-lg bg-brand-50/80 p-3 text-xs text-brand-800 dark:bg-brand-950/50 dark:text-brand-300">
              <p className="font-semibold">Algorithmic Recommendation:</p>
              <p className="mt-0.5">
                {limitTarget.algoInfo.label}:{" "}
                <strong>{formatCurrency(limitTarget.algoBenchmarkAmount || 0, currency)}</strong>
              </p>
            </div>
          )}

          <Input
            label="Monthly Limit Amount"
            type="number"
            min="0"
            step="0.01"
            value={limitForm.monthly_limit}
            onChange={(e) => setLimitForm({ ...limitForm, monthly_limit: e.target.value })}
          />

          <Input
            as="select"
            label="Priority Weight"
            value={limitForm.priority}
            onChange={(e) => setLimitForm({ ...limitForm, priority: e.target.value })}
          >
            <option value="Very High">Very High (Non-negotiable, e.g. Rent, EMI)</option>
            <option value="High">High (Crucial, e.g. Insurance, Utilities)</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </Input>
        </div>
      </Modal>

      {/* New Commitment Modal */}
      <Modal
        open={newCatModalOpen}
        title="Add New Fixed Commitment"
        subtitle="Add a new recurring mandatory monthly category"
        onClose={() => setNewCatModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewCatModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCommitment} loading={newCatSaving}>
              Add Commitment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {newCatError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {newCatError}
            </p>
          )}

          <Input
            label="Commitment Name"
            placeholder="e.g. Car Loan EMI, School Tuition, Life Insurance"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
