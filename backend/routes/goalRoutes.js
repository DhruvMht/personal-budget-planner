const express = require("express");
const c = require("../controllers/goalController");
const auth = require("../middleware/authMiddleware");
const { validate, validateId, validateMonth } = require("../middleware/validateSchema");

const router = express.Router();
router.use(auth);
router.param("id", validateId);
router.param("month", validateMonth);

router.get("/", c.list);
router.get("/:id", c.getOne);
router.post("/", validate("goal"), c.create);
router.post("/:id/contribute", validate("contribution"), c.contribute);
router.put("/:id", validate("goal", { partial: true }), c.update);
router.delete("/:id", c.remove);

module.exports = router;
