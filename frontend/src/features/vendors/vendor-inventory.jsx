'use client';

import { useEffect, useState } from 'react';
import { request } from '../workspaces/api-client';

function SpendList({ totals }) {
  if (!totals.length) return <p>No transactions.</p>;
  return (
    <ul>{totals.map(({ currency, amount, count }) => (
      <li key={currency}><strong>{amount} {currency}</strong> · {count} {count === 1 ? 'transaction' : 'transactions'}</li>
    ))}</ul>
  );
}

export default function VendorInventory({ workspaceId, token, revision }) {
  const [inventory, setInventory] = useState(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    request(`/api/workspaces/${workspaceId}/vendors`, { token, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setInventory({ data, revision });
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [workspaceId, token, revision, retry]);

  const current = inventory?.revision === revision ? inventory.data : null;
  return (
    <div className="payment-panel">
      <h3>Vendor inventory</h3>
      {error ? <div role="alert"><p>{error}</p><button onClick={() => {
        setError('');
        setRetry((value) => value + 1);
      }}>Retry</button></div> : !current ? <p role="status">Loading vendor spend…</p> : (
        <>
          <h4>Net spend by currency</h4>
          <SpendList totals={current.totals} />
          <h4>Unmatched spend</h4>
          <SpendList totals={current.unmatched} />
          <h4>Matched vendors</h4>
          {current.vendors.length === 0 ? <p>Match a merchant in Saved transactions to see its vendor here.</p> : (
            <div className="statement-table" tabIndex={0} role="region" aria-label="Vendor inventory table, scroll horizontally">
              <table>
                <thead><tr><th>Vendor</th><th>Merchant descriptions</th><th>Net spend</th></tr></thead>
                <tbody>{current.vendors.map((vendor) => (
                  <tr key={vendor.name}>
                    <th scope="row">{vendor.name}</th><td>{vendor.merchantCount}</td>
                    <td><SpendList totals={vendor.totals} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
