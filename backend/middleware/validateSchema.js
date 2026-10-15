const { validateSchema, validateFields, rejectValidation } = require("../validation/validate");

function validate(schemaId, { partial = false, source = "body" } = {}) {
  return (req, res, next) => {
    const errors = validateSchema(schemaId, req[source], { partial });
    if (errors.length) return rejectValidation(res, errors);
    next();
  };
}

function commonFilters(req, res, next) {
  const fields = {
    month: { label: "Month", type: "month", allowBlank: true },
    category_id: { label: "Category", type: "number", integer: true, min: 1, max: 2147483647, allowBlank: true },
    search: { label: "Search", type: "string", max: 255, allowBlank: true },
    q: { label: "Investment search", type: "string", max: 100, allowBlank: true, characters: "instrumentSearch" },
    limit: { label: "Limit", type: "number", integer: true, min: 1, max: 120 },
  };
  const errors = validateFields(fields, req.query);
  if (errors.length) return rejectValidation(res, errors);
  next();
}

function validateId(req, res, next, value) {
  const errors = validateFields({ id: { label: "Record ID", type: "number", integer: true, min: 1, max: 2147483647 } }, { id: value });
  if (errors.length) return rejectValidation(res, errors);
  next();
}

function validateMonth(req, res, next, value) {
  const errors = validateSchema("filters", { month: value });
  if (errors.length) return rejectValidation(res, errors);
  next();
}

module.exports = { validate, commonFilters, validateId, validateMonth };
