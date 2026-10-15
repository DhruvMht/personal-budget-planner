const Investment = require("../models/Investment");
const { round2 } = require("../utils/budgetCalculator");
const { refreshHolding, refreshPortfolio } = require("../services/investmentPriceRefresh");
const { withPriceStatus } = require("../utils/investmentPriceStatus");
const { searchInstruments, getQuote, validateMarketSelection } = require("../services/marketInstrumentService");
const { calculateInvestment } = require("../utils/investmentCalculator");
const { normalizePurchase } = require("../utils/investmentPurchase");
const { isEstimatedQuantity, quantityMetadata } = require("../utils/estimatedQuantity");
const { MANUAL_CATALOG, manualSuggestions } = require("../services/investmentCatalog");

async function getInstrumentQuote(req, res, next) {
  try {
    res.json({ quote: await getQuote(req.query.provider, req.query.instrument_id) });
  } catch (err) { next(err); }
}

function calculate(req, res, next) {
  try {
    res.json(calculateInvestment(req.body));
  } catch (err) { next(err); }
}

async function searchMarket(req, res, next) {
  try {
    let results = await searchInstruments(req.query.type, req.query.q);
    if (Object.hasOwn(MANUAL_CATALOG, req.query.type)) {
      const saved = await Investment.findAllByUser(req.user.id, { type: req.query.type, search: req.query.q });
      results = manualSuggestions(req.query.type, req.query.q, saved.map(item => item.name));
    }
    res.json({ results });
  } catch (err) { next(err); }
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

async function list(req, res, next) {
  try {
    const { month, type, search } = req.query;
    const items = await Investment.findAllByUser(req.user.id, { month, type, search });
    const total = round2(items.reduce((s, i) => s + Number(i.amount), 0));
    const totalValue = round2(items.reduce((s, i) => s + Number(i.current_value ?? i.amount), 0));

    res.json({
      investments: items.map(item => withPriceStatus(item)),
      total,
      total_current_value: totalValue,
      total_gain: round2(totalValue - total),
      types: Investment.INVESTMENT_TYPES,
      filters: { month: month || null, type: type || null, search: search || null },
    });
  } catch (err) {
    next(err);
  }
}

async function getSummary(req, res, next) {
  try {
    const month = req.query.month || currentMonth();
    const userId = req.user.id;

    const [monthTotal, allTime, byTypeMonth, byTypeAllTime] = await Promise.all([
      Investment.totalForMonth(userId, month),
      Investment.allTimeStats(userId),
      Investment.totalsByType(userId, month),
      Investment.totalsByType(userId, null),
    ]);

    res.json({
      month,
      month_total: round2(monthTotal),
      all_time: {
        total_invested: round2(allTime.total_invested),
        current_value: round2(allTime.current_value),
        total_gain: round2(allTime.total_gain),
        gain_percent: round2(allTime.gain_percent),
        total_entries: allTime.total_entries,
      },
      distribution_month: byTypeMonth,
      distribution_all_time: byTypeAllTime,
      types: Investment.INVESTMENT_TYPES,
    });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, type, amount, current_value, date, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Investment name is required" });
    }
    const purchase = normalizePurchase(req.body);
    const numAmount = purchase.amount;
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    const selection = await validateMarketSelection(type || "Mutual Funds / SIP", { ...req.body, units: purchase.units }, req.user.currency);

    const item = await Investment.create(req.user.id, {
      name: name.trim(),
      type: type || "Mutual Funds / SIP",
      amount: round2(numAmount),
      purchase_price: purchase.purchase_price,
      current_value: current_value != null ? round2(Number(current_value)) : round2(numAmount),
      date: String(date || new Date().toISOString()).slice(0, 10),
      month: String(date || new Date().toISOString()).slice(0, 7),
      notes: notes ? notes.trim() : null,
      ...selection,
    });

    res.status(201).json({ investment: item });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const current = await Investment.findById(req.params.id, req.user.id);
    if (!current) {
      return res.status(404).json({ message: "Investment not found" });
    }

    const name = req.body.name !== undefined ? req.body.name.trim() : current.name;
    const type = req.body.type || current.type;
    const purchase = normalizePurchase(req.body, current);
    const estimated = isEstimatedQuantity(current);
    const confirmed = req.body.confirm_actual_quantity === true;
    const provider = req.body.market_provider !== undefined ? req.body.market_provider : current.market_provider;
    if (estimated && provider && !confirmed) return res.status(400).json({ message: "Enter and confirm actual purchase details before linking estimated units to a market price." });
    if (estimated && confirmed && (!(purchase.units > 0) || !(purchase.purchase_price > 0))) return res.status(400).json({ message: "Actual quantity and purchase price are required." });
    const amount = purchase.amount;
    let currentValue = req.body.current_value !== undefined ? Number(req.body.current_value) : Number(current.current_value);
    // When a manually valued holding's quantity is corrected, retain its last
    // unit valuation instead of comparing the old quantity's value to new cost.
    if (req.body.current_value === undefined && type !== current.type) currentValue = amount;
    else if (req.body.current_value === undefined && !estimated && !current.market_provider && Number(current.units) > 0 && purchase.units > 0) {
      currentValue = round2(Number(current.current_value ?? current.amount) / Number(current.units) * purchase.units);
      if (!Number.isFinite(currentValue) || currentValue >= 1e10) return res.status(400).json({ message: "The adjusted valuation is outside the supported range." });
    }
    const date = req.body.date ? String(req.body.date).slice(0, 10) : current.date;
    const notes = req.body.notes !== undefined ? req.body.notes : current.notes;

    if (!name) {
      return res.status(400).json({ message: "Investment name is required" });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    // Missing fields preserve a link; explicit nulls remove it for manual tracking.
    const selection = await validateMarketSelection(type, {
      market_provider: req.body.market_provider !== undefined ? req.body.market_provider : current.market_provider,
      instrument_id: req.body.instrument_id !== undefined ? req.body.instrument_id : current.instrument_id,
      units: purchase.units,
    }, req.user.currency);

    const item = await Investment.update(req.params.id, req.user.id, {
      name,
      type,
      amount: round2(amount),
      purchase_price: purchase.purchase_price,
      current_value: Number.isFinite(currentValue) ? round2(currentValue) : round2(amount),
      quantity_metadata: estimated && !confirmed ? quantityMetadata(current)
        : quantityMetadata(current)?.kind === "accepted" && type === current.type ? quantityMetadata(current) : null,
      date,
      month: String(date).slice(0, 7),
      notes,
      ...selection,
    });

    res.json({ investment: item });
  } catch (err) {
    next(err);
  }
}

async function syncAllPrices(req, res, next) {
  try {
    const { month } = req.query;
    const filter = month ? { month } : {};
    const investments = await Investment.findAllByUser(req.user.id, filter);
    if (req.user.currency !== "INR") {
      return res.status(422).json({ message: "Automatic valuation requires an INR portfolio." });
    }
    const result = await refreshPortfolio(investments, { automatic: req.query.automatic === "true" });
    const portfolio = await Investment.allTimeStats(req.user.id);
    res.json({
      message: `Updated ${result.updated.length} investment valuation(s). ${result.skipped.length} left unchanged.`,
      ...result,
      portfolio,
    });
  } catch (err) {
    next(err);
  }
}

async function syncSinglePrice(req, res, next) {
  try {
    const item = await Investment.findById(req.params.id, req.user.id);
    if (!item) {
      return res.status(404).json({ message: "Investment not found" });
    }

    if (item.market_provider && req.user.currency !== "INR") {
      return res.status(422).json({ message: "Automatic valuation requires an INR portfolio." });
    }
    const result = await refreshHolding(item);
    const updatedItem = await Investment.findById(item.id, req.user.id);
    res.json({
      message: `Updated valuation for ${item.name} via ${result.source}`,
      investment: updatedItem ? withPriceStatus(updatedItem) : null,
      source: result.source,
    });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const ok = await Investment.remove(req.params.id, req.user.id);
    if (!ok) {
      return res.status(404).json({ message: "Investment not found" });
    }
    res.json({ message: "Investment deleted" });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getSummary, create, update, remove, syncAllPrices, syncSinglePrice, searchMarket, getInstrumentQuote, calculate };
