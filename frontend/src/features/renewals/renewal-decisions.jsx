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
                      {item.decision?.seatsToReduce && ` · ${item.decision.seatsToReduce}`}</td>
                    <td>{item.decision?.reason ?? '—'}</td>
                    <td>{item.decision ? executionLabels[item.execution?.status ?? 'pending'] : '—'}
                      {item.execution?.note && <div>{item.execution.note}</div>}
                    </td>
                    <td>{item.canDecide && <button type="button" className="secondary" disabled={saving || !!tracking} onClick={() => {
                      setSelected(item); setAction(item.decision?.action ?? ''); setError('');
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
