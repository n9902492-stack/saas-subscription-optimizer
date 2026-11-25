'use client';

import { useEffect, useState } from 'react';
import { request } from '../workspaces/api-client';

const statusLabels = { elapsed: 'Reminder date passed', due: 'Due today', scheduled: 'Scheduled' };

export default function RenewalReminders({ workspaceId, token, revision }) {
  const [result, setResult] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    function load() {
      request(`/api/workspaces/${workspaceId}/renewals/reminders`, { token, signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) setResult({ data, revision, retry });
        })
        .catch((error) => {
          if (!controller.signal.aborted) setResult({ error: error.message, revision, retry });
        });
    }

    load();
    return () => controller.abort();
  }, [workspaceId, token, revision, retry]);

  const current = result?.revision === revision && result.retry === retry ? result : null;

  return (
    <section className="payment-panel">
      <h3>Renewal reminders</h3>
      <p>In-app reminders are scheduled 30 and 7 days before a verified notice deadline.</p>
      {!current ? <p role="status">Loading reminders…</p> : current.error ? (
        <div role="alert">
          <p>{current.error}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>
        </div>
      ) : (
        <>
          <p>Showing reminders through {current.data.upcomingThrough} (UTC) for open notice windows.</p>
          {current.data.items.length ? (
            <div className="statement-table" tabIndex={0} role="region" aria-label="Renewal reminders table, scroll horizontally">
              <table>
                <thead><tr><th>Subscription</th><th>Owner</th><th>Reminder</th><th>Notice deadline</th><th>Status</th></tr></thead>
                <tbody>{current.data.items.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">{item.name} · {item.vendor}</th>
                    <td>{item.owner ?? 'Unassigned'}</td>
                    <td>{item.reminderDate} · {item.daysBefore} days before</td>
                    <td>{item.noticeDeadline}</td>
                    <td>{statusLabels[item.status]}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p>No reminders in this window.</p>}
          {current.data.truncated && <p>Showing the first 200 reminders.</p>}
        </>
      )}
    </section>
  );
}
