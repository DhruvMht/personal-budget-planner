const { DECIMAL } = require("../validation/characters");

function decimalParts(value) {
  const text = typeof value === "number" ? value.toFixed(12) : value.trim().replace(/^\+/, "");
  const [whole, fraction = ""] = text.split(".");
  return { value: BigInt((whole || "0") + fraction), scale: 10n ** BigInt(fraction.length) };
}

function roundedDivision(numerator, denominator) {
  return (numerator * 2n + denominator) / (2n * denominator);
}

function calculateInvestment({ field, value, price } = {}) {
  const unitPrice = Number(price);
  const input = Number(value);
  if (!["amount", "units"].includes(field) ||
      !["string", "number"].includes(typeof value) || String(value).trim() === "" ||
      !["string", "number"].includes(typeof price) ||
      (typeof value === "string" && !DECIMAL.test(value.trim())) ||
      (typeof price === "string" && !DECIMAL.test(price.trim())) ||
      !Number.isFinite(unitPrice) || unitPrice < 0.000000000001 || unitPrice > 999999999999 ||
      !Number.isFinite(input) || input <= 0) {
    throw Object.assign(new Error("Enter a positive price and amount or number of shares / units."), { status: 400 });
  }
  if (input >= 1e12 || String(value).length > 100 || String(price).length > 100) {
    throw Object.assign(new Error("The calculated amount or quantity is outside the supported range."), { status: 400 });
  }
  // Integer decimal arithmetic prevents binary floating-point half-cent errors.
  const v = decimalParts(value), p = decimalParts(price);
  const cents = field === "units" ? roundedDivision(v.value * p.value * 100n, v.scale * p.scale)
    : roundedDivision(v.value * 100n, v.scale);
  const quantity = field === "amount" ? roundedDivision(v.value * p.scale * 100000000n, v.scale * p.value)
    : roundedDivision(v.value * 100000000n, v.scale);
  const roundedAmount = Number(cents) / 100;
  const roundedUnits = Number(quantity) / 100000000;
  if (!Number.isFinite(roundedAmount) || roundedAmount < 0.01 || roundedAmount >= 1e10 ||
      !Number.isFinite(roundedUnits) || roundedUnits < 0.00000001 || roundedUnits >= 1e12) {
    throw Object.assign(new Error("The calculated amount or quantity is outside the supported range."), { status: 400 });
  }
  return { amount: roundedAmount.toFixed(2), units: String(roundedUnits) };
}

module.exports = { calculateInvestment };
