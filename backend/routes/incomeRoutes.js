const express = require("express");
const c = require("../controllers/incomeController");
const auth = require("../middleware/authMiddleware");
const { validate, validateId, validateMonth } = require("../middleware/validateSchema");

const router = express.Router();
router.use(auth);
router.param("id", validateId);
router.param("month", validateMonth);

router.get("/", c.list);
router.get("/total/:month", c.monthlyTotal);
router.post("/", validate("income"), c.create);
router.put("/:id", validate("income", { partial: true }), c.update);
router.delete("/:id", c.remove);

module.exports = router;
