// Add quote history metadata without replacing any saved investment values.
const { pool } = require("../config/db");

async function migrate() {
  const [columns] = await pool.query("SHOW COLUMNS FROM Investments");
  if (!columns.some(column => column.Field === "price_metadata")) {
    await pool.query("ALTER TABLE Investments ADD COLUMN price_metadata JSON NULL");
  }
  console.log("Investment price metadata is ready; saved values preserved.");
}

if (require.main === module) migrate().catch(error => {
  console.error(error.message); process.exitCode = 1;
}).finally(() => pool.end());
module.exports = migrate;
