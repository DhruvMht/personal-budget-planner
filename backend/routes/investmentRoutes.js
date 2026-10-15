const express = require("express");
const c = require("../controllers/investmentController");
const auth = require("../middleware/authMiddleware");
const { validate, validateId, validateMonth } = require("../middleware/validateSchema");

const router = express.Router();
router.use(auth);
router.param("id", validateId);
router.param("month", validateMonth);

router.get("/", c.list);
router.get("/summary", c.getSummary);
router.get("/instruments", c.searchMarket);
router.get("/instruments/quote", c.getInstrumentQuote);
router.post("/calculate", c.calculate);
router.post("/sync-prices", c.syncAllPrices);
router.post("/:id/sync-price", c.syncSinglePrice);
router.post("/", validate("investment"), c.create);
router.put("/:id", validate("investment", { partial: true }), c.update);
router.delete("/:id", c.remove);

module.exports = router;
