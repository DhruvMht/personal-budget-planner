// Explicit, local-only estimate backfill using a reviewed reference-price plan.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pool } = require("../config/db");
const migrate = require("./migrate-quantity-metadata");
const { calculateInvestment } = require("../utils/investmentCalculator");
const { inferredPrice } = require("../utils/investmentPurchase");
const { isEstimatedQuantity } = require("../utils/estimatedQuantity");

async function main() {
  const ids = (process.argv[2] || "").split(",").map(Number);
  if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1) || !process.argv[3] || process.argv[4] !== "--apply") {
    throw new Error("Specify exact investment IDs, a reviewed JSON reference plan, and --apply.");
  }
  const plan = JSON.parse(fs.readFileSync(process.argv[3], "utf8").replace(/^\uFEFF/, ""));
  await migrate();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await connection.execute(`SELECT i.*, u.currency FROM Investments i JOIN Users u ON u.id = i.user_id WHERE i.id IN (${placeholders}) ORDER BY i.id FOR UPDATE`, ids);
    assert.equal(rows.length, new Set(ids).size, "One or more requested records are missing");
    const eligible = rows.filter(row => ((row.units == null && row.purchase_price == null) || isEstimatedQuantity(row)) && !row.market_provider && !row.instrument_id);
    assert.ok(eligible.every(row => row.currency === "INR"), "The INR demo assumption cannot be used for another currency");
    if (!eligible.length) { await connection.rollback(); console.log("No missing quantities to estimate."); return; }
    const stamp = new Date().toISOString();
    const folder = path.resolve(__dirname, "../../.local-backups");
    fs.mkdirSync(folder, { recursive: true });
    const backup = path.join(folder, `before-estimated-quantities-${stamp.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backup, JSON.stringify({ created_at: stamp, records: rows }, null, 2), { flag: "wx" });
    const updated = [];
    for (const row of eligible) {
      const reference = plan[String(row.id)];
      assert.ok(reference && reference.expected_name === row.name && reference.expected_type === row.type, `Reference plan does not match record ${row.id}`);
      assert.ok(Number.isFinite(reference.price) && reference.price > 0 && reference.label && reference.unit_label && reference.note, `Incomplete reference for record ${row.id}`);
      const value = Number(row.current_value ?? row.amount);
      const units = Number(calculateInvestment({ field: "amount", value, price: reference.price }).units);
      const purchasePrice = inferredPrice(row.amount, units);
      assert.ok(purchasePrice > 0, `Cannot calculate implied cost for record ${row.id}`);
      const metadata = { kind: "estimated", method: "stored_current_value_divided_by_reference_price", reference_price: reference.price, currency: "INR", reference_value: value, reference_label: reference.label, source_url: reference.source_url || null, reference_as_of: reference.as_of || null, unit_label: reference.unit_label, note: reference.note, created_at: stamp };
      await connection.execute("UPDATE Investments SET units = ?, purchase_price = ?, quantity_metadata = ? WHERE id = ?", [units, purchasePrice, JSON.stringify(metadata), row.id]);
      updated.push({ id: row.id, name: row.name, estimated_units: units, reference_price: reference.price, unit_label: reference.unit_label });
    }
    const [after] = await connection.execute(`SELECT id, amount, current_value FROM Investments WHERE id IN (${placeholders}) ORDER BY id`, ids);
    assert.deepEqual(after, rows.map(({ id, amount, current_value }) => ({ id, amount, current_value })));
    await connection.commit();
    console.log(JSON.stringify({ updated, backup, preserved: "All invested amounts, current values and ROI" }, null, 2));
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
