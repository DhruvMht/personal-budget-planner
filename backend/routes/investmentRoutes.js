const express = require("express");
const c = require("../controllers/investmentController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();
router.use(auth);

router.get("/", c.list);
router.get("/summary", c.getSummary);
router.post("/sync-prices", c.syncAllPrices);
router.post("/:id/sync-price", c.syncSinglePrice);
router.post("/", c.create);
router.put("/:id", c.update);
router.delete("/:id", c.remove);

module.exports = router;
