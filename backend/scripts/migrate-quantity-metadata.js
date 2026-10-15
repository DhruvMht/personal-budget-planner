const { pool } = require("../config/db");
async function migrate() {
  const [columns] = await pool.query("SHOW COLUMNS FROM Investments");
  if (!columns.some(column => column.Field === "quantity_metadata")) {
    await pool.query("ALTER TABLE Investments ADD COLUMN quantity_metadata JSON NULL");
  }
}
if (require.main === module) migrate().then(() => console.log("Quantity metadata ready; records preserved."))
  .catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
module.exports = migrate;
