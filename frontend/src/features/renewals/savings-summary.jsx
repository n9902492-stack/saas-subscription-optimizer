'use client';

import { useEffect, useState } from 'react';
import { downloadSavingsSummary } from './export-savings.mjs';
import { request } from '../workspaces/api-client';

export default function SavingsSummary({ endpoint, token }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request(endpoint + '/savings-summary', { token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ data }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ error: error.message }); });
    return () => controller.abort();
  }, [endpoint, token, attempt]);

  return <section aria-label="Workspace savings">
    <h3>Workspace savings</h3>
    <p>Current seat reductions across this workspace. The difference compares reviewed invoices with their original estimates.</p>
    {!result ? <p role="status">Loading savings…</p> : result.error ? <div role="alert">{result.error}
      <button onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Retry</button></div> : <>
      {(result.data.groups.length > 0 || result.data.missingEstimate > 0) &&
        <button type="button" className="secondary" onClick={() => downloadSavingsSummary(result.data)}>Export savings CSV</button>}
      {result.data.groups.length ? <div className="statement-table"><table>
        <thead><tr>{['Currency / billing period', 'Estimated savings', 'Invoices reviewed', 'Invoice savings', 'Difference'].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{result.data.groups.map(group => <tr key={group.currency + group.period}>
          <th scope="row">{group.currency} / {group.period}</th><td>{group.estimated}</td>
          <td>{group.reviewed} of {group.decisions}</td><td>{group.actual ?? 'Awaiting invoice'}</td><td>{group.variance ?? '—'}</td>
        </tr>)}</tbody>
      </table></div> : <p>No current seat reductions with estimates.</p>}
      {result.data.missingEstimate > 0 && <p>Seat reductions missing contract estimates: {result.data.missingEstimate}</p>}
    </>}
  </section>;
}
