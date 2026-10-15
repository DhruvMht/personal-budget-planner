const { pool } = require("../config/db");
const { metadataOf } = require("../utils/investmentPriceStatus");

const INVESTMENT_TYPES = [
  "Mutual Funds / SIP",
  "Stocks / Equities",
  "Fixed Deposit / RD",
  "Gold / SGB",
  "PPF / EPF / NPS",
  "Real Estate / REITs",
  "Cryptocurrency",
  "Other Investments",
];

const Investment = {
  INVESTMENT_TYPES,

  async findAllByUser(userId, { month, type, search } = {}) {
    const conditions = ["user_id = ?"];
    const params = [userId];

    if (month) {
      conditions.push("month = ?");
      params.push(month);
    }
    if (type) {
      conditions.push("type = ?");
      params.push(type);
    }
    if (search) {
      conditions.push("(name LIKE ? OR notes LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.execute(
      `SELECT id, user_id, name, type, amount, current_value, date, month, notes, market_provider, instrument_id, units, reminder_id, price_metadata
       FROM Investments
       WHERE ${conditions.join(" AND ")}
       ORDER BY date DESC, id DESC`,
      params
    );
    return rows.map(row => ({ ...row, price_metadata: metadataOf(row) }));
  },

  async findById(id, userId, connection = pool) {
    const [rows] = await connection.execute(
      `SELECT id, user_id, name, type, amount, current_value, date, month, notes, market_provider, instrument_id, units, price_metadata
       FROM Investments
       WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, userId]
    );
    return rows[0] ? { ...rows[0], price_metadata: metadataOf(rows[0]) } : null;
  },

  async create(userId, { name, type, amount, current_value, date, month, notes, market_provider, instrument_id, units, price_metadata = null, reminder_id = null }, connection = pool) {
    const m = month || String(date).slice(0, 7);
    const [res] = await connection.execute(
      `INSERT INTO Investments (user_id, name, type, amount, current_value, date, month, notes, market_provider, instrument_id, units, reminder_id, price_metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        name,
        type || "Mutual Funds / SIP",
        amount,
        current_value !== undefined && current_value !== null && current_value !== ""
          ? Number(current_value)
          : Number(amount),
        date,
        m,
        notes || null,
        market_provider || null,
        instrument_id || null,
        units ?? null,
        reminder_id,
        price_metadata ? JSON.stringify(price_metadata) : null,
      ]
    );
    return Investment.findById(res.insertId, userId, connection);
  },

  async update(id, userId, { name, type, amount, current_value, date, month, notes, market_provider, instrument_id, units, price_metadata = null }) {
    const m = month || String(date).slice(0, 7);
    await pool.execute(
      `UPDATE Investments
       SET name = ?, type = ?, amount = ?, current_value = ?, date = ?, month = ?, notes = ?, market_provider = ?, instrument_id = ?, units = ?, price_metadata = ?
       WHERE id = ? AND user_id = ?`,
      [
        name,
        type,
        amount,
        current_value !== undefined && current_value !== null && current_value !== ""
          ? Number(current_value)
          : Number(amount),
        date,
        m,
        notes || null,
        market_provider || null,
        instrument_id || null,
        units ?? null,
        price_metadata ? JSON.stringify(price_metadata) : null,
        id,
        userId,
      ]
    );
    return Investment.findById(id, userId);
  },

  async updateCurrentValue(id, userId, currentValue) {
    const num = Number(currentValue) || 0;
    await pool.execute(
      "UPDATE Investments SET current_value = ? WHERE id = ? AND user_id = ?",
      [Math.round(num * 100) / 100, id, userId]
    );
    return Investment.findById(id, userId);
  },

  // Guard against an edit/delete that happens while the provider request is pending.
  // Preserve cost and quantity; older entries may acquire an exact provider identity.
  async saveMarketPrice(item, currentValue, metadata, instrument = { provider: item.market_provider, instrument_id: item.instrument_id }) {
    const [result] = await pool.execute(
      `UPDATE Investments SET current_value = ?, price_metadata = ?, market_provider = ?, instrument_id = ?
       WHERE id = ? AND user_id = ? AND market_provider <=> ? AND instrument_id <=> ? AND units = ? AND name = ? AND type = ?`,
      [currentValue, JSON.stringify(metadata), instrument.provider, instrument.instrument_id,
        item.id, item.user_id, item.market_provider, item.instrument_id, item.units, item.name, item.type]
    );
    return result.affectedRows > 0;
  },

  async recordPriceFailure(item, message) {
    await pool.execute(
      `UPDATE Investments SET price_metadata = JSON_SET(COALESCE(price_metadata, JSON_OBJECT()), '$.error', ?, '$.last_attempt_at', ?)
       WHERE id = ? AND user_id = ? AND market_provider = ? AND instrument_id = ? AND units = ?`,
      [message.slice(0, 300), new Date().toISOString(), item.id, item.user_id, item.market_provider, item.instrument_id, item.units]
    );
  },

  async remove(id, userId) {
    const [res] = await pool.execute(
      "DELETE FROM Investments WHERE id = ? AND user_id = ?",
      [id, userId]
    );
    return res.affectedRows > 0;
  },

  async totalForMonth(userId, month) {
    const [rows] = await pool.execute(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM Investments WHERE user_id = ? AND month = ?",
      [userId, month]
    );
    return Number(rows[0]?.total) || 0;
  },

  async allTimeStats(userId) {
    const [rows] = await pool.execute(
      `SELECT
         COALESCE(SUM(amount), 0) AS total_invested,
         COALESCE(SUM(COALESCE(current_value, amount)), 0) AS current_value,
         COUNT(id) AS total_entries
       FROM Investments
       WHERE user_id = ?`,
      [userId]
    );
    const totalInvested = Number(rows[0]?.total_invested) || 0;
    const currentValue = Number(rows[0]?.current_value) || 0;
    const totalGain = currentValue - totalInvested;
    const gainPercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
    return {
      total_invested: totalInvested,
      current_value: currentValue,
      total_gain: totalGain,
      gain_percent: gainPercent,
      total_entries: Number(rows[0]?.total_entries) || 0,
    };
  },

  async totalsByType(userId, month = null) {
    let sql = `
      SELECT
        type,
        COALESCE(SUM(amount), 0) AS total_invested,
        COALESCE(SUM(COALESCE(current_value, amount)), 0) AS current_value,
        COUNT(id) AS count
      FROM Investments
      WHERE user_id = ?
    `;
    const params = [userId];
    if (month) {
      sql += " AND month = ?";
      params.push(month);
    }
    sql += " GROUP BY type ORDER BY total_invested DESC";

    const [rows] = await pool.execute(sql, params);
    return rows.map((r) => ({
      type: r.type,
      total_invested: Number(r.total_invested) || 0,
      current_value: Number(r.current_value) || 0,
      count: Number(r.count) || 0,
    }));
  },

  async monthlyTotals(userId, limit = 12) {
    const [rows] = await pool.execute(
      `SELECT month, COALESCE(SUM(amount), 0) AS total
       FROM Investments
       WHERE user_id = ?
       GROUP BY month
       ORDER BY month DESC
       LIMIT ${Number(limit) || 12}`,
      [userId]
    );
    return rows.map((r) => ({ month: r.month, total: Number(r.total) || 0 }));
  },
};

module.exports = Investment;
