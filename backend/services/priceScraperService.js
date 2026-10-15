// Only explicitly linked instruments can receive automatic market valuations.
const { valuateSelectedInstrument } = require("./marketInstrumentService");

async function autoValuateInvestment(investment) {
  if (!["Mutual Funds / SIP", "Stocks / Equities"].includes(investment.type)) {
    throw Object.assign(new Error("This asset uses a manual valuation. Update its price or value in Edit Investment."), { status: 422 });
  }
  return valuateSelectedInstrument(investment);
}

module.exports = { autoValuateInvestment };
