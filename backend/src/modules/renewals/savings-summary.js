import { decimal, units } from './decimal-amount.js';

export async function summarizeSavings(subscriptions, workspaceId) {
  const rows = subscriptions.find({
    workspaceId, noticeVerifiedAt: { $type: 'date' }, noticeDeadline: { $type: 'string' },
    'renewalDecision.action': 'reduce-seats',
    $expr: { $eq: ['$noticeDeadline', '$renewalDecision.noticeDeadline'] },
  }, { projection: { 'renewalDecision.estimate': 1, 'renewalDecision.revision': 1,
    'renewalExecution.decisionRevision': 1, 'renewalExecution.invoice': 1, 'renewalExecution.status': 1 } });
  const groups = new Map();
  let missingEstimate = 0;
  for await (const { renewalDecision, renewalExecution } of rows) {
    const estimate = renewalDecision.estimate;
    if (!estimate) { missingEstimate++; continue; }
    const { currency, period } = estimate;
    const key = currency + '/' + period;
    const group = groups.get(key) ?? { currency, period, decisions: 0, reviewed: 0, estimated: 0n, actual: 0n, variance: 0n };
    group.decisions++;
    group.estimated += units(estimate.amount);
    if (renewalExecution?.decisionRevision === renewalDecision.revision &&
        renewalExecution.status === 'confirmed' && renewalExecution.invoice) {
      group.reviewed++;
      group.actual += units(renewalExecution.invoice.savings);
      group.variance += units(renewalExecution.invoice.variance);
    }
    groups.set(key, group);
  }
  return { missingEstimate, groups: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => ({
    ...g, estimated: decimal(g.estimated), actual: g.reviewed ? decimal(g.actual) : null,
    variance: g.reviewed ? decimal(g.variance) : null,
  })) };
}
