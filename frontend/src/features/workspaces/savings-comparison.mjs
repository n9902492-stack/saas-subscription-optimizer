function units(amount) {
  const negative = amount.startsWith('-');
  const [integer, fraction = ''] = amount.replace(/^-/, '').split('.');
  const value = BigInt(integer + fraction.padEnd(6, '0'));
  return negative ? -value : value;
}
function decimal(value) {
  const absolute = value < 0n ? -value : value;
  const fraction = String(absolute % 1000000n).padStart(6, '0').replace(/0+$/, '');
  return `${value < 0n ? '-' : ''}${absolute / 1000000n}${fraction ? `.${fraction}` : ''}`;
}
export function savingsComparison(group) {
  if (group.actual === null || group.variance === null || !group.reviewed) return null;
  const actual = units(group.actual);
  // Variance is actual minus the estimates for the reviewed invoices only.
  const estimate = actual - units(group.variance);
  const absolute = value => value < 0n ? -value : value;
  const maximum = [absolute(actual), absolute(estimate), 1n].reduce((a, b) => a > b ? a : b);
  return { estimate: decimal(estimate), actual: group.actual,
    estimatedWidth: Number(absolute(estimate) * 10000n / maximum) / 100,
    actualWidth: Number(absolute(actual) * 10000n / maximum) / 100,
    negative: actual < 0n || estimate < 0n };
}
