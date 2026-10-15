import { useCallback, useEffect, useRef, useState } from "react";
import {
  TrendingUp,
  Plus,
  PieChart as PieIcon,
  Search,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Coins,
  Building,
  Landmark,
  FileSpreadsheet,
  Edit2,
  Trash2,
  Percent,
  Wallet,
  Sparkles,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import useAuth from "../hooks/useAuth";
import { currentDate } from "../utils/currentDate";
import investmentService from "../services/investmentService";
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
import InvestmentPicker from "../components/common/InvestmentPicker";
import InvestmentAmounts from "../components/common/InvestmentAmounts";
import InvestmentPriceDetails from "../components/common/InvestmentPriceDetails";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import CountUp from "../components/common/CountUp";
import { MetricSkeleton, ChartSkeleton, TransactionRowSkeleton } from "../components/common/Skeleton";

const ASSET_COLORS = {
  "Mutual Funds / SIP": "#3b82f6",
  "Stocks / Equities": "#10b981",
  "Fixed Deposit / RD": "#f59e0b",
  "Gold / SGB": "#eab308",
  "PPF / EPF / NPS": "#8b5cf6",
  "Real Estate / REITs": "#ec4899",
  "Cryptocurrency": "#06b6d4",
  "Other Investments": "#64748b",
};

function getAssetIcon(type = "") {
  const lower = type.toLowerCase();
  if (lower.includes("mutual") || lower.includes("sip")) return TrendingUp;
  if (lower.includes("stock") || lower.includes("equit")) return ArrowUpRight;
  if (lower.includes("deposit") || lower.includes("rd") || lower.includes("fd")) return Landmark;
  if (lower.includes("gold") || lower.includes("sgb")) return Coins;
  if (lower.includes("ppf") || lower.includes("nps") || lower.includes("provident")) return ShieldCheck;
  if (lower.includes("estate") || lower.includes("reit")) return Building;
  return Layers;
}

export default function Investments() {
  const { currency } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [selectedType, setSelectedType] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [data, setData] = useState({
    investments: [],
    total: 0,
    total_current_value: 0,
    total_gain: 0,
    types: [],
  });
  const [summary, setSummary] = useState(null);

  // Live Market Price Sync states
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState(null);
  const [priceConnectionFailed, setPriceConnectionFailed] = useState(false);
  const syncBusy = useRef(false);
  const loadSequence = useRef(0);

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [trackMarket, setTrackMarket] = useState(true);
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [calculationBlocked, setCalculationBlocked] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "Mutual Funds / SIP",
    amount: "",
    date: currentDate(),
    notes: "",
    units: "",
    purchase_price: "",
    calculation_basis: "amount",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const loadData = useCallback(async (quiet = false) => {
    const sequence = ++loadSequence.current;
    if (!quiet) { setLoading(true); setError(""); }
    try {
      const filters = {};
      if (month) filters.month = month;
      if (selectedType) filters.type = selectedType;
      if (search) filters.search = search;

      const [listRes, sumRes] = await Promise.all([
        investmentService.list(filters),
        investmentService.summary(month),
      ]);
      if (sequence !== loadSequence.current) return;
      setData(listRes);
      setSummary(sumRes);
    } catch (err) {
      if (sequence === loadSequence.current) setError(getErrorMessage(err));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [month, selectedType, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openCreate() {
    setEditing(null);
    setTrackMarket(currency === "INR");
    setSelectedInstrument(null);
    setCalculationBlocked(false);
    setForm({
      name: "",
      type: "Mutual Funds / SIP",
      amount: "",
      date: currentDate(),
      notes: "",
      units: "",
      purchase_price: "",
      calculation_basis: "amount",
      confirm_actual_quantity: false,
    });
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setCalculationBlocked(false);
    setTrackMarket(currency === "INR" && (Boolean(item.instrument_id) || !["estimated", "accepted"].includes(item.quantity_metadata?.kind)));
    setSelectedInstrument(currency === "INR" && (Boolean(item.instrument_id) || !["estimated", "accepted"].includes(item.quantity_metadata?.kind)) && ["Stocks / Equities", "Mutual Funds / SIP"].includes(item.type) && !item.instrument_id ? null : {
      name: item.name, provider: item.market_provider, instrument_id: item.instrument_id,
    });
    setForm({
      name: item.name,
      type: item.type,
      amount: String(item.amount),
      date: toDateInput(item.date),
      notes: item.notes || "",
      units: item.units ? String(item.units) : "",
      purchase_price: item.purchase_price ? String(item.purchase_price) : "",
      calculation_basis: "amount",
      confirm_actual_quantity: false,
    });
    setFormError("");
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.date) return setFormError("Investment date is required.");
    if (form.date > currentDate()) return setFormError("Incorrect value: Investment date cannot be later than today.");
    if (calculationBlocked) return setFormError("Wait for the calculation, or enter a valid purchase price.");
    const linked = trackMarket && ["Mutual Funds / SIP", "Stocks / Equities"].includes(form.type);
    if (linked && !selectedInstrument?.instrument_id) return setFormError("Choose the exact stock or mutual fund from the search results.");
    if (!selectedInstrument) return setFormError("Choose a search suggestion or confirm a manual investment name.");
    if (!(Number(form.units) > 0) || !(Number(form.purchase_price) > 0)) return setFormError("Enter a positive purchase price and an amount or quantity.");
    if (!form.name.trim()) return setFormError("Please enter an investment name");
    if (!(Number(form.amount) > 0)) return setFormError("Amount must be greater than zero");

    setSaving(true);
    setFormError("");
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        amount: Number(form.amount),
        date: form.date,
        notes: form.notes,
        market_provider: linked ? selectedInstrument.provider : null,
        instrument_id: linked ? selectedInstrument.instrument_id : null,
        units: form.units ? Number(form.units) : null,
        purchase_price: form.purchase_price,
        calculation_basis: form.calculation_basis,
        confirm_actual_quantity: Boolean(form.confirm_actual_quantity),
      };

      if (editing) {
        await investmentService.update(editing.id, payload);
      } else {
        await investmentService.create(payload);
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete investment "${item.name}"?`)) return;
    try {
      await investmentService.remove(item.id);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleSyncAll() {
    if (syncBusy.current) return;
    syncBusy.current = true;
    setSyncingAll(true);
    setSyncFeedback(null);
    setError("");
    try {
      const res = await investmentService.syncPrices();
      setPriceConnectionFailed(false);
      setSyncFeedback({
        portfolio: res.portfolio,
        message: res.updated_count ? `Live value and ROI updated for ${res.updated_count} investment(s).` : "No values or ROI were updated. Previous valuations are unchanged.",
        updated_count: res.updated_count || 0,
        updated: res.updated || [],
        skipped: res.skipped || [],
      });
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
      if (!err.response) setPriceConnectionFailed(true);
    } finally {
      syncBusy.current = false;
      setSyncingAll(false);
    }
  }

  // Chart data for distribution
  const chartData = (summary?.distribution_all_time || []).map((d) => ({
    name: d.type,
    value: d.total_invested,
    color: ASSET_COLORS[d.type] || "#64748b",
  }));

  const allTimeStats = summary?.all_time || {
    total_invested: 0,
    current_value: 0,
    total_gain: 0,
    gain_percent: 0,
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Investments Portfolio
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <TrendingUp className="h-3 w-3" />
              Wealth Building
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Track Mutual Funds/SIP, Stocks, Gold, PPF, FDs and long-term assets for {formatMonth(month)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="field w-auto font-medium"
          />
          <button
            type="button"
            onClick={handleSyncAll}
            disabled={syncingAll || loading || currency !== "INR"}
            aria-describedby="live-roi-requirements"
            title="Update every investment in your portfolio using the latest available prices"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50/80 px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100/90 active:scale-95 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncingAll ? "animate-spin text-emerald-600 dark:text-emerald-400" : "text-emerald-600 dark:text-emerald-400"}`} />
            <span>{syncingAll ? "Updating portfolio…" : "Update all live values & ROI"}</span>
          </button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span>Add Investment</span>
          </Button>
        </div>
      </div>

      <div className="card space-y-2 p-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Live valuation & ROI</h2>
            <p className="mt-1">One click checks your entire portfolio, fetches available market prices, and updates values and ROI across all purchase months.</p>
          </div>
        </div>
        <p id="live-roi-requirements">{currency !== "INR" ? "Live valuation requires an INR portfolio." : "Stocks and mutual funds use their market prices. Anything without a supported price or sufficient details keeps its saved value and is shown as unchanged. Filters do not limit this action."}</p>
        <p>Returns show unrealized gain or loss against your saved purchase cost, excluding fees, taxes and dividends.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {syncFeedback && (
        <div role="status" aria-label="Live valuation result" className={`flex items-start justify-between rounded-xl border p-4 text-xs font-medium shadow-sm animate-fade-in-up ${syncFeedback.skipped?.length ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
          <div className="flex min-w-0 items-start gap-2.5 break-words">
            {syncFeedback.skipped?.length ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            <span>
              <strong>Live valuation:</strong> {syncFeedback.message}
              {syncFeedback.portfolio && <span className="mt-2 block font-semibold">Whole portfolio: {formatCurrency(syncFeedback.portfolio.current_value, currency)} · Profit / loss {formatCurrency(syncFeedback.portfolio.total_gain, currency)} · ROI {Number(syncFeedback.portfolio.gain_percent).toFixed(2)}%{syncFeedback.skipped?.length > 0 ? " (includes unchanged valuations)" : ""}</span>}
              {syncFeedback.source ? ` (${syncFeedback.source})` : ""}
              {syncFeedback.updated?.map(item => <span key={item.id} className="mt-1 block">{item.name}: {formatCurrency(item.new_value, currency)} · ROI {Number(item.roi_percent).toFixed(2)}%</span>)}
              {syncFeedback.skipped?.length > 0 && (
                <span className="mt-2 block text-amber-800 dark:text-amber-300">Unchanged:{syncFeedback.skipped.map(item => <span key={item.id} className="mt-1 block">{item.name}: Unchanged</span>)}</span>
              )}
            </span>
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 font-bold ml-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top 4 Portfolio Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !summary ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <div className="card-interactive flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Total Invested (All-Time)
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  <CountUp value={allTimeStats.total_invested} currency={currency} isCurrency={true} />
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">Principal capital</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <Layers className="h-5 w-5" strokeWidth={2} />
              </div>
            </div>

            <div className="card-interactive flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Current Portfolio Value
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-brand-600 dark:text-brand-400">
                  <CountUp value={allTimeStats.current_value} currency={currency} isCurrency={true} />
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">Latest asset valuation</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
                <Wallet className="h-5 w-5" strokeWidth={2} />
              </div>
            </div>

            <div className="card-interactive flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Overall Returns / Gain
                </p>
                <p
                  className={`mt-1 text-2xl font-bold tabular-nums ${
                    allTimeStats.total_gain >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {allTimeStats.total_gain >= 0 ? "+" : ""}
                  <CountUp value={allTimeStats.total_gain} currency={currency} isCurrency={true} />
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {allTimeStats.gain_percent >= 0 ? "+" : ""}
                  {allTimeStats.gain_percent.toFixed(2)}% ROI
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <TrendingUp className="h-5 w-5" strokeWidth={2} />
              </div>
            </div>

            <div className="card-interactive flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {formatMonth(month)} Contributions
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-purple-600 dark:text-purple-400">
                  <CountUp value={summary?.month_total || 0} currency={currency} isCurrency={true} />
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">Invested this month</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
                <Coins className="h-5 w-5" strokeWidth={2} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Asset Distribution Chart & Summary */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="card lg:col-span-7 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Asset Class Allocation
            </h2>
            <p className="text-xs text-slate-400">
              Distribution across mutual funds, equities, fixed income & commodities
            </p>
          </div>

          {chartData.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No investment allocations recorded yet.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 items-center gap-4 pt-4">
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => formatCurrency(val, currency)}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {chartData.map((item) => {
                  const percent =
                    allTimeStats.total_invested > 0
                      ? ((item.value / allTimeStats.total_invested) * 100).toFixed(1)
                      : 0;
                  return (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                          {item.name}
                        </span>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatCurrency(item.value, currency)}
                        </span>{" "}
                        <span className="text-[11px] text-slate-400">({percent}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Investment Options Supported Card */}
        <div className="card lg:col-span-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Supported Asset Classes
            </h2>
            <p className="text-xs text-slate-400">
              Diversify your portfolio across multiple wealth vehicles
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {Object.entries(ASSET_COLORS).map(([name, color]) => {
              const Icon = getAssetIcon(name);
              return (
                <div
                  key={name}
                  onClick={() => setSelectedType(selectedType === name ? "" : name)}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer transition ${
                    selectedType === name
                      ? "border-brand-500 bg-brand-50/70 dark:border-brand-500 dark:bg-brand-950/40"
                      : "border-slate-100 bg-slate-50/60 hover:bg-slate-100/60 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800/80"
                  }`}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: color }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="truncate font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                    {name}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            💡 <strong>Tip:</strong> Automate regular contributions via monthly SIPs and long-term provident funds to maximize compound growth.
          </div>
        </div>
      </div>

      {/* Filter Bar & Transactions List */}
      <div className="space-y-4">
        <div className="card">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <Input
              as="select"
              label="Asset Class"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="">All Asset Classes</option>
              {Object.keys(ASSET_COLORS).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Input>
            <Input
              label="Search"
              placeholder="Fund name, stock ticker, notes..."
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Investment Records Table / List */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Investment Records
              </h2>
              <p className="text-xs text-slate-400">
                {data.investments.length} investment{data.investments.length === 1 ? "" : "s"} found for {formatMonth(month)}
              </p>
            </div>
            {(selectedType || search) && (
              <button
                onClick={() => {
                  setSelectedType("");
                  setSearch("");
                }}
                className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                Reset Filters
              </button>
            )}
          </div>

          {loading ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <TransactionRowSkeleton />
              <TransactionRowSkeleton />
              <TransactionRowSkeleton />
            </div>
          ) : data.investments.length === 0 ? (
            <EmptyState
              title="No investments found"
              subtitle="Start recording your mutual funds, equity purchases, fixed deposits or gold investments."
              actionLabel="Add Investment"
              onAction={openCreate}
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.investments.map((inv) => {
                const Icon = getAssetIcon(inv.type);
                const color = ASSET_COLORS[inv.type] || "#64748b";
                const gain = Number(inv.current_value ?? inv.amount) - Number(inv.amount);
                const gainPercent =
                  Number(inv.amount) > 0 ? (gain / Number(inv.amount)) * 100 : 0;

                return (
                  <div
                    key={inv.id}
                    role="group"
                    aria-label={`Investment ${inv.name}`}
                    className="grid min-w-0 grid-cols-1 items-center gap-4 rounded-xl px-3 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40 xl:grid-cols-[minmax(0,1fr)_28rem]"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                        style={{ backgroundColor: color }}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p title={inv.name} className="max-w-full truncate text-sm font-bold text-slate-900 dark:text-white">
                            {inv.name}
                          </p>
                          <span className="badge text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {inv.type}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          <span>{formatDate(inv.date)}</span>
                          {inv.instrument_id ? (
                            <span className="text-emerald-600 dark:text-emerald-400">{inv.instrument_id} · {Number(inv.units)} {inv.type === "Stocks / Equities" ? "shares" : "units"}</span>
                          ) : inv.quantity_metadata?.kind !== "estimated" && ["Mutual Funds / SIP", "Stocks / Equities"].includes(inv.type) && (
                            <span>Saved valuation</span>
                          )}
                        </div>
                        {inv.notes && <p title={inv.notes} className="mt-1 truncate text-xs text-slate-400">{inv.notes}</p>}
                        {Number(inv.units) > 0 && <p className="mt-1 break-words text-xs text-slate-500">
                          {inv.quantity_metadata?.kind === "estimated" ? "Estimated quantity: " : "Quantity: "}
                          {Number(inv.units) > 0 && <>{Number(inv.units)} {inv.quantity_metadata?.unit_label || (inv.type === "Stocks / Equities" ? "shares" : "units")}
                            {Number(inv.purchase_price) > 0 && <> at {Number(inv.purchase_price).toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency} {inv.quantity_metadata?.kind === "estimated" ? "implied cost" : "cost"} per unit</>}
                          </>}
                        </p>}
                        {inv.quantity_metadata?.kind === "estimated" && <div className="mt-1 space-y-1 text-xs text-amber-600 dark:text-amber-300">
                          <p>Reference: {inv.quantity_metadata.reference_label || "Assumed unit value"} — {Number(inv.quantity_metadata.reference_price).toLocaleString(undefined, { maximumFractionDigits: 4 })} {inv.quantity_metadata.currency} per unit{inv.quantity_metadata.reference_as_of && ` as of ${inv.quantity_metadata.reference_as_of}`}.</p>
                          <p>{inv.quantity_metadata.note || "Estimated from the saved valuation; actual units are unverified."}</p>
                          {inv.quantity_metadata.source_url && <a className="inline-block underline" href={inv.quantity_metadata.source_url} target="_blank" rel="noopener noreferrer">Reference source</a>}
                        </div>}
                        <InvestmentPriceDetails investment={inv} connectionFailed={priceConnectionFailed} currency={currency} />
                      </div>
                    </div>

                    <div className="grid min-w-0 grid-cols-2 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Invested Amount</p>
                        <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                          {formatCurrency(inv.amount, currency)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-slate-400">Current Valuation</p>
                        <p className="text-sm font-bold tabular-nums text-brand-600 dark:text-brand-400">
                          {formatCurrency(inv.current_value ?? inv.amount, currency)}
                        </p>
                        {(
                          <span
                            className={`text-[10px] font-semibold ${
                              gain >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {gain >= 0 ? "+" : ""}
                            {formatCurrency(gain, currency)} ({gainPercent.toFixed(2)}%) ROI
                          </span>
                        )}
                      </div>

                      <div className="col-span-2 flex items-center justify-end gap-1.5 sm:col-span-1">
                        <button
                          onClick={() => openEdit(inv)}
                          title="Edit investment"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 active:scale-95 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(inv)}
                          title="Delete investment"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700 active:scale-95 dark:border-rose-900/40 dark:text-rose-400 dark:hover:bg-rose-950/50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Investment Modal */}
      <Modal
        open={modalOpen}
        title={editing ? "Edit Investment" : "Add Investment"}
        subtitle="Record an investment allocation to build your portfolio"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={calculationBlocked}>
              {editing ? "Update Investment" : "Save Investment"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {formError}
            </p>
          )}
          <Input
            as="select"
            id="investment-asset-class"
            label="Asset Class / Option"
            value={form.type}
            onChange={(e) => {
              setForm({ ...form, type: e.target.value, name: "", units: "", purchase_price: "", calculation_basis: "amount" });
              setSelectedInstrument(null);
              setTrackMarket(currency === "INR");
              setFormError("");
            }}
          >
            {Object.keys(ASSET_COLORS).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Input>
          <InvestmentPicker key={`picker:${editing?.id || "new"}:${form.type}:${trackMarket}`} type={form.type} selection={selectedInstrument}
              allowManual={!trackMarket || !["Mutual Funds / SIP", "Stocks / Equities"].includes(form.type)} onChange={(instrument) => {
                setSelectedInstrument(instrument);
                setForm(previous => ({ ...previous, name: instrument?.name || "" }));
                setFormError("");
              }} />
          {editing?.quantity_metadata?.kind === "estimated" && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            This record has estimated units and an implied purchase price. Live pricing requires actual purchase details.
            {!trackMarket && currency === "INR" && ["Stocks / Equities", "Mutual Funds / SIP"].includes(form.type) && <button type="button" className="mt-2 block font-semibold underline" onClick={() => { setTrackMarket(true); setSelectedInstrument(null); setForm(previous => ({ ...previous, confirm_actual_quantity: false })); }}>Choose verified stock or fund</button>}

            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={Boolean(form.confirm_actual_quantity)} onChange={event => setForm(previous => ({ ...previous, confirm_actual_quantity: event.target.checked }))} />I have entered my actual quantity and purchase price</label>
          </div>}
          {editing?.quantity_metadata?.kind === "accepted" && !trackMarket && currency === "INR" && ["Stocks / Equities", "Mutual Funds / SIP"].includes(form.type) && <button type="button" className="text-sm font-semibold text-teal-600 underline" onClick={() => { setTrackMarket(true); setSelectedInstrument(null); }}>Select instrument for live pricing</button>}
          <InvestmentAmounts key={`amounts:${editing?.id || "new"}:${form.type}:${trackMarket}`}
            form={form} setForm={setForm} editing={editing} selection={selectedInstrument}
            linked={trackMarket && ["Mutual Funds / SIP", "Stocks / Equities"].includes(form.type)}
            onCalculationState={setCalculationBlocked} />
          <Input
            id="investment-date"
            label="Investment Date"
            type="date"
            required
            max={currentDate()}
            error={form.date > currentDate() ? "Investment date cannot be later than today." : ""}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <Input
            id="investment-notes"
            label="Notes / Folio (Optional)"
            placeholder="e.g. Folio 12345"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  );
}
