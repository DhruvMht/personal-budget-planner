const { calculateInvestment } = require("./investmentCalculator");

function invalid(field, message) {
  return Object.assign(new Error(`Incorrect value: ${message}`), {
    status: 400, fieldErrors: [{ field, message }],
  });
}

function inferredPrice(amount, units) {
  if (!(Number(amount) > 0) || !(Number(units) > 0)) return null;
  const price = Number((Number(amount) / Number(units)).toFixed(12));
  return price >= 0.000000000001 && price <= 999999999999 ? price : null;
}

// Purchase cost and quantity are derived only from a purchase price, never a live quote.
function normalizePurchase(input, current = null) {
  const amount = input.amount !== undefined ? input.amount : current?.amount;
  const units = input.units !== undefined ? input.units : current?.units;
  const price = input.purchase_price !== undefined ? Number(input.purchase_price)
    : current?.purchase_price ?? inferredPrice(current?.amount, current?.units);
  if (input.purchase_price !== undefined && (!(price >= 0.000000000001) || price > 999999999999 || !Number.isFinite(price))) {
    throw invalid("purchase_price", "Enter a valid positive purchase price per unit.");
  }
  const changed = ["amount", "units", "purchase_price"].some(field => input[field] !== undefined &&
    (!current || Number(input[field]) !== Number(field === "purchase_price" ? current.purchase_price ?? inferredPrice(current.amount, current.units) : current[field])));
  if (current && !changed) return { amount: Number(current.amount), units: current.units, purchase_price: price ?? null };
  if (!price) {
    // Older amount-only clients and calendar payments retain unknown quantities.
    // If both actual values are supplied, their ratio is a known purchase price.
    if (!(Number(amount) > 0)) throw invalid("amount", "Enter invested amount and purchase price, or quantity and purchase price.");
    const derived = inferredPrice(amount, units);
    if (Number(units) > 0 && !derived) throw invalid("purchase_price", "The implied purchase price is outside the supported range.");
    return { amount: Number(amount), units: units == null ? null : Number(units), purchase_price: derived };
  }
  const basis = input.calculation_basis || (input.units !== undefined && input.amount === undefined ? "units" : "amount");
  const calculated = calculateInvestment({ field: basis, value: basis === "units" ? units : amount, price });
  if (!input.calculation_basis && input.amount !== undefined && input.units != null &&
      Math.abs(Number(input.units) - Number(calculated.units)) > 0.000000005) {
    throw invalid("units", "Quantity does not match invested amount and purchase price. Recalculate before saving.");
  }
  return { amount: Number(calculated.amount), units: Number(calculated.units), purchase_price: Number(price) };
}

module.exports = { normalizePurchase, inferredPrice };
