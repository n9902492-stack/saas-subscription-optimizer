'use client';

import { useEffect, useState } from 'react';
import { request } from '../workspaces/api-client';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function buildDays(month, rows) {
  const start = new Date(`${month}-01T00:00:00Z`);
  const days = Array.from({ length: (start.getUTCDay() + 6) % 7 }, () => null);
  const byDate = new Map();
  for (const row of rows) {
    const entries = byDate.get(row.noticeDeadline) ?? [];
    entries.push(row);
    byDate.set(row.noticeDeadline, entries);
  }
  for (const day = new Date(start); day.getUTCMonth() === start.getUTCMonth(); day.setUTCDate(day.getUTCDate() + 1)) {
    const key = day.toISOString().slice(0, 10);
    days.push({ key, number: day.getUTCDate(), entries: byDate.get(key) ?? [] });
  }
  return days;
}

export default function RenewalCalendar({ workspaceId, token, revision }) {
  const [month, setMonth] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = month ? `?month=${encodeURIComponent(month)}` : '';
    request(`/api/workspaces/${workspaceId}/renewals${query}`, { token, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setSnapshot({ data, month, revision, retry });
          setError('');
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [workspaceId, token, month, revision, retry]);

  const data = snapshot?.month === month && snapshot.revision === revision && snapshot.retry === retry
    ? snapshot.data : null;

  function changeMonth(offset) {
    const target = new Date(`${data.month}-01T00:00:00Z`);
    target.setUTCMonth(target.getUTCMonth() + offset);
    const next = target.toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(next) || next === '0000-12' || next === '9999-12') return;
    setError('');
    setMonth(next);
  }

  return (
    <section className="payment-panel">
      <h3>Renewal calendar</h3>
      {error ? (
        <div role="alert"><p>{error}</p><button onClick={() => {
          setError('');
          setRetry((value) => value + 1);
        }}>Retry</button></div>
      ) : !data ? <p role="status">Loading notice deadlines…</p> : (
        <>
          <p>{data.overdueCount} past verified deadlines · {data.unverifiedCount} unverified subscriptions</p>
          <div className="renewal-nav">
            <button type="button" className="secondary" onClick={() => changeMonth(-1)}>Previous month</button>
            <strong aria-live="polite">{monthLabel.format(new Date(`${data.month}-01T00:00:00Z`))}</strong>
            <button type="button" className="secondary" onClick={() => changeMonth(1)}>Next month</button>
          </div>
          <div className="renewal-scroll">
            <div className="renewal-grid">
              {weekdays.map((day) => <strong key={day}>{day}</strong>)}
              {buildDays(data.month, data.calendar.entries).map((day, index) => day ? (
                <div key={day.key} className="renewal-day" aria-current={day.key === data.today ? 'date' : undefined}>
                  <time dateTime={day.key}>{day.number}</time>
                  {day.entries.length > 0 && <ul>{day.entries.map((row) => <li key={row.id}>{row.name}</li>)}</ul>}
                </div>
              ) : <div key={`empty-${index}`} />)}
            </div>
          </div>
          {data.calendar.truncated && <p>Showing the first 200 deadlines for this month.</p>}
          <h4>Verified deadlines in the next 30 days</h4>
          <p>{data.today} to {data.upcomingThrough} · UTC</p>
          {data.upcoming.entries.length ? (
            <ul>{data.upcoming.entries.map((row) => (
              <li key={row.id}>
                <strong>{row.noticeDeadline}</strong> · {row.name} ({row.vendor})
                <br />Owner {row.owner ?? 'unavailable'} · Contract end {row.contractEnd ?? 'unknown'}
              </li>
            ))}</ul>
          ) : <p>No verified notice deadlines in this window.</p>}
          {data.upcoming.truncated && <p>Showing the first 200 upcoming deadlines.</p>}
        </>
      )}
    </section>
  );
}
