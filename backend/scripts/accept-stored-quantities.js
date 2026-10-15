// Apply only after the owner explicitly accepts the selected saved quantities.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pool } = require("../config/db");
const { quantityMetadata } = require("../utils/estimatedQuantity");

async function main() {
  const ids = [...new Set((process.argv[2] || "").split(",").map(Number))];
  assert.ok(ids.length && ids.every(id => Number.isSafeInteger(id) && id > 0) && process.argv[3] === "--apply", "Specify exact investment IDs and --apply");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await connection.execute(`SELECT * FROM Investments WHERE id IN (${placeholders}) ORDER BY id FOR UPDATE`, ids);
    assert.equal(rows.length, ids.length, "Requested record missing");
    for (const row of rows) {
      assert.ok(["estimated", "accepted"].includes(quantityMetadata(row)?.kind), `Record ${row.id} is not an estimate or accepted baseline`);
      assert.ok(row.units > 0 && row.purchase_price > 0 && row.amount > 0, `Record ${row.id} has incomplete purchase data`);
    }
    const pending = rows.filter(row => quantityMetadata(row).kind === "estimated");
    if (!pending.length) { await connection.rollback(); console.log("All selected quantities are already accepted."); return; }
    const stamp = new Date().toISOString();
    const folder = path.resolve(__dirname, "../../.local-backups");
    fs.mkdirSync(folder, { recursive: true });
    const backup = path.join(folder, `before-accepting-quantities-${stamp.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backup, JSON.stringify({ created_at: stamp, records: rows }, null, 2), { flag: "wx" });
    for (const row of pending) {
      const original = quantityMetadata(row);
      const metadata = { ...original, kind: "accepted", accepted_at: stamp, accepted_by: "owner", original_kind: original.kind,
        unit_label: ({ "gram equivalents": "grams", "unit equivalents": "shares" })[original.unit_label] || original.unit_label,
        accepted_basis: { units: row.units, amount: row.amount, purchase_price: row.purchase_price, current_value: row.current_value } };
      await connection.execute("UPDATE Investments SET quantity_metadata = ? WHERE id = ?", [JSON.stringify(metadata), row.id]);
    }
    const [after] = await connection.execute(`SELECT * FROM Investments WHERE id IN (${placeholders}) ORDER BY id`, ids);
    for (let index = 0; index < rows.length; index++) {
      const { quantity_metadata: beforeMetadata, ...beforeValues } = rows[index];
      const { quantity_metadata: afterMetadata, ...afterValues } = after[index];
      assert.deepEqual(afterValues, beforeValues, "Acceptance must not change financial or instrument data");
      assert.equal(quantityMetadata(after[index]).kind, "accepted");
    }
    await connection.commit();
    console.log(JSON.stringify({ accepted: pending.map(row => row.id), backup, preserved: "Quantities, purchase prices, costs, valuations and instrument identities" }, null, 2));
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
