'use client';

import { useState } from 'react';
import { request } from '../workspaces/api-client';

const fields = [
  ['date', 'Transaction date'], ['merchant', 'Merchant'],
  ['amount', 'Signed amount'], ['currency', 'Currency'],
];

export default function StatementImport({ workspaceId, sources, token, onSaved }) {
  const [csv, setCsv] = useState('');
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/workspaces/${workspaceId}/statement-imports`;

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function readFile(event) {
    const file = event.target.files[0];
    setCsv('');
    setColumns([]);
    setMapping({});
    setPreview(null);
    setResult(null);
    if (!file) return;
    return run(async () => {
      if (file.size > 131072) throw new Error('Choose a CSV file no larger than 128 KiB.');
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const data = await request(`${endpoint}/columns`, { token, method: 'POST', body: { csv: content } });
      setCsv(content);
      setColumns(data.columns);
    });
  }

  function previewStatement(event) {
    event.preventDefault();
    setPreview(null);
    setResult(null);
    return run(async () => {
      setPreview(await request(`${endpoint}/preview`, {
        token, method: 'POST', body: { csv, mapping, paymentSourceId: source },
      }));
    });
  }

  function saveStatement() {
    return run(async () => {
      const data = await request(`${endpoint}/commit`, {
        token, method: 'POST', body: { csv, mapping, paymentSourceId: source, previewHash: preview.hash },
      });
      setResult(data);
      onSaved();
    });
  }

  return (
    <div className="payment-panel">
      <h3>Import card statement</h3>
      <p>Use a UTF-8 CSV with dates in YYYY-MM-DD format, signed amounts, and three-letter currency codes. Remove full card numbers before uploading.</p>
      <form onSubmit={previewStatement}>
        <label>Payment source
          <select value={source} disabled={busy} required onChange={(event) => {
            setSource(event.target.value);
            setPreview(null);
            setResult(null);
          }}>
            <option value="">Select card</option>
            {sources.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>CSV file<input type="file" accept=".csv,text/csv" disabled={busy} onChange={readFile} /></label>
        {columns.length > 0 && fields.map(([field, label]) => (
          <label key={field}>{label}
            <select required disabled={busy} value={mapping[field] ?? ''} onChange={(event) => {
              const value = event.target.value;
              setMapping((previous) => ({ ...previous, [field]: value === '' ? undefined : Number(value) }));
              setPreview(null);
              setResult(null);
            }}>
              <option value="">Select column</option>
              {columns.map((column, index) => <option key={index} value={index}>{index + 1}. {column || '(unnamed)'}</option>)}
            </select>
          </label>
        ))}
        <button disabled={busy || !csv || !source}>Preview statement</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <>
          <p role="status">{preview.validCount} valid · {preview.invalidCount} invalid</p>
          {preview.errors.length > 0 && <ul>{preview.errors.map(({ row, message }) => <li key={row}>Row {row}: {message}</li>)}</ul>}
          {preview.rows.length > 0 && (
            <div className="statement-table">
              <table>
                <caption>First {preview.rows.length} valid rows</caption>
                <thead><tr><th>Date</th><th>Merchant</th><th>Amount</th><th>Currency</th></tr></thead>
                <tbody>{preview.rows.map((row, index) => (
                  <tr key={index}><td>{row.date}</td><td>{row.merchant}</td><td>{row.amount}</td><td>{row.currency}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <button type="button" disabled={busy || preview.invalidCount > 0 || !!result} onClick={saveStatement}>Save statement</button>
        </>
      )}
      {result && <p role="status">{result.existing ? 'This statement was already saved.' : `Saved ${result.count} transactions.`}</p>}
    </div>
  );
}
