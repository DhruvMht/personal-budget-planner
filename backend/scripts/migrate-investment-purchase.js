// Idempotent: preserve all historical costs, quantities and valuations.
const { pool } = require("../config/db");

async function migrate() {
  const [columns] = await pool.query("SHOW COLUMNS FROM Investments");
  if (!columns.some(column => column.Field === "purchase_price")) {
    await pool.query("ALTER TABLE Investments ADD COLUMN purchase_price DECIMAL(24,12) NULL");
  }
  const [result] = await pool.execute(`UPDATE Investments
    SET purchase_price = ROUND(amount / units, 12)
    WHERE purchase_price IS NULL AND amount > 0 AND units > 0
      AND ROUND(amount / units, 12) BETWEEN 0.000000000001 AND 999999999999`);
  console.log(`Purchase prices ready; ${result.affectedRows} known prices backfilled. Costs, quantities and valuations preserved.`);
}

if (require.main === module) migrate().catch(error => {
  console.error(error.message); process.exitCode = 1;
}).finally(() => pool.end());
module.exports = migrate;
