function units(amount) {
  const [integer, fraction = ''] = amount.split('.');
  return BigInt(integer + fraction.padEnd(6, '0'));
}

function decimal(value) {
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return (value < 0n ? '-' : '') + String(absolute / 1000000n) + (fraction ? '.' + fraction : '');
}

export function reconcileInvoice(estimate, input) {
  const { reference, periodStart, charge } = input;
  if (typeof reference !== 'string' || !reference.trim() || reference.length > 100 ||
      typeof charge !== 'string' || !/^\d{1,26}(\.\d{1,6})?$/.test(charge) ||
      typeof periodStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) ||
      periodStart < estimate.effectiveDate) return null;
  const date = new Date(periodStart);
  if (!Number.isFinite(date.getTime()) || !date.toISOString().startsWith(periodStart)) return null;
  const baseline = BigInt(estimate.committedSeats) * units(estimate.rate);
  const savings = baseline - units(charge);
  return { reference: reference.trim(), periodStart, charge, baseline: decimal(baseline),
    savings: decimal(savings), variance: decimal(savings - units(estimate.amount)),
    currency: estimate.currency, period: estimate.period, expected: estimate.amount };
}
