const { SCHEMAS } = require("./schemas");
const { isPlainText, validEmail, DECIMAL } = require("./characters");
const { normalizePurchase } = require("../utils/investmentPurchase");
const { currentDate } = require("../utils/currentDate");

function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function validDate(value) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateFields(fields, body, { partial = false, now = new Date() } = {}) {
  const errors = [];
  const add = (field, rule, message) => errors.push({ field, label: rule.label || field, message });
  if (!body || typeof body !== "object" || Array.isArray(body)) return [{ field: "input", label: "Input", message: "Input must be an object with named fields." }];
  for (const [field, rule] of Object.entries(fields)) {
    const value = body[field];
    const label = rule.label || field;
    if (value === undefined) {
      if (rule.required && !partial) add(field, rule, `${label} is required.`);
      continue;
    }
    if (value === null && rule.nullable) continue;
    if (typeof value === "string" && /^ *$/.test(value) && rule.allowBlank) continue;
    if (value === null || (typeof value === "string" && !value.trim())) {
      add(field, rule, `${label} cannot be empty.`); continue;
    }
    if (rule.type === "string" || rule.type === "password" || rule.type === "email") {
      if (typeof value !== "string") { add(field, rule, `${label} must be text.`); continue; }
      const length = rule.type === "password" ? value.length : value.trim().length;
      if (rule.min !== undefined && length < rule.min) add(field, rule, `${label} must contain at least ${rule.min} characters.`);
      if (rule.max !== undefined && (length > rule.max || (rule.type === "password" && Buffer.byteLength(value, "utf8") > rule.max))) add(field, rule, `${label} exceeds the maximum length of ${rule.max}${rule.type === "password" ? " UTF-8 bytes" : " characters"}.`);
      if (rule.type === "email" && !validEmail(value)) add(field, rule, `${label} must be a valid email address (for example, name@example.com).`);
      if (rule.type === "string" && (rule.characters || "plain") === "plain" && !isPlainText(value)) add(field, rule, `${label} can contain only letters, numbers and spaces. Special characters are not allowed.`);
      if (rule.characters === "instrument" && !/^(?:\d{1,10}|[A-Z0-9&._-]{1,40}\.(?:NS|BO))$/.test(value)) add(field, rule, `${label} must be a valid scheme code or NSE/BSE stock symbol.`);
      if (rule.characters === "instrumentSearch" && !isPlainText(value) && !/^[A-Z0-9&._-]{1,40}\.(NS|BO)$/.test(value)) add(field, rule, `${label} accepts letters, numbers and spaces, or an exact NSE/BSE stock code.`);
    } else if (rule.type === "number") {
      const numericText = typeof value === "string" && DECIMAL.test(value.trim());
      const n = Number(value);
      if (!(typeof value === "number" || numericText) || !Number.isFinite(n)) { add(field, rule, `${label} must be a finite number.`); continue; }
      if (rule.integer && !Number.isInteger(n)) add(field, rule, `${label} must be a whole number.`);
      if (rule.min !== undefined && n < rule.min) add(field, rule, rule.min === 0.01 ? `${label} must be greater than zero.` : `${label} must be at least ${rule.min}.`);
      if (rule.max !== undefined && n > rule.max) add(field, rule, `${label} must not exceed ${rule.max}.`);
      if (rule.decimals !== undefined && Math.abs(n - Number(n.toFixed(rule.decimals))) > Math.max(1e-12, Math.abs(n) * Number.EPSILON)) add(field, rule, `${label} allows at most ${rule.decimals} decimal places.`);
    } else if (rule.type === "date") {
      if (!validDate(value)) add(field, rule, `${label} must be a real calendar date in YYYY-MM-DD format.`);
      else if (rule.noFuture && value > currentDate(now)) add(field, rule, `${label} cannot be later than today.`);
    }
    else if (rule.type === "month" && (typeof value !== "string" || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value))) add(field, rule, `${label} must be in YYYY-MM format with a month from 01 to 12.`);
    else if (rule.type === "enum" && !rule.values.includes(value)) add(field, rule, `${label} must be one of: ${rule.values.join(", ")}.`);
    else if (rule.type === "boolean" && ![true, false, 0, 1].includes(value)) add(field, rule, `${label} must be true or false.`);
  }
  return errors;
}

function validateSchema(schemaId, body, options = {}) {
  const schema = SCHEMAS[schemaId];
  if (!schema || !Object.hasOwn(SCHEMAS, schemaId)) throw Object.assign(new Error("Unknown validation form."), { status: 400 });
  // For selected instruments the submitted display name is never saved: the
  // controller replaces it with the verified quote name after checking the code.
  let fields = schemaId === "investment" && body?.market_provider && body?.instrument_id
    ? { ...schema.fields, name: { ...schema.fields.name, characters: "providerDisplay" } }
    : schema.fields;
  if (schemaId === "investment" && body?.purchase_price !== undefined && body?.units != null) {
    fields = { ...fields, amount: { ...fields.amount, required: false } };
  }
  const errors = validateFields(fields, body, options);
  if (!body || typeof body !== "object" || Array.isArray(body)) return errors;
  const add = (field, message) => errors.push({ field, label: schema.fields[field]?.label || field, message });
  if (schemaId === "income" && typeof body.source === "string" && body.source.trim().toLowerCase() === "salary" &&
      typeof body.month === "string" && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(body.month) && body.month > currentMonth(options.now)) {
    add("month", "Salary month cannot be later than the current month and year.");
  }
  if (schemaId === "goal" && body.saved_amount != null && body.target_amount != null && Number(body.saved_amount) > Number(body.target_amount)) add("saved_amount", "Saved amount cannot exceed the target amount.");
  if (schemaId === "investment") {
    if (Boolean(body.market_provider) !== Boolean(body.instrument_id)) add("instrument_id", "Select both a price provider and its instrument code.");
    if (body.market_provider) {
      const expected = { mfapi: "Mutual Funds / SIP", yahoo: "Stocks / Equities" }[body.market_provider];
      if (body.type !== undefined && body.type !== expected) add("type", "The selected instrument does not match the asset class.");
      if ((body.units === undefined || body.units === null) && !(body.purchase_price !== undefined && body.amount !== undefined)) add("units", "Shares / units are required for market price tracking.");
      const code = body.instrument_id;
      if (typeof code !== "string" || (body.market_provider === "mfapi" ? !/^\d{1,10}$/.test(code) : !/^[A-Z0-9&._-]{1,40}\.(NS|BO)$/.test(code))) add("instrument_id", "Enter a valid scheme code or NSE/BSE stock symbol.");
    }
    if (body.date && body.month && typeof body.date === "string" && body.date.slice(0, 7) !== body.month) add("month", "Month must match the investment date.");
    // Updates need the saved purchase data to distinguish unchanged historical
    // values from recalculation requests; the controller checks them after loading.
    if (!errors.length && body.purchase_price !== undefined && !options.partial) {
      try { normalizePurchase(body); }
      catch (error) { add(error.fieldErrors?.[0]?.field || "purchase_price", error.message); }
    }
  }
  return errors;
}

function rejectValidation(res, fieldErrors) {
  const errors = fieldErrors.map(error => error.message);
  return res.status(400).json({ message: `Incorrect value: ${errors.join(" ")}`, errors, fieldErrors });
}

module.exports = { validateFields, validateSchema, validDate, rejectValidation, currentMonth };
