import test from 'node:test';
import assert from 'node:assert/strict';
import { spendRows, formatAmount, amountUnits } from '../src/features/workspaces/spend-data.mjs';

test('vendor chart never mixes currencies and preserves signed exact amounts', () => {
  const data = { vendors: [{ name: 'Linear', totals: [{ currency: 'USD', amount: '100', count: 2 }, { currency: 'EUR', amount: '99999', count: 1 }] }, { name: 'Refund', totals: [{ currency: 'USD', amount: '-25', count: 1 }] }], unmatched: [{ currency: 'USD', amount: '50', count: 1 }] };
  assert.deepEqual(spendRows(data, 'USD').map(({ name, amount, width }) => ({ name, amount, width })), [{ name: 'Linear', amount: '100', width: 100 }, { name: 'Unmatched merchants', amount: '50', width: 50 }, { name: 'Refund', amount: '-25', width: 25 }]);
  assert.equal(formatAmount('-1234567.000001'), '-1,234,567.000001');
  assert.equal(amountUnits('9007199254740993.000001'), 9007199254740993000001n);
  assert.deepEqual(spendRows({ vendors: [], unmatched: [] }, 'USD'), []);
});
