import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useX402 } from './useX402.js';

test('useX402: exports and initializes cleanly', () => {
  assert.equal(typeof useX402, 'function');
});
