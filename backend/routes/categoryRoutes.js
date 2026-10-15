const express = require("express");
const c = require("../controllers/categoryController");
const auth = require("../middleware/authMiddleware");
const { validate, validateId, validateMonth } = require("../middleware/validateSchema");

const router = express.Router();
router.use(auth);
router.param("id", validateId);
router.param("month", validateMonth);

router.get("/", c.list);
router.post("/restore-defaults", c.restoreDefaults);
router.post("/", validate("category"), c.create);
router.put("/:id", validate("category", { partial: true }), c.update);
router.delete("/:id", c.remove);

module.exports = router;
