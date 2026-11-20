'use client';

import { useState } from 'react';
import { request } from '../workspaces/api-client';

export const followUpLabels = { 'awaiting-vendor': 'Awaiting vendor response', resolved: 'Resolved' };

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

  async function verify(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setSaving(true);
    setError('');
    try {
      await request(`${endpoint}/${item.id}/invoice`, { token, method: 'PUT',
        body: { ...fields, decisionRevision: item.decision.revision, executionRevision: item.execution.revision } });
      onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  async function recordFollowUp(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      await request(`${endpoint}/${item.id}/invoice/follow-ups`, { token, method: 'POST',
        body: { note: fields.get('note'), nextContactDate: fields.get('nextContactDate') || null, status: fields.get('status'), decisionRevision: item.decision.revision, executionRevision: item.execution.revision,
          previousRevision: item.execution.followUpRevision ?? null, noticeDeadline: item.noticeDeadline } });
      onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  const estimate = item.decision.estimate;
  return (<>
    {item.execution?.status === 'confirmed' && item.execution.invoice?.variance.startsWith('-') &&
      <form onSubmit={recordFollowUp}>
        <h4>Vendor follow-up · invoice {item.execution.invoice.reference}</h4>
        <label>Follow-up status
          <select name="status" defaultValue={item.execution.followUpStatus ?? 'awaiting-vendor'}>
            {Object.entries(followUpLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
          </select>
        </label>
        <label>Next contact date (optional, for open follow-ups)
          <input type="date" name="nextContactDate" defaultValue={item.execution.nextContactDate ?? ''} />
        </label>
        <label>Contact details or vendor response<textarea name="note" required maxLength={500}
          placeholder="When did you contact the vendor, and what did they say?" /></label>
        <button disabled={saving}>Save follow-up note</button>
      </form>}
    {estimate && item.execution?.status === 'confirmed' && !item.execution.invoice && <form onSubmit={verify}>
      <h4>Verify savings against an invoice · {item.name}</h4>
      <p>Use the seat charge for one full {estimate.period} in {estimate.currency}, excluding taxes and unrelated fees.</p>
      <label>Invoice reference<input name="reference" required maxLength={100} /></label>
      <label>Billing period start<input type="date" name="periodStart" required min={estimate.effectiveDate} /></label>
      <label>Invoiced seat charge ({estimate.currency})<input name="charge" required inputMode="decimal" /></label>
      <button disabled={saving}>Record invoice savings</button>
    </form>}
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
  </>);
}
