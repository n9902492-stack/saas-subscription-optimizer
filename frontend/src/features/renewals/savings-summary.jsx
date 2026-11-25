'use client';

import { useEffect, useState } from 'react';
import { downloadSavingsSummary } from './export-savings.mjs';
import { request } from '../workspaces/api-client';
import { savingsComparison } from '../workspaces/savings-comparison.mjs';

export default function SavingsSummary({ endpoint, token, compact = false, onAddSubscription, onReviewInvoices }) {
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
    <p>{compact ? 'Compare savings for reviewed invoices, by currency and billing period.' : 'Current seat reductions across this workspace. The difference compares reviewed invoices with their original estimates.'}</p>
    {!result ? <p role="status">Loading savings…</p> : result.error ? <div role="alert">{result.error}
      <button onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Retry</button></div> : <>
      {compact && result.data.groups.filter(group => group.actual !== null).map(group => {
        const comparison = savingsComparison(group);
        if (!comparison) return null;
        return <div className="savings-comparison" key={group.currency + group.period}>
          <h4>{group.currency} / {group.period}</h4>
          <div className="comparison-line"><span>Reviewed estimate</span><strong>{group.currency} {comparison.estimate}</strong><div className="comparison-track" aria-hidden="true"><i style={{ width: `${comparison.estimatedWidth}%` }} /></div></div>
          <div className="comparison-line comparison-line--verified"><span>Verified</span><strong>{group.currency} {comparison.actual}</strong><div className="comparison-track" aria-hidden="true"><i style={{ width: `${comparison.actualWidth}%` }} /></div></div>
          <p className="card-note">{group.reviewed} of {group.decisions} invoices reviewed.{comparison.negative && ' Negative savings mean additional cost; bars show absolute amounts.'}</p>
        </div>;
      })}
      {compact && !result.data.groups.some(group => group.actual !== null) && result.data.groups.length > 0 && <p>No invoice-verified savings yet. <a href="#renewal-decisions" onClick={event => { if (onReviewInvoices) { event.preventDefault(); onReviewInvoices(); } }}>Review an invoice</a> to compare outcomes.</p>}
      {(result.data.groups.length > 0 || result.data.missingEstimate > 0) &&
        <button type="button" className="secondary" onClick={() => downloadSavingsSummary(result.data)}>Export savings CSV</button>}
      {result.data.groups.length ? <details open={!compact}><summary>View savings breakdown</summary><div className="statement-table" tabIndex={0} role="region" aria-label="Savings summary table, scroll horizontally"><table>
        <thead><tr>{['Currency / billing period', 'Estimated savings', 'Invoices reviewed', 'Invoice savings', 'Difference'].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{result.data.groups.map(group => <tr key={group.currency + group.period}>
          <th scope="row">{group.currency} / {group.period}</th><td>{group.estimated}</td>
          <td>{group.reviewed} of {group.decisions}</td><td>{group.actual ?? 'Awaiting invoice'}</td><td>{group.variance ?? '—'}</td>
        </tr>)}</tbody>
      </table></div></details> : <><p>No current seat reductions with estimates.</p>{compact && <a href="#subscriptions" onClick={event => { if (onAddSubscription) { event.preventDefault(); onAddSubscription(); } }}>Add a subscription</a>}</>}
      {result.data.missingEstimate > 0 && <p>Seat reductions missing contract estimates: {result.data.missingEstimate}</p>}
    </>}
  </section>;
}
