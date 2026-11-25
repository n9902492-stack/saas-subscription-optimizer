'use client';

import { useEffect, useState } from 'react';
import { request } from './api-client';
import { formatAmount, amountUnits } from './spend-data.mjs';

function CurrencyValues({ totals, savings = false }) {
  return <ul className="console-currency-values">{totals.map(item => <li key={item.currency + (item.period ?? '')}><strong>{item.currency} {formatAmount(savings ? item.actual : item.amount)}</strong>{item.period && <span>per {item.period}</span>}</li>)}</ul>;
}
function MonthlySpend({ data, onImport }) {
  const [selected, setSelected] = useState('');
  const currencies = [...new Set(data?.items.map(item => item.currency) ?? [])];
  const currency = currencies.includes(selected) ? selected : currencies[0];
  const records = data?.items.filter(item => item.currency === currency) ?? [];
  const last = records.at(-1)?.month;
  const months = last ? Array.from({length:6}, (_, index) => { const date = new Date(last + '-01T00:00:00Z'); date.setUTCMonth(date.getUTCMonth() - 5 + index); return date.toISOString().slice(0,7); }) : [];
  const rows = months.map(month => ({ month, amount: records.find(item => item.month === month)?.amount ?? '0' }));
  const magnitude = amount => { const n = amountUnits(amount); return n < 0n ? -n : n; };
  const maximum = rows.reduce((max,row) => magnitude(row.amount)>max?magnitude(row.amount):max,1n);
  return <article className="dashboard-card monthly-spend-card"><div className="console-card-heading"><div><h2>Monthly SaaS spend</h2><p>Saved statement transactions, net of refunds.</p></div>{currencies.length>1 && <label className="chart-currency">Currency<select aria-label="Spend chart currency" value={currency} onChange={event=>setSelected(event.target.value)}>{currencies.map(code=><option key={code}>{code}</option>)}</select></label>}</div>
    {!data ? <p role="status">Monthly spend is unavailable.</p> : !records.length ? <div className="console-empty"><h3>No recorded spend yet</h3><p>Import a statement to see your monthly spend.</p><button onClick={onImport}>Import a statement</button></div> : <><ul className="monthly-spend-chart" aria-label={'Monthly spend in '+currency}>{rows.map(row=><li key={row.month}><strong>{currency} {formatAmount(row.amount)}</strong><div className="monthly-bar-space"><span className={row.amount.startsWith('-')?'is-refund':''} style={{height:Math.max(1,Number(magnitude(row.amount)*100n/maximum))+'%'}} /></div><time dateTime={row.month}>{new Date(row.month+'-01T00:00:00Z').toLocaleDateString('en',{month:'short',year:'2-digit',timeZone:'UTC'})}</time></li>)}</ul><p className="card-note">Six months ending with the latest saved transaction. Months without transactions show zero. Unmatched merchants are included; this is recorded statement spend, not allocated subscription cost.</p></>}
  </article>;
}
function RecentTransactions({ data, onViewAll }) {
  return <article className="dashboard-card recent-transactions"><div className="console-card-heading"><div><h2>Recent transactions</h2><p>Latest saved statement activity.</p></div><a href="#transactions" onClick={event=>{event.preventDefault();onViewAll();}}>View all transactions</a></div>{!data?<p role="status">Transactions are unavailable.</p>:!data.items.length?<p>No saved transactions yet. Import a statement to get started.</p>:<div className="statement-table" role="region" aria-label="Recent transactions, scroll horizontally" tabIndex={0}><table><caption>Five most recent transactions</caption><thead><tr><th scope="col">Merchant</th><th scope="col">Matched vendor</th><th scope="col">Date</th><th scope="col">Amount</th></tr></thead><tbody>{data.items.slice(0,5).map(item=><tr key={item.id}><td>{item.merchant}</td><td>{item.vendor??'Unmatched'}</td><td><time dateTime={item.date}>{item.date}</time></td><td>{item.currency} {formatAmount(item.amount)}</td></tr>)}</tbody></table></div>}</article>;
}

