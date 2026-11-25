export function amountUnits(value) {
  const [integer, fraction = ''] = value.replace(/^-/, '').split('.');
  return BigInt(integer + fraction.padEnd(6, '0')) * (value.startsWith('-') ? -1n : 1n);
}
export function formatAmount(value) {
  const [integer, fraction] = value.split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? `.${fraction}` : '');
}
export function spendRows(data, currency) {
  const rows = data.vendors.flatMap(vendor => vendor.totals.filter(total => total.currency === currency).map(total => ({ name: vendor.name, ...total })));
  const unmatched = data.unmatched.find(total => total.currency === currency);
  if (unmatched) rows.push({ name: 'Unmatched merchants', ...unmatched });
  const magnitude = row => { const amount = amountUnits(row.amount); return amount < 0n ? -amount : amount; };
  const maximum = rows.reduce((value, row) => magnitude(row) > value ? magnitude(row) : value, 1n);
  return rows.sort((a, b) => magnitude(a) === magnitude(b) ? a.name.localeCompare(b.name) : magnitude(a) > magnitude(b) ? -1 : 1)
    .slice(0, 6).map(row => ({ ...row, width: Number(magnitude(row) * 10000n / maximum) / 100 }));
}
