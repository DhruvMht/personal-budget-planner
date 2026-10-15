function quantityMetadata(item) {
  if (typeof item.quantity_metadata === "string") {
    try { return JSON.parse(item.quantity_metadata); } catch { return null; }
  }
  return item.quantity_metadata || null;
}

function isEstimatedQuantity(item) {
  return quantityMetadata(item)?.kind === "estimated";
}

module.exports = { quantityMetadata, isEstimatedQuantity };
