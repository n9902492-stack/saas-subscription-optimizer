'use client';

import { useEffect, useState } from 'react';
import { request } from './api-client';
import StatementImport from '../imports/statement-import';
import TransactionList from '../transactions/transaction-list';
import VendorInventory from '../vendors/vendor-inventory';
import Subscriptions from '../subscriptions/subscriptions';
import RenewalCalendar from '../renewals/renewal-calendar';
import RenewalReminders from '../renewals/renewal-reminders';

export default function WorkspaceDashboard({ workspace, token, onBack }) {
  const endpoint = `/api/workspaces/${workspace.id}/payment-sources`;
  const canManageSources = ['Admin', 'Finance'].includes(workspace.role);
  const [sources, setSources] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [importVersion, setImportVersion] = useState(0);
  const [matchVersion, setMatchVersion] = useState(0);
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);

  useEffect(() => {
    if (!canManageSources) return;
    const controller = new AbortController();
    request(endpoint, { token, signal: controller.signal })
      .then(setSources)
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      });
    return () => controller.abort();
  }, [canManageSources, endpoint, token, refresh]);

  async function addSource(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaveError('');
    setSaving(true);
    try {
      const item = await request(endpoint, {
        token, method: 'POST', body: { label: data.get('label'), lastFour: data.get('lastFour') },
      });
      setSources((current) => [...current, item].sort((left, right) => left.label.localeCompare(right.label)));
      form.reset();
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="workspace-dashboard">
      <button type="button" className="secondary" onClick={onBack}>All workspaces</button>
      <h2>{workspace.name}</h2>
      <p>Your role · {workspace.role}</p>
      {canManageSources && (
        <div className="payment-panel">
          <h3>Payment sources</h3>
          <p>Register a corporate card using a nickname and optional last four digits.</p>
          {loadError && (
            <div role="alert">
              <p>{loadError}</p>
              <button onClick={() => {
                setLoadError('');
                setRefresh((value) => value + 1);
              }}>Retry</button>
            </div>
          )}
          {sources === null && !loadError && <p role="status">Loading payment sources…</p>}
          {sources !== null && (
            <>
              {sources.length ? (
                <ul>{sources.map((source) => (
                  <li key={source.id}>{source.label}{source.lastFour && ` · •••• ${source.lastFour}`}</li>
                ))}</ul>
              ) : <p>No payment sources added yet.</p>}
              <form onSubmit={addSource}>
                <label>Card nickname<input name="label" placeholder="Engineering card" maxLength={80} required /></label>
                <label>Last four digits (optional)<input name="lastFour" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} /></label>
                <button disabled={saving}>{saving ? 'Adding…' : 'Add payment source'}</button>
              </form>
              {saveError && <p role="alert">{saveError}</p>}
              {sources.length > 0 && <StatementImport workspaceId={workspace.id} sources={sources} token={token} onSaved={() => setImportVersion((value) => value + 1)} />}
            </>
          )}
        </div>
      )}
      {canManageSources && <TransactionList workspaceId={workspace.id} token={token} importVersion={importVersion} onMatched={() => setMatchVersion((value) => value + 1)} />}
      {canManageSources && <VendorInventory workspaceId={workspace.id} token={token} revision={importVersion + matchVersion} />}
      {canManageSources && <Subscriptions workspaceId={workspace.id} token={token} vendorRevision={matchVersion} onSaved={() => setSubscriptionVersion((value) => value + 1)} />}
      {canManageSources && <RenewalCalendar workspaceId={workspace.id} token={token} revision={subscriptionVersion} />}
      {canManageSources && <RenewalReminders workspaceId={workspace.id} token={token} revision={subscriptionVersion} />}
    </div>
  );
}
