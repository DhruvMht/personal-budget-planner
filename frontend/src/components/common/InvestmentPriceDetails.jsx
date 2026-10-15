import { formatCurrency } from "../../utils/formatCurrency";

function priceDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? date.toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })
    : date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function InvestmentPriceDetails({ investment, connectionFailed = false, currency }) {
  if (!investment.market_provider || !investment.instrument_id) return null;
  const quote = investment.price_metadata || {};
  const stale = connectionFailed || currency !== "INR" || ["stale", "unavailable"].includes(investment.price_status);
  return (
    <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400" aria-label="Market price details">
      {quote.price != null && <p>{formatCurrency(quote.price, "INR")} per {investment.market_provider === "yahoo" ? "share" : "unit"} · {quote.source}</p>}
      <p>Price as of: {priceDate(quote.as_of)}</p>
      {stale ? <p className="text-amber-700 dark:text-amber-400">Outdated — showing last saved valuation. {currency !== "INR" ? "Price tracking requires INR." : quote.error || "Waiting for a successful price update."}</p>
        : investment.price_status === "older" ? <p className="text-amber-700 dark:text-amber-400">Older published price — the market may be closed or the next NAV may not be published yet.</p>
        : <p>Latest available {investment.market_provider === "mfapi" ? "published NAV" : "quote (may be delayed)"}</p>}
    </div>
  );
}
