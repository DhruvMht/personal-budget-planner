import { useEffect, useRef, useState } from "react";
import investmentService from "../../services/investmentService";
import { getErrorMessage } from "../../services/api";
import Input from "./Input";

export default function InvestmentAmounts({ form, setForm, selection, linked, editing, onCalculationState }) {
  const [price, setPrice] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [calculation, setCalculation] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState("");
  const [retry, setRetry] = useState(0);
  const latestForm = useRef(form);
  latestForm.current = form;
  const lastField = useRef("amount");
  const priceEdited = useRef(false);
  const priceIdentity = useRef(null);
  const isStock = form.type === "Stocks / Equities";
  const provider = selection?.provider;
  const instrumentId = selection?.instrument_id;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setQuote(null);
    setQuoteError("");
    setCalculation(null);
    setCalculationError("");
    setCalculating(false);
    const identity = linked ? `${provider}:${instrumentId}` : `manual:${latestForm.current.type}`;
    const sameSelection = priceIdentity.current === identity;
    priceIdentity.current = identity;
    if (!sameSelection) priceEdited.current = false;
    const sameHolding = linked && instrumentId && editing?.instrument_id === instrumentId && editing?.market_provider === provider;
    const preserveAcceptedPurchase = editing?.quantity_metadata?.kind === "accepted" && !editing?.instrument_id && editing?.type === latestForm.current.type;
    // Historical cost is preserved on opening Edit; quotes never change saved values by themselves.
    const savedQuantity = sameSelection || sameHolding || preserveAcceptedPurchase || (!linked && editing?.type === latestForm.current.type);
    const savedPrice = savedQuantity ? (latestForm.current.purchase_price || (Number(latestForm.current.units) > 0 ? String(Number((Number(latestForm.current.amount) / Number(latestForm.current.units)).toFixed(12))) : "")) : "";
    setPrice(savedPrice);
    setForm(previous => ({ ...previous, purchase_price: savedPrice }));
    setQuoteLoading(Boolean(linked && instrumentId));
    if (!linked || !instrumentId) return () => { active = false; controller.abort(); };
    investmentService.getQuote(provider, instrumentId, controller.signal).then(result => {
      if (!active) return;
      setQuote(result);
      if (!sameHolding && !preserveAcceptedPurchase && !priceEdited.current) {
        setPrice(String(result.price));
        setForm(previous => ({ ...previous, purchase_price: String(result.price) }));
        const field = lastField.current;
        const value = latestForm.current[field];
        if (value !== "") setCalculation({ field, value });
      }
    }).catch(err => {
      if (active) setQuoteError(getErrorMessage(err));
    }).finally(() => { if (active) setQuoteLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [linked, provider, instrumentId, editing, retry, setForm]);

  useEffect(() => {
    setCalculationError("");
    if ((linked && !selection) || !calculation) { setCalculating(false); return; }
    const other = calculation.field === "units" ? "amount" : "units";
    if (calculation.value === "") {
      setForm(previous => ({ ...previous, [other]: "" }));
      setCalculating(false);
      return;
    }
    if (!(Number(price) > 0)) {
      setForm(previous => ({ ...previous, [other]: "" }));
      setCalculating(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setCalculating(true);
    const timer = setTimeout(async () => {
      try {
        const result = await investmentService.calculate({ ...calculation, price }, controller.signal);
        if (active) setForm(previous => ({ ...previous, [other]: result[other] }));
      } catch (err) {
        if (active) {
          setForm(previous => ({ ...previous, [other]: "" }));
          setCalculationError(getErrorMessage(err));
        }
      } finally { if (active) setCalculating(false); }
    }, 150);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [linked, selection, calculation, price, setForm]);

  const blocked = Boolean(calculating || !(Number(price) > 0) || calculationError || !(Number(form.units) > 0) || !(Number(form.amount) > 0));
  useEffect(() => { onCalculationState(blocked); }, [blocked, onCalculationState]);

  function changeField(field, value) {
    lastField.current = field;
    const other = field === "units" ? "amount" : "units";
    setForm(previous => ({ ...previous, [field]: value, [other]: "", calculation_basis: field }));
    setCalculation({ field, value });
    setCalculating(Boolean(value));
    onCalculationState(true);
  }

  function changePrice(value) {
    priceEdited.current = true;
    setPrice(value);
    setForm(previous => ({ ...previous, purchase_price: value }));
    const field = lastField.current;
    const input = latestForm.current[field];
    if (input !== "") {
      setCalculation({ field, value: input });
      setCalculating(true);
      onCalculationState(true);
    }
  }

  return (
    <div className="space-y-3">
          <Input id="investment-unit-price" label={isStock ? "Price per share used for calculation" : "Price per unit used for calculation"}
            type="number" min="0.000000000001" max="999999999999" step="any" value={price} disabled={linked && !selection}
            onChange={event => changePrice(event.target.value)} placeholder={linked ? "Select an investment to load its price" : "Enter the price you paid per unit"} />
          <div className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
            {quoteLoading && <p>Fetching the latest price…</p>}
            {quote && <p>Latest available: INR {quote.price} · {quote.source} · {quote.as_of}
              <button type="button" className="ml-2 text-brand-600 underline" onClick={() => changePrice(String(quote.price))}>Use latest price</button>
            </p>}
            {quoteError && <p className="text-rose-600">{quoteError} Enter your purchase price to calculate.
              <button type="button" className="ml-2 underline" onClick={() => setRetry(value => value + 1)}>Retry price lookup</button>
            </p>}
            <p className="mt-1">Enter either quantity or invested amount; the other fills automatically. For a past purchase, use the price you actually paid, excluding fees.</p>
            {!linked && <p className="mt-1">Use a consistent unit, such as grams of gold or one deposit. For a single deposit or property, you can use 1 unit and its full purchase cost. This purchase price does not supply a live valuation.</p>}
          </div>
          <Input id="investment-units" label={isStock ? "Number of shares" : "Number of units"} type="number" min="0.00000001" step="any"
            value={form.units} onChange={event => changeField("units", event.target.value)} placeholder="Enter quantity or invested amount below" />
          {isStock && <p className="text-xs text-slate-500">An amount-based calculation may show fractional shares. Check the quantity against your actual holding.</p>}
      <Input id="investment-amount" label="Invested Amount" type="number" min="0.01" step="0.01" value={form.amount}
        onChange={event => changeField("amount", event.target.value)} placeholder="0.00" />
      <div aria-live="polite" className="text-xs">
        {calculating && <p className="text-slate-500">Calculating…</p>}
        {calculationError && <p className="text-rose-600">{calculationError}</p>}
      </div>
    </div>
  );
}
