// Allocate integer cents by weight, respecting each row's cap and the total.
function allocateMoney(amount, rows) {
  let remaining = Math.max(0, Math.round(Number(amount) * 100) || 0);
  const allocated = rows.map(() => 0);
  const caps = rows.map(row => row.cap == null ? remaining : Math.max(0, Math.round(row.cap * 100)));
  while (remaining > 0) {
    const active = rows.map((row, index) => ({ ...row, index })).filter(row => row.weight > 0 && allocated[row.index] < caps[row.index]);
    if (!active.length) break;
    const weight = active.reduce((sum, row) => sum + row.weight, 0);
    const shares = active.map(row => ({ ...row, exact: remaining * row.weight / weight }));
    let used = 0;
    for (const row of shares) {
      const cents = Math.min(Math.floor(row.exact), caps[row.index] - allocated[row.index]);
      allocated[row.index] += cents; used += cents;
    }
    remaining -= used;
    shares.sort((a, b) => (b.exact % 1) - (a.exact % 1) || a.index - b.index);
    for (const row of shares) {
      if (remaining > 0 && allocated[row.index] < caps[row.index]) {
        allocated[row.index]++; remaining--;
      }
    }
  }
  return allocated.map(cents => cents / 100);
}
module.exports = { allocateMoney };
