import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldDrip } from '../../src/lib/wallet/gas-policy.mjs';

const now = new Date('2026-11-20T18:00:00Z');
const config = { minBalanceWei: 1_000_000_000_000_000n, dailyCap: 300 };
const policy = overrides => shouldDrip({ balanceWei: 0n, lastDripAt: null, dripsToday: 0, now, config, ...overrides });
test('funds an empty new wallet', () => assert.deepEqual(policy({}), { drip: true }));
test('skips a funded wallet', () => assert.deepEqual(policy({ balanceWei: config.minBalanceWei }), { drip: false, reason: 'enough' }));
test('limits one drip per wallet per rolling day', () => {
  assert.deepEqual(policy({ lastDripAt: new Date(now.getTime() - 86_399_999) }), { drip: false, reason: 'wallet-limit' });
  assert.deepEqual(policy({ lastDripAt: new Date(now.getTime() - 86_400_000) }), { drip: true });
});
test('enforces the global rolling cap', () => assert.deepEqual(policy({ dripsToday: 300 }), { drip: false, reason: 'daily-cap' }));
