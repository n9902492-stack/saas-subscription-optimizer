'use client';

import { useState } from 'react';
import { request } from '../workspaces/api-client';

export const executionLabels = {
  pending: 'Pending', submitted: 'Submitted to vendor', confirmed: 'Confirmed', reopened: 'Reopened',
};

const nextStatuses = {
  pending: ['submitted', 'confirmed'],
  submitted: ['confirmed', 'reopened'],
  confirmed: ['reopened'],
  reopened: ['submitted', 'confirmed'],
};

export default function RenewalExecutionForm({ item, endpoint, token, onClose, onSaved }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError('');
    setSaving(true);
    try {
      await request(`${endpoint}/${item.id}/execution`, {
        token, method: 'PUT',
        body: {
          status: fields.get('status'), note: fields.get('note'),
          decisionRevision: item.decision.revision,
          executionRevision: item.execution?.revision ?? null,
        },
      });
      onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <h4>Track vendor follow-up · {item.name}</h4>
      <label>Status
        <select name="status" defaultValue="" required>
          <option value="">Choose a status</option>
          {nextStatuses[item.execution?.status ?? 'pending'].map((status) =>
            <option key={status} value={status}>{executionLabels[status]}</option>)}
        </select>
      </label>
      <label>Vendor reference or reopening reason
        <textarea name="note" placeholder="Vendor ticket or confirmation reference" required maxLength={500} />
      </label>
      <button disabled={saving}>{saving ? 'Saving…' : 'Save execution status'}</button>
      <button type="button" className="secondary" disabled={saving} onClick={onClose}>Close and refresh</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
