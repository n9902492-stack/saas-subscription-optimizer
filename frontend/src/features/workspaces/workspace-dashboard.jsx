'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { request } from './api-client';
import StatementImport from '../imports/statement-import';
import TransactionList from '../transactions/transaction-list';
import VendorInventory from '../vendors/vendor-inventory';
import Subscriptions from '../subscriptions/subscriptions';
import RenewalCalendar from '../renewals/renewal-calendar';
import RenewalReminders from '../renewals/renewal-reminders';
import RenewalDecisions from '../renewals/renewal-decisions';
import SavingsSummary from '../renewals/savings-summary';
import DashboardInsights from './dashboard-insights';

const viewNames = { overview: 'Overview', inventory: 'Application inventory', usage: 'License usage', renewals: 'Renewals', savings: 'Savings', transactions: 'Transactions & imports' };
function NavigationIcon({ name }) {
  const paths = { overview: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', inventory: 'M4 4h16v16H4zM4 9h16M9 9v11', usage: 'M4 20V10M10 20V4M16 20v-7M22 20V7', renewals: 'M4 5h16v16H4zM8 2v6M16 2v6M4 11h16', savings: 'm3 16 6-6 4 3 8-9M15 4h6v6M3 21h18', transactions: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h4' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function WorkspaceDashboard({ workspace, token, onBack, onSignOut, signingOut }) {
  const canManage = ['Admin', 'Finance'].includes(workspace.role);
  const endpoint = `/api/workspaces/${workspace.id}/payment-sources`;
  const [view, setView] = useState('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sources, setSources] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [importVersion, setImportVersion] = useState(0);
  const [matchVersion, setMatchVersion] = useState(0);
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const [decisionVersion, setDecisionVersion] = useState(0);
  const [renewalView, setRenewalView] = useState('all');
  const [createRequest, setCreateRequest] = useState(0);
  const [focusRequest, setFocusRequest] = useState(null);
  const heading = useRef(null);
  const allowed = canManage ? Object.keys(viewNames) : ['overview', 'renewals'];
  const revision = `${subscriptionVersion}-${decisionVersion}-${importVersion}-${matchVersion}`;

  useEffect(() => {
    function syncView() {
      const hash = window.location.hash.slice(1);
      const aliases = { subscriptions: 'inventory', 'renewal-decisions': 'renewals', 'renewal-calendar': 'renewals', 'payment-sources': 'transactions' };
      const next = aliases[hash] ?? hash;
      const allowedViews = canManage ? Object.keys(viewNames) : ['overview', 'renewals'];
      setView(allowedViews.includes(next) ? next : 'overview');
      setMobileOpen(false);
    }
    syncView();
    window.addEventListener('hashchange', syncView);
    window.addEventListener('popstate', syncView);
    return () => { window.removeEventListener('hashchange', syncView); window.removeEventListener('popstate', syncView); };
  }, [canManage]);

  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }); }, [view]);
  function navigate(next) {
    if (!allowed.includes(next)) return;
    setView(next); setMobileOpen(false);
    if (window.location.hash !== `#${next}`) window.history.pushState(window.history.state, '', `#${next}`);
  }
  function changeRenewalView(next) { setFocusRequest(null); setRenewalView(next); }
  function openRenewals(filter = 'all') { changeRenewalView(filter); navigate('renewals'); }
  function focusRenewal(id) { setRenewalView('all'); setFocusRequest({ id, key: Date.now() }); navigate('renewals'); }
  function addSubscription() { navigate('inventory'); setCreateRequest(value => value + 1); }

  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    request(endpoint, { token, signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setSources(result); setLoadError(''); } })
      .catch(error => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [canManage, endpoint, token, refresh]);

  async function addSource(event) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    setSaveError(''); setSaving(true);
    try {
      const item = await request(endpoint, { token, method: 'POST', body: { label: data.get('label'), lastFour: data.get('lastFour') } });
      setSources(current => [...current, item].sort((a, b) => a.label.localeCompare(b.label))); form.reset();
    } catch (error) { setSaveError(error.message); } finally { setSaving(false); }
  }

  return <div className="workspace-console">
    <aside className={`console-sidebar${mobileOpen ? ' is-open' : ''}`} aria-label="Workspace navigation">
      <div className="console-sidebar-brand"><Link className="brand" href="/">SaaS Optimizer</Link><button type="button" className="console-menu-toggle" aria-controls="console-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>Menu</button></div>
      <div className="console-sidebar-body" id="console-navigation">
        <div className="console-workspace"><span>WORKSPACE</span><strong>{workspace.name}</strong><span className="console-role">{workspace.role}</span></div>
        <nav aria-label="Workspace views">{allowed.map(id => <a key={id} href={`#${id}`} aria-current={view === id ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(id); }}><NavigationIcon name={id} /><span>{viewNames[id]}</span></a>)}</nav>
        <div className="console-sidebar-footer"><button type="button" onClick={onBack}>All workspaces</button><button type="button" onClick={onSignOut} disabled={signingOut}>Sign out</button></div>
      </div>
    </aside>
    <div className="console-main">
      <header className="console-heading"><div><span className="eyebrow">Workspace / {workspace.name}</span><h1 ref={heading} tabIndex={-1}>{view === 'overview' && canManage ? 'Spend Overview' : viewNames[view]}</h1></div><div className="console-heading-actions"><span className="role-badge">{workspace.role}</span>{view === 'overview' && canManage && <button onClick={() => navigate('transactions')}>Import statement</button>}</div></header>
      <section hidden={view !== 'overview'} aria-label="Overview view">
        <DashboardInsights workspaceId={workspace.id} token={token} canManage={canManage} revision={revision} onAddSubscription={addSubscription} onImport={() => navigate('transactions')} onOpenInventory={() => navigate('inventory')} onFocusRenewal={focusRenewal} onReviewRenewals={() => openRenewals()} onReviewInvoices={() => openRenewals('awaiting-invoice')} onOpenSavings={() => navigate('savings')} />
      </section>
      {canManage && <section hidden={view !== 'inventory' && view !== 'usage'} aria-label={`${view === 'usage' ? 'License usage' : 'Application inventory'} view`}>
        <Subscriptions workspaceId={workspace.id} token={token} mode={view === 'usage' ? 'usage' : 'inventory'} vendorRevision={`${matchVersion}-${importVersion}`} createRequest={createRequest} onSaved={() => setSubscriptionVersion(value => value + 1)} />
      </section>}
      <section hidden={view !== 'renewals'} aria-label="Renewals view">
        {canManage && <div className="console-renewal-actions" aria-label="Renewal queues"><button className={renewalView === 'all' ? '' : 'secondary'} onClick={() => changeRenewalView('all')}>All decisions</button><button className={renewalView === 'awaiting-invoice' ? '' : 'secondary'} onClick={() => changeRenewalView('awaiting-invoice')}>Pending invoice reviews</button><button className={renewalView === 'open-follow-ups' ? '' : 'secondary'} onClick={() => changeRenewalView('open-follow-ups')}>Open vendor follow-ups</button></div>}
        <div id="renewal-decisions"><RenewalDecisions workspaceId={workspace.id} token={token} revision={subscriptionVersion} showSavings={canManage} view={renewalView} setView={changeRenewalView} focusRequest={focusRequest} onClearFocus={() => setFocusRequest(null)} onChanged={() => setDecisionVersion(value => value + 1)} /></div>
        {canManage && <div className="console-renewals-grid"><RenewalCalendar workspaceId={workspace.id} token={token} revision={subscriptionVersion} compact /><RenewalReminders workspaceId={workspace.id} token={token} revision={subscriptionVersion} /></div>}
      </section>
      {canManage && <section hidden={view !== 'savings'} aria-label="Savings view" className="console-savings"><SavingsSummary key={revision} endpoint={`/api/workspaces/${workspace.id}/renewal-decisions`} token={token} compact onAddSubscription={addSubscription} onReviewInvoices={() => openRenewals('awaiting-invoice')} /></section>}
      {canManage && <section hidden={view !== 'transactions'} aria-label="Transactions and imports view">
        <div className="payment-panel" id="payment-sources"><h2>Payment sources</h2><p>Register a corporate card before importing its statement.</p>
          {loadError && <div role="alert"><p>{loadError}</p><button onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
          {sources === null && !loadError && <p role="status">Loading payment sources...</p>}
          {sources !== null && <>
            {sources.length ? <ul>{sources.map(source => <li key={source.id}>{source.label}{source.lastFour ? ` - ending ${source.lastFour}` : ''}</li>)}</ul> : <p>No payment sources added yet.</p>}
            <form onSubmit={addSource}><label>Card nickname<input name="label" placeholder="Engineering card" maxLength={80} required /></label><label>Last four digits (optional)<input name="lastFour" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} /></label><button disabled={saving}>{saving ? 'Adding...' : 'Add payment source'}</button></form>
            {saveError && <p role="alert">{saveError}</p>}
            {sources.length > 0 && <StatementImport workspaceId={workspace.id} sources={sources} token={token} onSaved={() => setImportVersion(value => value + 1)} />}
          </>}
        </div>
        <TransactionList workspaceId={workspace.id} token={token} importVersion={importVersion} onMatched={() => setMatchVersion(value => value + 1)} />
        <VendorInventory workspaceId={workspace.id} token={token} revision={`${importVersion}-${matchVersion}`} />
      </section>}
    </div>
  </div>;
}
