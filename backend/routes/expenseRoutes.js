const express = require("express");
const c = require("../controllers/expenseController");
const auth = require("../middleware/authMiddleware");
const { validate, validateId, validateMonth } = require("../middleware/validateSchema");

const router = express.Router();
router.use(auth);
router.param("id", validateId);
router.param("month", validateMonth);

router.get("/", c.list);
router.get("/by-category/:month", c.byCategory);
router.post("/", validate("expense"), c.create);
router.put("/:id", validate("expense", { partial: true }), c.update);
router.delete("/:id", c.remove);

module.exports = router;
