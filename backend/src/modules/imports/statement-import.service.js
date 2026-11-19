import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';

const fields = ['date', 'merchant', 'amount', 'currency'];

export function readStatement(csv, mapping) {
  if (typeof csv !== 'string' || !csv.trim() || Buffer.byteLength(csv) > 131072) {
    throw new Error('Choose a UTF-8 CSV file no larger than 128 KiB.');
  }
  let records;
  try {
    records = parse(csv, { bom: true, skip_empty_lines: true, relax_column_count: true, max_record_size: 4096 });
  } catch {
    throw new Error('CSV could not be read. Check quoting and row sizes.');
  }
  const [columns, ...rows] = records;
  if (!columns || columns.length > 40 || columns.some((column) => column.length > 120) || rows.length > 1000) {
    throw new Error('CSV must have one header row, up to 40 columns and up to 1,000 transactions.');
  }
  if (!mapping) return { columns };
  const positions = fields.map((field) => mapping[field]);
  if (new Set(positions).size !== fields.length ||
      positions.some((position) => !Number.isInteger(position) || position < 0 || position >= columns.length)) {
    throw new Error('Map each field to a different CSV column.');
  }
  if (!rows.length) throw new Error('The file has no transactions.');

  const transactions = [];
  const errors = [];
  rows.forEach((row, index) => {
    const [date, merchant, amount, currency] = positions.map((position) => row[position]?.trim() ?? '');
    const normalizedCurrency = currency.toUpperCase();
    let message;
    if (row.length !== columns.length) message = 'Column count does not match the header.';
    else if (!validDate(date)) message = 'Use a valid date in YYYY-MM-DD format.';
    else if (!merchant || merchant.length > 160 || /(?:\d[ -]?){12,}/.test(merchant)) message = 'Enter a merchant name without a full card number.';
    else if (!/^-?\d{1,12}(?:\.\d{1,4})?$/.test(amount)) message = 'Use a signed decimal amount without currency symbols or separators.';
    else if (!/^[A-Z]{3}$/.test(normalizedCurrency)) message = 'Use a three-letter currency code.';
    if (message) {
      errors.push({ row: index + 2, message });
      return;
    }
    const [whole, fraction = ''] = amount.replace(/^-/, '').split('.');
    const digits = fraction.replace(/0+$/, '');
    const value = whole.replace(/^0+(?=\d)/, '') + (digits ? `.${digits}` : '');
    transactions.push({ date, merchant, amount: amount.startsWith('-') && value !== '0' ? `-${value}` : value, currency: normalizedCurrency });
  });

  const hash = createHash('sha256')
    .update(JSON.stringify(transactions.map((row) => JSON.stringify(row)).sort()))
    .digest('hex');
  return { transactions, errors, hash };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
