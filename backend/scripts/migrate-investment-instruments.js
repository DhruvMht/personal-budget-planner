// Add nullable fields without changing any existing investment or valuation.
const { pool } = require("../config/db");

async function migrate() {
  const [columns] = await pool.query("SHOW COLUMNS FROM Investments");
  const existing = new Set(columns.map(column => column.Field));
  const changes = [];
  if (columns.find(column => column.Field === "name")?.Type !== "varchar(255)") {
    changes.push("MODIFY COLUMN name VARCHAR(255) NOT NULL");
  }
  for (const [name, type] of Object.entries({ market_provider: "VARCHAR(16)", instrument_id: "VARCHAR(80)", units: "DECIMAL(20,8)" })) {
    if (!existing.has(name)) changes.push(`ADD COLUMN ${name} ${type} NULL`);
  }
  if (changes.length) await pool.query(`ALTER TABLE Investments ${changes.join(", ")}`);
  console.log("Investment instrument fields are ready; existing records preserved.");
}

if (require.main === module) migrate().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pool.end());

module.exports = migrate;
