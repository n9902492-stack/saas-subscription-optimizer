'use client';

import { useEffect, useState } from 'react';
import { request } from '../workspaces/api-client';
import RenewalHistory from './renewal-history';
import RenewalExecutionForm, { executionLabels } from './renewal-execution-form';

const labels = { keep: 'Keep', 'reduce-seats': 'Reduce seats', 'review-overlap': 'Review overlap', cancel: 'Cancel' };

export default function RenewalDecisions({ workspaceId, token, revision }) {
  const endpoint = `/api/workspaces/${workspaceId}/renewal-decisions`;
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [history, setHistory] = useState(null);
  const [action, setAction] = useState('');
  const [includeTerms, setIncludeTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    request(`${endpoint}?page=${page}`, { token, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setSnapshot({ data, page, revision, refresh });
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setSnapshot({ error: failure.message, page, revision, refresh });
      });
    return () => controller.abort();
  }, [endpoint, token, page, revision, refresh]);

  const current = snapshot?.page === page && snapshot.revision === revision && snapshot.refresh === refresh
    ? snapshot : null;
  const active = selected && current?.data?.items.find((item) =>
    item.id === selected.id && item.canDecide && item.noticeDeadline === selected.noticeDeadline);
  const reload = () => { setTracking(null); setHistory(null); setSelected(null); setError(''); setRefresh((value) => value + 1); };

  async function save(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      await request(`${endpoint}/${selected.id}`, {
        token,
        method: 'PUT',
        body: {
          action: fields.get('action'), reason: fields.get('reason'),
          noticeDeadline: selected.noticeDeadline, expectedRevision: selected.decision?.revision ?? null,
          contractTerms: action === 'reduce-seats' && includeTerms ? {
            committedSeats: Number(fields.get('committedSeats')), minimumSeats: Number(fields.get('minimumSeats')),
            rate: fields.get('rate'), currency: fields.get('currency').trim().toUpperCase(),
            period: fields.get('period'), effectiveDate: fields.get('effectiveDate'),
          } : null,
          seatsToReduce: action === 'reduce-seats' ? Number(fields.get('seatsToReduce')) : null,
        },
      });
      reload();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="payment-panel">
      <h3>Renewal decisions</h3>
      {!current ? <p role="status">Loading renewal decisions…</p> : current.error ? (
        <div role="alert"><p>{current.error}</p><button type="button" onClick={reload}>Retry</button></div>
      ) : (
        <>
          {current.data.items.length ? (
            <div className="statement-table">
              <table>
                <thead><tr><th>Subscription</th><th>Notice deadline</th><th>Decision</th><th>Reason</th><th>Execution</th><th>Action</th></tr></thead>
                <tbody>{current.data.items.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">{item.name} · {item.vendor}</th><td>{item.noticeDeadline}</td>
                    <td>{item.decision ? labels[item.decision.action] : 'Pending'}
                      {item.decision?.seatsToReduce && ` · ${item.decision.seatsToReduce}`}
                      {item.decision?.action === 'reduce-seats' && <div>{item.decision.estimate
                        ? `Estimated savings: ${item.decision.estimate.currency} ${item.decision.estimate.amount} per ${item.decision.estimate.period} from ${item.decision.estimate.effectiveDate}`
                        : 'Savings not estimated'}</div>}</td>
                    <td>{item.decision?.reason ?? '—'}</td>
                    <td>{item.decision ? executionLabels[item.execution?.status ?? 'pending'] : '—'}
                      {item.execution?.note && <div>{item.execution.note}</div>}
                    </td>
                    <td>{item.canDecide && <button type="button" className="secondary" disabled={saving || !!tracking} onClick={() => {
                      setSelected(item); setIncludeTerms(!!item.decision?.estimate); setAction(item.decision?.action ?? ''); setError('');
                    }}>{item.decision ? 'Edit decision' : 'Record decision'}</button>}
                      {item.canTrackExecution && <button type="button" className="secondary" disabled={saving || !!tracking}
                        onClick={() => { setSelected(null); setHistory(null); setTracking(item); }}>Track execution</button>}
                      {item.canViewHistory && <button type="button" className="secondary" disabled={saving || !!tracking}
                        onClick={() => { setSelected(null); setHistory(item); }}>View history</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p>No verified renewals to review.</p>}
          {(page > 1 || current.data.hasMore) && (
            <div className="transaction-pagination">
              <button type="button" disabled={saving || !!tracking || page === 1} onClick={() => { setSelected(null); setHistory(null); setPage(page - 1); }}>Previous</button>
              <button type="button" disabled={saving || !!tracking || !current.data.hasMore} onClick={() => { setSelected(null); setHistory(null); setPage(page + 1); }}>Next</button>
            </div>
          )}
          {history && <RenewalHistory key={history.id} item={history} endpoint={endpoint} token={token}
            decisionLabels={labels} onClose={() => setHistory(null)} />}
          {tracking && (
            <RenewalExecutionForm key={tracking.id} item={tracking} endpoint={endpoint} token={token}
              onClose={reload} onSaved={reload} />
          )}
          {active && (
            <form key={selected.id} onSubmit={save}>
              <h4>{selected.name} · {selected.noticeDeadline}</h4>
              <label>Decision
                <select name="action" value={action} onChange={(event) => setAction(event.target.value)} required>
                  <option value="">Choose a decision</option>
                  {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {action === 'reduce-seats' && <label>Seats to reduce<input name="seatsToReduce" type="number" min={1} step={1}
                defaultValue={selected.decision?.seatsToReduce ?? ''} required /></label>}
              {action === 'reduce-seats' && <>
                <label><input type="checkbox" checked={includeTerms} onChange={e => setIncludeTerms(e.target.checked)} /> Estimate savings from a fixed per-seat contract</label>
                {includeTerms && <fieldset><legend>Contract terms before reduction</legend>
                  <label>Committed seats<input type="number" name="committedSeats" min="1" defaultValue={selected.decision?.estimate?.committedSeats} required /></label>
                  <label>Minimum payable seats<input type="number" name="minimumSeats" min="0" defaultValue={selected.decision?.estimate?.minimumSeats} required /></label>
                  <label>Price per seat per billing period<input name="rate" inputMode="decimal" defaultValue={selected.decision?.estimate?.rate} required /></label>
                  <label>Currency code<input name="currency" placeholder="USD" maxLength="3" defaultValue={selected.decision?.estimate?.currency} required /></label>
                  <label>Billing period<select name="period" defaultValue={selected.decision?.estimate?.period ?? ''} required>
                    <option value="">Select period</option><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Annual</option>
                  </select></label>
                  <label>Reduction effective date<input type="date" name="effectiveDate" defaultValue={selected.decision?.estimate?.effectiveDate} required /></label>
                </fieldset>}
              </>}
              <label>Reason<textarea name="reason" defaultValue={selected.decision?.reason ?? ''} maxLength={500} required /></label>
              <button disabled={saving}>{saving ? 'Saving…' : 'Save decision'}</button>
              <button type="button" className="secondary" disabled={saving} onClick={reload}>Close and refresh</button>
              {error && <p role="alert">{error}</p>}
            </form>
          )}
        </>
      )}
    </section>
  );
}
