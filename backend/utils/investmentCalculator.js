function calculateInvestment({ field, value, price }) {
  const unitPrice = Number(price);
  const input = Number(value);
  if (!["amount", "units"].includes(field) ||
      !["string", "number"].includes(typeof value) || String(value).trim() === "" ||
      !["string", "number"].includes(typeof price) ||
      !Number.isFinite(unitPrice) || unitPrice <= 0 ||
      !Number.isFinite(input) || input <= 0) {
    throw Object.assign(new Error("Enter a positive price and amount or number of shares / units."), { status: 400 });
  }
  const amount = field === "units" ? input * unitPrice : input;
  const units = field === "amount" ? input / unitPrice : input;
  const roundedAmount = Number(amount.toFixed(2));
  const roundedUnits = Number(units.toFixed(8));
  if (!Number.isFinite(roundedAmount) || roundedAmount < 0.01 || roundedAmount >= 1e10 ||
      !Number.isFinite(roundedUnits) || roundedUnits < 0.00000001 || roundedUnits >= 1e12) {
    throw Object.assign(new Error("The calculated amount or quantity is outside the supported range."), { status: 400 });
  }
  return { amount: roundedAmount.toFixed(2), units: String(roundedUnits) };
}

module.exports = { calculateInvestment };
