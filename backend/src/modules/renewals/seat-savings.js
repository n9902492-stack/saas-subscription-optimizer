// Store decimal amounts as strings so contract rates retain their precision.
export function estimateSeatSavings(terms, reduction) {
  const { committedSeats, minimumSeats, rate, currency, period, effectiveDate } = terms;
  if (!Number.isSafeInteger(committedSeats) || committedSeats < reduction ||
      !Number.isSafeInteger(minimumSeats) || minimumSeats < 0 || minimumSeats > committedSeats ||
      typeof rate !== 'string' || !/^\d{1,10}(\.\d{1,6})?$/.test(rate) ||
      !Intl.supportedValuesOf('currency').includes(currency) ||
      !['month', 'quarter', 'year'].includes(period) ||
      typeof effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return null;
  const date = new Date(effectiveDate);
  if (!Number.isFinite(date.getTime()) || !date.toISOString().startsWith(effectiveDate)) return null;

  const billableReduction = Math.min(reduction, committedSeats - minimumSeats);
  const [whole, fraction = ''] = rate.split('.');
  const units = BigInt(whole + fraction) * BigInt(billableReduction);
  const digits = units.toString().padStart(fraction.length + 1, '0');
  const amount = fraction.length ? digits.slice(0, -fraction.length) + '.' + digits.slice(-fraction.length) : digits;
  return { committedSeats, minimumSeats, rate, currency, period, effectiveDate, billableReduction, amount };
}
