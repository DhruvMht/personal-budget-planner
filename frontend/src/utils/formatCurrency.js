const LOCALES = { INR: "en-IN", USD: "en-US", EUR: "de-DE", GBP: "en-GB", JPY: "ja-JP" };

export function formatCurrency(value, currency = "INR") {
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat(LOCALES[currency] || "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatMonth(month) {
  if (!month) return "";
  const [y, m] = month.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString("en-US", { month: "short", year: "numeric" });
}

export function currentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function getPrevMonth(month) {
  if (!month) return currentMonth();
  const [y, m] = month.split("-").map(Number);
  let newYear = y;
  let newMonth = m - 1;
  if (newMonth < 1) {
    newMonth = 12;
    newYear -= 1;
  }
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

export function getNextMonth(month) {
  if (!month) return currentMonth();
  const [y, m] = month.split("-").map(Number);
  let newYear = y;
  let newMonth = m + 1;
  if (newMonth > 12) {
    newMonth = 1;
    newYear += 1;
  }
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

export function formatDate(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toLocaleDateString("en-GB");
}

export function toDateInput(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const CURRENCIES = Object.keys(LOCALES);