export default function DashboardInsights({ workspaceId, token, revision, canManage, onAddSubscription, onImport, onOpenInventory, onFocusRenewal, onReviewRenewals, onReviewInvoices, onOpenSavings }) {
  const [snapshot, setSnapshot] = useState(null), [retry, setRetry] = useState(0);
  const endpoint = `/api/workspaces/${workspaceId}`;
  useEffect(() => {
    const controller = new AbortController();
    const paths = canManage ? { subscriptions:'/subscriptions', spend:'/vendors', renewals:'/renewals', savings:'/renewal-decisions/savings-summary', monthly:'/transactions/monthly-spend', transactions:'/transactions' } : { assigned:'/renewal-decisions?view=all&upcoming=true&sort=notice-asc' };
    Promise.allSettled(Object.values(paths).map(path => request(endpoint + path, {token, signal:controller.signal}))).then(results => {
      if (!controller.signal.aborted) setSnapshot({endpoint, revision, retry, results:Object.fromEntries(Object.keys(paths).map((name,index)=>[name,results[index]]))});
    });
    return () => controller.abort();
  }, [endpoint,token,revision,retry,canManage]);
  const results = snapshot?.endpoint === endpoint && snapshot.revision === revision && snapshot.retry === retry ? snapshot.results : null;
  const data = key => results?.[key]?.status === 'fulfilled' ? results[key].value : null;
  const subscriptions=data('subscriptions'), spend=data('spend'), renewals=data('renewals'), savings=data('savings'), assigned=data('assigned');
  const monthly=data('monthly'), transactions=data('transactions');
  const verified=savings?.groups.filter(group=>group.actual!==null) ?? [];
  const entries=[...(canManage ? renewals?.upcoming.entries ?? [] : assigned?.items ?? [])].sort((a,b)=>a.noticeDeadline.localeCompare(b.noticeDeadline));
  const empty=label=><p className="console-metric-empty">{label}</p>;
  const metric=(name,content,note,accent=false)=><article className={`metric-card${accent?' metric-card--verified':''}`}><h2>{name}</h2>{content}<p>{note}</p></article>;
  return <>
    {canManage && <div className="console-kpis" aria-label="Workspace overview">
      {metric('Recorded spend',!results?<p role="status">Loading...</p>:spend?.totals.length?<CurrencyValues totals={spend.totals}/>:empty(spend?'No statements yet':'Unavailable'),'Saved statements, by original currency')}
      {metric('Tracked subscriptions',!results?<p role="status">Loading...</p>:subscriptions?<strong className="metric-value">{subscriptions.total ?? subscriptions.items.length}</strong>:empty('Unavailable'),'Subscription records in this workspace')}
      {metric('Upcoming renewals',!results?<p role="status">Loading...</p>:renewals?<strong className="metric-value">{renewals.upcoming.entries.length}{renewals.upcoming.truncated?'+':''}</strong>:empty('Unavailable'),'Verified notice deadlines in the next 30 days')}
      {metric('Invoice-verified savings',!results?<p role="status">Loading...</p>:verified.length?<CurrencyValues totals={verified} savings/>:empty(savings?'Not yet verified':'Unavailable'),'Separate currencies and billing periods',true)}
    </div>}
    {results && Object.values(results).some(result=>result.status==='rejected') && <div className="overview-error" role="alert">Some overview data could not be loaded. <button className="secondary" onClick={()=>setRetry(value=>value+1)}>Retry overview</button></div>}
    {canManage && subscriptions?.total===0 && <section className="console-onboarding"><div><h2>Build your software portfolio</h2><p>Add an application, import spend, then plan the next renewal.</p></div><button onClick={onAddSubscription}>Add a subscription</button><button className="secondary" onClick={onImport}>Import a statement</button></section>}
    <div className={`spend-overview-layout${canManage?'':' console-overview-grid--owner'}`}>
      {canManage && <div className="spend-overview-primary">{!results?<article className="dashboard-card"><h2>Monthly SaaS spend</h2><p role="status">Loading spend...</p></article>:<MonthlySpend data={monthly} onImport={onImport}/>}<RecentTransactions data={transactions} onViewAll={onImport}/></div>}
      <div className="spend-overview-summary">
      <article className="dashboard-card console-upcoming"><div className="console-card-heading"><div><h2>{canManage?'Upcoming renewals':'Your upcoming renewals'}</h2><p>{canManage?'Next 30 days, ordered by notice deadline.':'Assigned to you, ordered by notice deadline.'}</p></div><button className="secondary" onClick={onReviewRenewals}>View all</button></div>
        {!results?<p role="status">Loading renewals...</p>:(!renewals&&canManage)||(!assigned&&!canManage)?<p>Renewals are unavailable right now.</p>:entries.length?<>
          <ol className="console-renewal-list">{entries.slice(0,6).map(item=><li key={item.id}><button onClick={()=>onFocusRenewal(item.id)}><span className="application-monogram" aria-hidden="true">{item.vendor.slice(0,1).toUpperCase()}</span><span><strong>{item.vendor}</strong><small>{item.name}</small></span><span className="console-due"><time dateTime={item.noticeDeadline}>{item.noticeDeadline}</time><small>Notice deadline</small></span></button></li>)}</ol><p className="card-note">Showing up to six verified notice deadlines. All dates in UTC.{(renewals?.upcoming.truncated||assigned?.hasMore)&&' More records are available in Renewals.'}</p>
        </>:<div className="console-empty"><span className="empty-symbol" aria-hidden="true">/</span><h3>No upcoming verified deadlines</h3><p>{canManage?'Add verified notice dates to your subscription records to plan ahead.':'Renewals assigned to you will appear here when their notice dates are verified.'}</p>{canManage&&<button className="secondary" onClick={onOpenInventory}>Open application inventory</button>}</div>}
      </article>
      {canManage && <article className="dashboard-card verified-summary"><span className="eyebrow">Invoice reviewed</span><h2>Invoice-verified savings</h2>{!results?<p role="status">Loading savings...</p>:!savings?<p>Savings are unavailable.</p>:verified.length?<CurrencyValues totals={verified} savings/>:<><strong className="savings-pending">Not yet verified</strong><p>Review an invoice to confirm savings. Estimates stay separate.</p></>}<button className="secondary" onClick={onOpenSavings}>View savings</button></article>}
      </div>
    </div>
  </>;
}
