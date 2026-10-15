const REFRESH_MS = { yahoo: 60_000, mfapi: 15 * 60_000 };

function metadataOf(item) {
  if (typeof item.price_metadata === "string") {
    try { return JSON.parse(item.price_metadata) || {}; } catch { return {}; }
  }
  return item.price_metadata || {};
}

function isRefreshDue(item, now = Date.now()) {
  const lastAttempt = Date.parse(metadataOf(item).last_attempt_at);
  return !Number.isFinite(lastAttempt) || now - lastAttempt >= (REFRESH_MS[item.market_provider] || 60_000);
}

function withPriceStatus(item, now = Date.now()) {
  const metadata = metadataOf(item);
  let status = "manual";
  if (item.market_provider && item.instrument_id) {
    const checked = Date.parse(metadata.checked_at);
    const published = Date.parse(metadata.as_of);
    const oldPublication = now - published > (item.market_provider === "mfapi" ? 4 * 86400_000 : 36 * 3600_000);
    status = !metadata.price || !Number.isFinite(checked) ? "unavailable"
      : metadata.error || now - checked > 2 * (REFRESH_MS[item.market_provider] || 60_000) ? "stale"
      : oldPublication ? "older" : "latest";
  }
  return { ...item, price_metadata: metadata, price_status: status };
}

function quoteMetadata(quote, now = new Date().toISOString()) {
  return { price: quote.price, as_of: quote.as_of, source: quote.source, checked_at: now, last_attempt_at: now, error: null };
}

module.exports = { REFRESH_MS, metadataOf, isRefreshDue, withPriceStatus, quoteMetadata };
