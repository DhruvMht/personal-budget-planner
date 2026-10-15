import { useEffect, useState } from "react";
import { FlaskConical, Play, CheckCircle2, XCircle } from "lucide-react";
import api, { getErrorMessage } from "../services/api";
import Input from "./common/Input";
import Button from "./common/Button";

function editableValues(fields, payload) {
  return Object.fromEntries(Object.entries(payload).filter(([field]) =>
    fields[field]?.required));
}

export default function ValidationTestPanel() {
  const [catalog, setCatalog] = useState(null);
  const [schema, setSchema] = useState("investment");
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [suite, setSuite] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    api.get("/validation/catalog").then(({ data }) => {
      if (!active) return;
      setCatalog(data);
      setSchema("investment");
      setValues(editableValues(data.schemas.investment.fields, data.samples.investment));
    }).catch(err => { if (active) setError(getErrorMessage(err)); });
    return () => { active = false; };
  }, [reload]);

  function chooseForm(nextSchema) {
    setSchema(nextSchema);
    setValues(editableValues(catalog.schemas[nextSchema].fields, catalog.samples[nextSchema]));
    setResult(null); setError("");
  }

  async function check(event) {
    event.preventDefault(); setBusy("check"); setError(""); setResult(null);
    try {
      const { data } = await api.post("/validation/check", { schema, payload: values });
      setResult(data);
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(""); }
  }

  async function runAll() {
    setBusy("all"); setError(""); setSuite(null);
    try { setSuite((await api.post("/validation/run")).data); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(""); }
  }

  const fields = Object.entries(catalog?.schemas[schema]?.fields || {}).filter(([, rule]) => rule.required);
  const forms = Object.entries(catalog?.schemas || {}).filter(([, form]) =>
    Object.values(form.fields).some(rule => rule.required));
  return (
    <section className="card space-y-5" aria-labelledby="validation-panel-title">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-brand-600" />
        <h2 id="validation-panel-title" className="text-lg font-bold text-slate-900 dark:text-white">Validation Test Panel</h2>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">Check input against the fixed validation rules used when saving data across the app.</p>
      <p className="text-xs text-slate-500">PASS means valid input. FAIL means incorrect input, with the reason shown below. No records are saved.</p>
      {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error} {!catalog && <button type="button" className="underline" onClick={() => setReload(n => n + 1)}>Retry loading</button>}</div>}
      {!catalog && !error && <p role="status" className="text-sm text-slate-500">Loading validation rules…</p>}
      {catalog && <>
        <form noValidate onSubmit={check} className="space-y-4">
          <fieldset disabled={Boolean(busy)} className="space-y-4 disabled:opacity-60">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input as="select" label="Form to test" value={schema} onChange={event => chooseForm(event.target.value)}>
                {forms.map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
              </Input>
            </div>
            <p className="text-xs text-slate-500">Enter the required fields below. Inputs allow incorrect text so you can demonstrate validation.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map(([field, rule]) => {
                const fieldError = result?.errors.filter(item => item.field === field).map(item => item.message).join(" ");
                return <div key={`${schema}:${field}`}>
                  <Input label={`${rule.label} *`} type={rule.type === "password" ? "password" : "text"}
                    value={String(values[field] ?? "")}
                    error={fieldError} autoComplete="off" placeholder={rule.type === "date" ? "YYYY-MM-DD" : rule.type === "month" ? "YYYY-MM" : undefined}
                    onChange={event => {
                      const value = rule.type === "boolean" && ["true", "false"].includes(event.target.value) ? event.target.value === "true" : event.target.value;
                      setValues(previous => ({ ...previous, [field]: value })); setResult(null);
                    }} />
                </div>;
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy === "check"}><Play className="h-4 w-4" /> Check input</Button>
              <Button type="button" variant="secondary" loading={busy === "all"} onClick={runAll}>Run all {catalog.examples.length} examples</Button>
            </div>
          </fieldset>
        </form>
        {result && <div role="status" className={`rounded-xl border p-4 ${result.passed ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950" : "border-rose-200 bg-rose-50 dark:bg-rose-950"}`}>
          <p className={`flex items-center gap-2 font-bold ${result.passed ? "text-emerald-700 dark:text-emerald-200" : "text-rose-700 dark:text-rose-200"}`}>
            {result.passed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />} Test {result.passed ? "PASS" : "FAIL"}
          </p>
          <p className={`mt-1 font-semibold ${result.actual === "reject" ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>{result.validation}</p>
          {result.errors.map((item, index) => <p key={index} className="mt-1 text-sm text-rose-700 dark:text-rose-300">{item.message}</p>)}
        </div>}
        {suite && <div className="space-y-3" aria-live="polite">
          <h3 className="font-semibold text-slate-900 dark:text-white">{suite.passed} passed · {suite.failed} failed · {suite.total} checked</h3>
          <p className="text-xs text-slate-500">Examples include deliberately incorrect values. Failed entries show which inputs break the validation rules.</p>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {suite.results.map(item => <details key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <summary className="cursor-pointer text-sm text-slate-700 dark:text-slate-200"><strong className={item.passed ? "text-emerald-600" : "text-rose-600"}>{item.passed ? "PASS" : "FAIL"}</strong> · {catalog.schemas[item.schema].label} · {item.title}</summary>
              <p className="mt-2 text-xs text-slate-500">{item.validation}.</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">{JSON.stringify(item.input, null, 2)}</pre>
              {item.errors.map((error, index) => <p key={index} className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error.message}</p>)}
            </details>)}
          </div>
        </div>}
        <p className="border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">{catalog.scope}</p>
      </>}
    </section>
  );
}
