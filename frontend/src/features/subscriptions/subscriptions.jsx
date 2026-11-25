'use client';

import { useEffect, useState } from 'react';
import SubscriptionSeats from './subscription-seats';
import { request } from '../workspaces/api-client';

export default function Subscriptions({ workspaceId, token, vendorRevision, onSaved, createRequest = 0, mode = 'inventory' }) {
  const endpoint = `/api/workspaces/${workspaceId}/subscriptions`;
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [vendorSpend, setVendorSpend] = useState(null);
  const usage = mode === 'usage';

  useEffect(() => {
    const controller = new AbortController();
    setVendorSpend(null);
    request(`/api/workspaces/${workspaceId}/vendors`, { token, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setVendorSpend(result); })
      .catch(() => {});
    return () => controller.abort();
  }, [workspaceId, token, vendorRevision]);

  function openDetails(item) { setSaveError(''); setReviewing(null); setEditing(item); }
  function seatsSaved() { setRevision(value => value + 1); onSaved(); }
  const key = value => value.trim().replace(/\s+/g, ' ').toLowerCase();

  useEffect(() => {
    if (!createRequest) return;
    setSaveError('');
    setReviewing(null);
    setEditing({});
  }, [createRequest]);

  useEffect(() => {
    if (createRequest && editing && !editing.id) document.getElementById('subscription-editor')?.querySelector('input')?.focus();
  }, [createRequest, editing, data]);

  useEffect(() => {
    const controller = new AbortController();
    request(`${endpoint}?page=${page}&q=${encodeURIComponent(query)}`, { token, signal: controller.signal })
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
  }, [endpoint, token, page, revision, vendorRevision, query]);

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
      <h2>{usage ? 'Seat activity' : 'Software subscriptions'}</h2>
      <p className="inventory-description">{usage ? 'Saved activity snapshots. Inactive seats are review candidates based on each snapshot’s inactivity threshold, not confirmed unused licenses.' : 'Your software subscriptions, owners, contract dates, and recorded vendor context.'}</p>
      <form className="inventory-search" role="search" onSubmit={event => { event.preventDefault(); setData(null); setLoadError(''); setPage(1); setQuery(search.trim()); setRevision(value => value + 1); }}>
        <label>Search applications<input type="search" value={search} maxLength={120} placeholder="Search application, vendor, or owner" onChange={event => setSearch(event.target.value)} /></label>
        <button type="submit">Search</button>
        {query && <button type="button" className="secondary" onClick={() => { setSearch(''); setQuery(''); setPage(1); setData(null); }}>Clear search</button>}
      </form>
      {loadError ? <div role="alert"><p>{loadError}</p><button onClick={() => {
        setLoadError('');
        setRevision((value) => value + 1);
      }}>Retry</button></div> : !data ? <p role="status">Loading subscriptions…</p> : (
        <>
          <p className="inventory-count" aria-live="polite">{data.total ?? data.items.length} {query ? 'matching subscriptions' : 'tracked subscriptions'}</p>
          <button type="button" disabled={saving} onClick={() => {
            setSaveError('');
            setReviewing(null);
            setEditing({});
          }}>Add subscription</button>
          {data.items.length ? (
            <div className="statement-table" tabIndex={0} role="region" aria-label="Subscriptions table, scroll horizontally">
              <table>
                <caption>{usage ? 'License activity' : 'Application inventory'} · page {page}</caption>
                <thead><tr><th>Application / vendor</th><th>Owner</th>{usage ? <><th>Assigned</th><th>Active</th><th>Inactive candidates</th><th>Unknown</th><th>Last updated</th></> : <><th>Spend</th><th>Seats</th><th>Renewal / notice</th></>}<th>Action</th></tr></thead>
                <tbody>{data.items.map((item) => {
                  const totals = vendorSpend?.vendors.find(vendor => key(vendor.name) === key(item.vendor))?.totals;
                  const summary = item.seatSummary;
                  return (
                  <tr key={item.id}>
                    <th scope="row"><button type="button" className="application-link" disabled={saving} onClick={() => openDetails(item)}>{item.name}</button><small>{item.vendor}</small></th>
                    <td>{data.owners.find((owner) => owner.id === item.ownerId)?.email ?? 'Unavailable'}</td>
                    {usage ? <>
                      <td>{summary?.assigned ?? 'No snapshot'}</td><td>{summary?.active ?? 'Unknown'}</td>
                      <td>{summary ? <>{summary.inactive}<small>{summary.inactivityDays}+ days without reported activity</small></> : 'Unknown'}</td><td>{summary?.unknown ?? 'Unknown'}</td>
                      <td>{summary ? <><time dateTime={summary.updatedAt}>{summary.updatedAt ? new Date(summary.updatedAt).toLocaleString() : 'Update time unavailable'}</time><small>Activity as of {summary.asOf} · {summary.source === 'copilot' ? 'GitHub Copilot' : 'CSV'}</small></> : 'No usage data yet'}</td>
                    </> : <>
                      <td><span>Not allocated</span>{totals?.length ? <small>{totals.map(total => <span className="vendor-spend-context" key={total.currency}>{total.currency} {total.amount} vendor net spend</span>)}Shared vendor total, not subscription spend.</small> : <small>{vendorSpend ? 'No matched vendor spend' : 'Vendor spend unavailable'}</small>}</td>
                      <td>{summary ? <>{summary.assigned} assigned<small>{summary.purchased ?? 'Unknown'} purchased · as of {summary.asOf}</small></> : 'No seat snapshot'}</td>
                      <td>{item.contractEnd ?? 'Contract end unknown'}<small>{item.noticeDeadline ? `Notice ${item.noticeDeadline} · Verified` : 'Notice unverified'}</small><small>{item.billingCycle}</small></td>
                    </>}
                    <td><button type="button" className="secondary" disabled={saving} onClick={() => openDetails(item)}>Open details</button>
                      <button type="button" className="secondary" disabled={saving} onClick={() => {
                        setEditing(null); setReviewing(item);
                      }}>Review seats</button>
                    </td>
                  </tr>
                ); })}</tbody>
              </table>
            </div>
          ) : <p>{query ? 'No applications match your search. Try another name, vendor, or owner.' : 'No subscriptions recorded yet. Add an application to start tracking ownership, licenses, and renewals.'}</p>}
          {(page > 1 || data.hasMore) && (
            <div className="transaction-pagination">
              <button disabled={page === 1 || saving} onClick={() => { setData(null); setPage(page - 1); }}>Previous</button>
              <button disabled={!data.hasMore || saving} onClick={() => { setData(null); setPage(page + 1); }}>Next</button>
            </div>
          )}
          {reviewing && <SubscriptionSeats key={reviewing.id} endpoint={endpoint} item={reviewing}
            token={token} onSaved={seatsSaved} onClose={() => { setReviewing(null); setRevision(value => value + 1); }} />}
          {editing && (
            <form id="subscription-editor" key={editing.id ?? 'new'} onSubmit={save}>
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
