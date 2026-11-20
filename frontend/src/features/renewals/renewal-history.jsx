'use client';

import { useEffect, useState } from 'react';
import { request } from '../workspaces/api-client';
import { executionLabels } from './renewal-execution-form';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function RenewalHistory({ item, endpoint, token, decisionLabels, onClose }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request(`${endpoint}/${item.id}/history`, { token, signal: controller.signal })
      .then((events) => {
        if (!controller.signal.aborted) setResult({ events });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ error: error.message });
      });
    return () => controller.abort();
  }, [endpoint, item.id, token, attempt]);

  return (
    <section aria-label={`Renewal history for ${item.name}`}>
      <h4>Renewal history · {item.name}</h4>
      <p>Shows up to 100 recorded updates, newest first.</p>
      {!result ? <p role="status">Loading history…</p> : result.error ? (
        <div role="alert">
          <p>{result.error}</p>
          <button type="button" onClick={() => { setResult(null); setAttempt((value) => value + 1); }}>Retry</button>
        </div>
      ) : result.events.length ? (
        <ol>{result.events.map((event) => (
          <li key={event.revision}>
            <strong>{event.type === 'decision' ? decisionLabels[event.action] :
              `${executionLabels[event.previousStatus]} → ${executionLabels[event.status]}`}</strong>
            {event.seatsToReduce && ` · ${event.seatsToReduce} seats`}
            {event.estimate && <div>Estimated {event.estimate.currency} {event.estimate.amount} per {event.estimate.period} from {event.estimate.effectiveDate}.
              {' '}{event.estimate.billableReduction} billable seats at {event.estimate.rate} each
              {' '}({event.estimate.committedSeats} committed, {event.estimate.minimumSeats} minimum).</div>}
            <div>{event.actor} · {dateFormat.format(new Date(event.recordedAt))}</div>
            <div>Notice deadline {event.noticeDeadline}</div>
            <div>{event.reason ?? event.note}</div>
          </li>
        ))}</ol>
      ) : <p>No updates have been recorded since history was enabled.</p>}
      <button type="button" className="secondary" onClick={onClose}>Close history</button>
    </section>
  );
}
