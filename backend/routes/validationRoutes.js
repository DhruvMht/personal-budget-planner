const express = require("express");
const auth = require("../middleware/authMiddleware");
const { SCHEMAS } = require("../validation/schemas");
const { examples, samples } = require("../validation/examples");
const { validateSchema } = require("../validation/validate");
const router = express.Router();
router.use(auth);

function inspect({ schema, payload, partial = false, title, id }) {
  const errors = validateSchema(schema, payload, { partial });
  const accepted = errors.length === 0;
  const displayedInput = Object.fromEntries(Object.entries(payload || {}).map(([field, value]) => [field,
    SCHEMAS[schema].fields[field]?.type === "password" ? "[hidden]" : value,
  ]));
  return { id, title, schema, actual: accepted ? "accept" : "reject", passed: accepted,
    validation: accepted ? "Valid input" : "Incorrect value", errors, input: displayedInput,
    checkedAt: new Date().toISOString() };
}

router.get("/catalog", (_req, res) => res.json({ schemas: SCHEMAS, samples,
  examples: examples.map(({ expected, errorField, ...example }) => example),
  scope: "Input rules only. No records are saved. Credentials, existing records, ownership and market-data availability are checked during real submissions, not by this panel." }));
router.post("/check", (req, res, next) => {
  try {
    const { schema, payload, partial = false } = req.body || {};
    if (typeof schema !== "string" || !Object.hasOwn(SCHEMAS, schema) ||
        typeof partial !== "boolean" || !payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length > 30) {
      return res.status(400).json({ message: "Choose a valid form and input object." });
    }
    res.json(inspect({ schema, payload, partial, title: "Custom input" }));
  } catch (err) { next(err); }
});
router.post("/run", (_req, res, next) => {
  try {
    const results = examples.map(inspect);
    res.json({ results, total: results.length, passed: results.filter(result => result.passed).length,
      failed: results.filter(result => !result.passed).length, checkedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});
module.exports = router;
