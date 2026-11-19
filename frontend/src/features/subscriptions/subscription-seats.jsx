'use client';

import { useEffect, useState } from 'react';
import { request } from '../workspaces/api-client';

const labels = { active: 'Active', candidate: 'Review candidate', unknown: 'Unknown activity' };
const pageSize = 25;

export default function SubscriptionSeats({ endpoint, item, token, onClose }) {
  const url = `${endpoint}/${item.id}/seats`;
  const [state, setState] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [organization, setOrganization] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    request(`${url}/copilot`, { token, signal: controller.signal }).then(({ organization: org }) => {
      if (!controller.signal.aborted) setOrganization(org);
    }).catch(() => {
      if (!controller.signal.aborted) setOrganization(null);
    });
    request(url, { token, signal: controller.signal })
      .then((snapshot) => {
        if (!controller.signal.aborted) setState({ snapshot });
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setState({ error: failure.message });
      });
    return () => controller.abort();
  }, [url, token, refresh]);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const file = fields.get('csv');
    const purchased = fields.get('purchasedSeats');
    setError('');
    setSaving(true);
    try {
      if (!file?.size || file.size > 131072) throw new Error('Choose a CSV file no larger than 128 KiB.');
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const snapshot = await request(url, {
        token, method: 'PUT', body: {
          csv, asOf: fields.get('asOf'), purchasedSeats: purchased === '' ? null : Number(purchased),
          expectedRevision: state.snapshot?.revision ?? null,
        },
      });
      setState({ snapshot });
      setPage(0);
      form.reset();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  async function syncCopilot() {
    setError('');
    setSaving(true);
    try {
      const snapshot = await request(`${url}/copilot`, {
        token, method: 'POST', body: { expectedRevision: state.snapshot?.revision ?? null },
      });
      setState({ snapshot });
      setPage(0);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  const snapshot = state?.snapshot;
  function reload() {
    setError('');
    setPage(0);
    setState(null);
    setRefresh((value) => value + 1);
  }

  return (
    <section className="payment-panel">
      <h4>License seat review · {item.name}</h4>
      {!state ? <p role="status">Loading seat snapshot…</p> : state.error ? (
        <div role="alert"><p>{state.error}</p><button type="button" onClick={reload}>Retry</button></div>
      ) : (
        <>
          {snapshot ? (
            <>
              <p>{snapshot.source === 'copilot' ? `GitHub Copilot (${snapshot.organization})` : 'CSV'} snapshot as of {snapshot.asOf} · {snapshot.seats.length} assigned · {snapshot.purchasedSeats ?? 'Unknown'} purchased</p>
              <p>{snapshot.counts.active} active · {snapshot.counts.candidate} review candidates · {snapshot.counts.unknown} unknown</p>
              {snapshot.purchasedSeats !== null && <p>{snapshot.purchasedSeats >= snapshot.seats.length
                ? `${snapshot.purchasedSeats - snapshot.seats.length} unassigned`
                : `${snapshot.seats.length - snapshot.purchasedSeats} assigned above the recorded purchase count`}</p>}
              <div className="statement-table">
                <table>
                  <thead><tr><th>Account</th><th>Last reported activity</th><th>Status</th></tr></thead>
                  <tbody>{snapshot.seats.slice(page * pageSize, (page + 1) * pageSize).map((seat) => (
                    <tr key={seat.account}><th scope="row">{seat.account}</th><td>{seat.lastActivity ?? 'Unknown'}</td>
                      <td>{labels[seat.status]}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="transaction-pagination">
                <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
                <button type="button" disabled={(page + 1) * pageSize >= snapshot.seats.length} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </>
          ) : <p>No seat snapshot saved.</p>}
          {organization && (
            <div>
              <p>Syncing replaces this snapshot with assigned seats from {organization}. Missing GitHub activity stays Unknown.</p>
              <button type="button" disabled={saving} onClick={syncCopilot}>Sync GitHub Copilot seats</button>
            </div>
          )}
          <p>Use one row per assigned license with <code>account,last_activity</code> headers. Leave activity blank if unknown, or enter YYYY-MM-DD. Activity reported {snapshot?.inactivityDays ?? 60}+ days before the snapshot is a review candidate.</p>
          <form onSubmit={submit}>
            <label>Snapshot date<input name="asOf" type="date" required /></label>
            <label>Purchased seats (optional)<input name="purchasedSeats" type="number" min={0} step={1} /></label>
            <label>Seat CSV<input type="file" name="csv" accept=".csv,text/csv" required /></label>
            <button disabled={saving}>{saving ? 'Saving…' : snapshot ? 'Replace seat snapshot' : 'Save seat snapshot'}</button>
          </form>
          {error && <p role="alert">{error}</p>}
          <button type="button" className="secondary" disabled={saving} onClick={reload}>Refresh snapshot</button>
        </>
      )}
      <button type="button" className="secondary" disabled={saving} onClick={onClose}>Close seat review</button>
    </section>
  );
}
