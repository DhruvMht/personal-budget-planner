// Common labels help users find manually valued assets. These are not provider-verified listings.
const { isPlainText } = require("../validation/characters");
const MANUAL_CATALOG = {
  "Fixed Deposit / RD": [
    { name: "Bank Fixed Deposit", aliases: "fd term deposit" },
    { name: "Bank Recurring Deposit", aliases: "rd monthly deposit" },
    { name: "Corporate Fixed Deposit", aliases: "company fd" },
    { name: "Post Office Time Deposit", aliases: "post office fd" },
  ],
  "Gold / SGB": [
    { name: "Physical Gold", aliases: "gold bars coins jewellery jewelry" },
    { name: "Sovereign Gold Bond SGB", aliases: "sovereign gold bond sgb" },
    { name: "Gold ETF", aliases: "gold exchange traded fund goldbees" },
    { name: "Digital Gold", aliases: "digital gold" },
  ],
  "PPF / EPF / NPS": [
    { name: "Public Provident Fund PPF", aliases: "public provident ppf" },
    { name: "Employees Provident Fund EPF", aliases: "employees provident epf pf" },
    { name: "National Pension System NPS", aliases: "national pension nps" },
    { name: "Voluntary Provident Fund VPF", aliases: "voluntary provident vpf" },
  ],
  "Real Estate / REITs": [
    { name: "Residential Property", aliases: "house apartment flat residential" },
    { name: "Commercial Property", aliases: "office shop commercial" },
    { name: "Land", aliases: "land plot" },
    { name: "Real Estate Investment Trust REIT", aliases: "real estate investment trust reit" },
  ],
  "Cryptocurrency": [
    { name: "Bitcoin BTC", aliases: "bitcoin btc" },
    { name: "Ethereum ETH", aliases: "ethereum eth" },
    { name: "Solana SOL", aliases: "solana sol" },
    { name: "Dogecoin DOGE", aliases: "dogecoin doge" },
    { name: "Cardano ADA", aliases: "cardano ada" },
    { name: "XRP", aliases: "ripple xrp" },
  ],
  "Other Investments": [
    { name: "Corporate Bonds", aliases: "corporate bonds debentures" },
    { name: "Government Bonds", aliases: "government bonds securities" },
    { name: "Unlisted Shares", aliases: "unlisted shares equity" },
    { name: "Private Equity", aliases: "private equity startup" },
    { name: "Collectibles", aliases: "collectibles art antiques" },
  ],
};

function manualSuggestions(type, query, savedNames = []) {
  const q = query.trim().toLowerCase();
  const common = (MANUAL_CATALOG[type] || []).filter(item => `${item.name} ${item.aliases}`.toLowerCase().includes(q));
  const items = [...savedNames.filter(name => isPlainText(name) && name.toLowerCase().includes(q)).map(name => ({ name })), ...common];
  return [...new Map(items.map(item => [item.name.toLowerCase(), item])).values()].slice(0, 30).map(item => ({
    name: item.name, provider: null, instrument_id: null, manual: true, exchange: "Manual valuation",
  }));
}

module.exports = { MANUAL_CATALOG, manualSuggestions };
