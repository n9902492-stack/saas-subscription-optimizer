'use client';

import { useEffect, useState } from 'react';
import { request } from '../workspaces/api-client';

export default function Subscriptions({ workspaceId, token, vendorRevision, onSaved }) {
  const endpoint = `/api/workspaces/${workspaceId}/subscriptions`;
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    request(`${endpoint}?page=${page}`, { token, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoadError('');
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setLoadError(failure.message);
      });
    return () => controller.abort();
  }, [endpoint, token, page, revision, vendorRevision]);

  async function save(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const body = Object.fromEntries(fields);
    body.verifyNotice = fields.has('verifyNotice');
    setSaveError('');
    setSaving(true);
    try {
      await request(editing.id ? `${endpoint}/${editing.id}` : endpoint, {
        token, method: editing.id ? 'PUT' : 'POST', body,
      });
      setEditing(null);
      onSaved();
      setPage(1);
      setRevision((value) => value + 1);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="payment-panel">
      <h3>Subscriptions and contracts</h3>
      {loadError ? <div role="alert"><p>{loadError}</p><button onClick={() => {
        setLoadError('');
        setRevision((value) => value + 1);
      }}>Retry</button></div> : !data ? <p role="status">Loading subscriptions…</p> : (
        <>
          <button type="button" disabled={saving} onClick={() => {
            setSaveError('');
            setEditing({});
          }}>Add subscription</button>
          {data.items.length ? (
            <div className="statement-table">
              <table>
                <caption>Subscriptions · page {page}</caption>
                <thead><tr><th>Subscription</th><th>Owner</th><th>Billing</th><th>Contract end</th><th>Notice deadline</th><th>Action</th></tr></thead>
                <tbody>{data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name} · {item.vendor}</td>
                    <td>{data.owners.find((owner) => owner.id === item.ownerId)?.email ?? 'Unavailable'}</td>
                    <td>{item.billingCycle}</td><td>{item.contractEnd ?? 'Unknown'}</td>
                    <td>{item.noticeDeadline ? `${item.noticeDeadline} · Verified` : 'Unverified'}</td>
                    <td><button type="button" className="secondary" disabled={saving} onClick={() => {
                      setSaveError('');
                      setEditing(item);
                    }}>Edit</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p>No subscriptions recorded on this page.</p>}
          {(page > 1 || data.hasMore) && (
            <div className="transaction-pagination">
              <button disabled={page === 1 || saving} onClick={() => { setData(null); setPage(page - 1); }}>Previous</button>
              <button disabled={!data.hasMore || saving} onClick={() => { setData(null); setPage(page + 1); }}>Next</button>
            </div>
          )}
          {editing && (
            <form key={editing.id ?? 'new'} onSubmit={save}>
              <label>Vendor
                <input name="vendor" list="subscription-vendors" defaultValue={editing.vendor ?? ''} required maxLength={120} />
                <datalist id="subscription-vendors">{data.vendors.map((vendor) => <option key={vendor} value={vendor} />)}</datalist>
              </label>
              <label>Subscription name<input name="name" defaultValue={editing.name ?? ''} required maxLength={120} /></label>
              <label>Owner
                <select name="ownerId" defaultValue={editing.ownerId ?? ''} required>
                  <option value="">Choose workspace member</option>
                  {data.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.email}</option>)}
                </select>
              </label>
              <label>Billing cycle
                <select name="billingCycle" defaultValue={editing.billingCycle ?? 'monthly'}>
                  <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option><option value="other">Other</option>
                </select>
              </label>
              <label>Auto-renew
                <select name="autoRenew" defaultValue={editing.autoRenew ?? 'unknown'}>
                  <option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </label>
              <label>Contract end date<input type="date" name="contractEnd" defaultValue={editing.contractEnd ?? ''} /></label>
              <label>Notice deadline<input type="date" name="noticeDeadline" defaultValue={editing.noticeDeadline ?? ''} /></label>
              <label>Notice evidence<input name="noticeEvidence" defaultValue={editing.noticeEvidence ?? ''} maxLength={500}
                placeholder="Agreement date and clause number" /></label>
              <label className="verify-notice"><input name="verifyNotice" type="checkbox" /> I verified the deadline against the contract.</label>
              <button disabled={saving}>{saving ? 'Saving…' : 'Save subscription'}</button>
              <button type="button" className="secondary" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
              {saveError && <p role="alert">{saveError}</p>}
            </form>
          )}
        </>
      )}
    </div>
  );
}
