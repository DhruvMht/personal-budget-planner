const express = require("express");
const cors = require("cors");
const env = require("./config/env");
const { testConnection } = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

// CORS: allow cloud IPs, localhost, domains or permissive for API
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile, curl, same-origin) or any remote origin
      callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use("/api", require("./middleware/validateSchema").commonFilters);

app.get("/", (req, res) => res.json({
  service: "Budget Planner API",
  status: "ok",
  frontend: "http://localhost:5173",
  health: "/api/health",
}));

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/income", require("./routes/incomeRoutes"));
app.use("/api/expenses", require("./routes/expenseRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));
app.use("/api/budgets", require("./routes/budgetRoutes"));
app.use("/api/goals", require("./routes/goalRoutes"));
app.use("/api/investments", require("./routes/investmentRoutes"));
app.use("/api/calendar", require("./routes/billCalendarRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/validation", require("./routes/validationRoutes"));

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await testConnection();
    console.log(`[db] Connected to MySQL database "${env.db.database}"`);
  } catch (err) {
    console.error("[db] Could not connect to MySQL:", err.message);
    console.error("[db] Check backend/.env and that MySQL is running.");
  }
  app.listen(env.port, "0.0.0.0", () => {
    console.log(`[server] API listening on port ${env.port} (0.0.0.0)`);
    console.log(`[server] Ready for incoming cloud connections.`);
  });
}

if (require.main === module) start();

module.exports = app;
