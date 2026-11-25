import test from 'node:test';
import assert from 'node:assert/strict';
import { savingsComparison } from '../src/features/workspaces/savings-comparison.mjs';

test('comparison uses only reviewed estimates, not all estimated decisions', () => {
  const result = savingsComparison({ estimated: '80', actual: '30', variance: '-10', reviewed: 1, decisions: 2 });
  assert.deepEqual(result, { estimate: '40', actual: '30', estimatedWidth: 100, actualWidth: 75, negative: false });
});

test('comparison preserves exact decimals, handles zero and negative savings, and skips unreviewed groups', () => {
  assert.equal(savingsComparison({ actual: null, variance: null, reviewed: 0 }), null);
  assert.equal(savingsComparison({ actual: '0.3', variance: '0.1', reviewed: 1 }).estimate, '0.2');
  assert.equal(savingsComparison({ actual: '9007199254740993.123456', variance: '0.000001', reviewed: 1 }).estimate, '9007199254740993.123455');
  assert.equal(savingsComparison({ actual: '0', variance: '0', reviewed: 1 }).actualWidth, 0);
  assert.equal(savingsComparison({ actual: '-10', variance: '-50', reviewed: 1 }).negative, true);
});
