export function downloadSavingsSummary({ groups, missingEstimate }) {
  const rows = [
    ['Coverage', 'Currency', 'Billing period', 'Seat reductions', 'Estimated savings',
      'Invoices reviewed', 'Invoice savings', 'Difference from reviewed estimates'],
    ...groups.map(group => ['Estimated', group.currency, group.period, group.decisions,
      group.estimated, group.reviewed, group.actual, group.variance]),
  ];
  if (missingEstimate > 0) {
    rows.push(['Missing estimate', '', '', missingEstimate, '', '', '', '']);
  }
  const csv = rows.map(row => row.map(value =>
    '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n');
  const file = new Blob(['\uFEFF', csv, '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'workspace-savings-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
