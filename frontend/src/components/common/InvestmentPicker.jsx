import { useEffect, useState } from "react";
import investmentService from "../../services/investmentService";
import { getErrorMessage } from "../../services/api";
import Input from "./Input";

export default function InvestmentPicker({ type, selection, onChange, allowManual = false }) {
  const [query, setQuery] = useState(selection?.name || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [retry, setRetry] = useState(0);
  const isFund = type === "Mutual Funds / SIP";
  const isStock = type === "Stocks / Equities";
  const validManualName = /^[\p{L}\p{M}\p{N} ]+$/u.test(query) && /[\p{L}\p{N}]/u.test(query);

  useEffect(() => {
    setResults([]);
    setError("");
    setSearched(false);
    setLoading(false);
    if (selection || query.trim().length < 2) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const items = await investmentService.searchInstruments(type, query.trim(), controller.signal);
        if (active) { setResults(items); setSearched(true); }
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, type, selection, retry]);

  return (
    <div className="space-y-2">
      <Input
        allowSpecialCharacters
        id="investment-instrument-search"
        label={isFund ? "Search mutual funds" : isStock ? "Search Indian stocks (NSE / BSE)" : `Search ${type}`}
        placeholder={isFund ? "Type 2+ letters of a fund name or scheme code" : isStock ? "Type 2+ letters, e.g. Reli, Tata, HDFC" : "Type 2+ letters to filter suggestions"}
        value={query}
        maxLength={100}
        autoComplete="off"
        aria-describedby="investment-search-help"
        onChange={(event) => {
          setQuery(event.target.value);
          setResults([]);
          setSearched(false);
          onChange(null);
        }}
      />
      <p id="investment-search-help" className="text-xs text-slate-500 dark:text-slate-400">
        {isFund ? "Choose the exact plan and option, including Direct / Regular and Growth / IDCW." : isStock ? "Choose the company and exchange you actually hold." : "Search common asset names and your saved investments. These suggestions use manual valuations."}
        {(isFund || isStock) && " Latest available prices may be delayed; fund NAVs are published daily."}
      </p>
      <div aria-live="polite" className="text-xs">
        {loading && <p className="text-slate-500">Searching…</p>}
        {error && <p className="text-rose-600">{error} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Retry search</button></p>}
          {!selection && searched && !results.length && <p className="text-slate-500">No matches. Check the spelling or try a shorter name.</p>}
        {selection && <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Selected: {selection.name}<br />{selection.instrument_id ? `${selection.instrument_id} · INR` : "Manual valuation"}</p>}
      </div>
      {!selection && results.length > 0 && (
        <ul aria-label="Matching investments" className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 dark:border-slate-700 dark:divide-slate-800">
          {results.map(item => (
            <li key={`${item.provider}:${item.instrument_id || item.name}`}>
              <button type="button" className="w-full px-3 py-2.5 text-left hover:bg-brand-50 focus:bg-brand-50 dark:hover:bg-slate-800 dark:focus:bg-slate-800" onClick={() => {
                setQuery(item.name);
                setResults([]);
                onChange(item);
              }}>
                <span className="block text-sm font-medium text-slate-900 dark:text-white">{item.name}</span>
                <span className="text-xs text-slate-500">{[item.instrument_id, item.exchange, item.currency].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {allowManual && !selection && query.trim().length >= 2 && validManualName && (
        <button type="button" className="text-sm text-brand-600 underline" onClick={() => onChange({ name: query.trim(), provider: null, instrument_id: null, manual: true })}>
          Use “{query.trim()}” as a manual investment
        </button>
      )}
    </div>
  );
}
