'use client';

import { useEffect, useState } from 'react';
import { request } from '../workspaces/api-client';

export default function TransactionList({ workspaceId, token, importVersion }) {
  const endpoint = `/api/workspaces/${workspaceId}/transactions`;
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    request(`${endpoint}?page=${page}`, { token, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setSnapshot({ data, page, refresh, importVersion });
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setLoadError(failure.message);
      });
    return () => controller.abort();
  }, [endpoint, token, page, refresh, importVersion]);

  const current = snapshot?.page === page && snapshot.refresh === refresh &&
    snapshot.importVersion === importVersion ? snapshot.data : null;

  async function saveMatch(event) {
    event.preventDefault();
    const vendor = new FormData(event.currentTarget).get('vendor');
    setSaving(true);
    setError('');
    try {
      await request(`${endpoint}/merchant-match`, {
        token, method: 'PUT', body: { merchant: selected.merchant, vendor },
      });
      setSelected(null);
      setLoadError('');
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  function changePage(nextPage) {
    setSelected(null);
    setLoadError('');
    setPage(nextPage);
  }

  return (
    <div className="payment-panel">
      <h3>Saved transactions</h3>
      {loadError ? (
        <div role="alert"><p>{loadError}</p><button onClick={() => {
          setLoadError('');
          setRefresh((value) => value + 1);
        }}>Retry</button></div>
      ) : !current ? <p role="status">Loading transactions…</p> : (
        <>
          {!current.items.length ? <p>No transactions on this page.</p> : (
            <div className="statement-table">
              <table>
                <caption>Transactions · page {page}</caption>
                <thead><tr><th>Date</th><th>Merchant</th><th>Amount</th><th>Card</th><th>Vendor</th><th>Action</th></tr></thead>
                <tbody>{current.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.date}</td><td>{item.merchant}</td><td>{item.amount} {item.currency}</td>
                    <td>{item.source?.label ?? 'Unavailable'}{item.source?.lastFour && ` · •••• ${item.source.lastFour}`}</td>
                    <td>{item.vendor ?? 'Unmatched'}</td>
                    <td><button type="button" className="secondary" disabled={saving} onClick={() => {
                      setSelected(item);
                      setError('');
                    }}>{item.vendor ? 'Edit match' : 'Match'}</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="transaction-pagination">
            <button disabled={page === 1 || saving} onClick={() => changePage(page - 1)}>Previous</button>
            <button disabled={!current.hasMore || saving} onClick={() => changePage(page + 1)}>Next</button>
          </div>
        </>
      )}
      {selected && (
        <form key={selected.id} onSubmit={saveMatch}>
          <p>Match {selected.merchant} to a vendor. This applies to the same merchant description across this workspace.</p>
          <label>Vendor name<input name="vendor" defaultValue={selected.vendor ?? ''} maxLength={120} required /></label>
          <button disabled={saving}>{saving ? 'Saving…' : 'Save match'}</button>
          <button type="button" className="secondary" disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}
