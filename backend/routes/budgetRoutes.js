const express = require("express");
const c = require("../controllers/budgetController");
const auth = require("../middleware/authMiddleware");
const { validate, validateId, validateMonth } = require("../middleware/validateSchema");

const router = express.Router();
router.use(auth);
router.param("id", validateId);
router.param("month", validateMonth);

router.get("/", c.list);
router.get("/recommendation", c.recommend);
router.post("/", validate("budget"), c.upsert);
router.post("/apply-recommendation", validate("filters", { partial: true }), c.applyRecommendation);
router.put("/:id", validate("budget", { partial: true }), c.update);
router.delete("/:id", c.remove);

module.exports = router;
