const express = require("express");
const c = require("../controllers/billCalendarController");
const auth = require("../middleware/authMiddleware");
const { validate, validateId, validateMonth } = require("../middleware/validateSchema");

const router = express.Router();
router.use(auth);
router.param("id", validateId);
router.param("month", validateMonth);

router.get("/", c.getMonthCalendar);
router.post("/reminders", validate("reminder"), c.createReminder);
router.put("/reminders/:id", validate("reminder", { partial: true }), c.updateReminder);
router.delete("/reminders/:id", c.deleteReminder);
router.post("/pay", validate("payment"), c.quickPay);

module.exports = router;
