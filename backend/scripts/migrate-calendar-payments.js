const { pool } = require("../config/db");

async function migrate() {
  for (const table of ["Income", "Expenses", "Investments"]) {
    const [columns] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE 'reminder_id'`);
    if (!columns.length) {
      // Nullable references preserve all existing transactions and their values.
      await pool.query(`ALTER TABLE ${table} ADD COLUMN reminder_id INT NULL, ADD INDEX idx_${table.toLowerCase()}_reminder (user_id, reminder_id)`);
    }
  }
}
if (require.main === module) migrate().then(() => console.log("Calendar payment references are ready.")).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
module.exports = { migrate };
