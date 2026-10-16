import { webcrypto } from 'node:crypto';
import { createSnapshotHash } from './snapshot-hash';
import { generateParityHash } from './global-parity';

beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });

test('price changes beyond the common JSON prefix cannot collide', async () => {
  const first = { source: 'goldbullioneg', valid: true, stale: {}, prices: { 21: 4500, 24: 5100 } };
  const second = { ...first, prices: { 21: 4600, 24: 5200 } };
  expect(Buffer.from(JSON.stringify(first)).toString('base64').slice(0, 32))
    .toBe(Buffer.from(JSON.stringify(second)).toString('base64').slice(0, 32));
  const hash = await createSnapshotHash('EG', first.source, 1000, first.prices);
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(hash).not.toBe(await createSnapshotHash('EG', second.source, 1000, second.prices));
});

test('same observation retries are stable but later unchanged observations preserve history', async () => {
  const prices = { 21: 4500, 24: 5100 };
  const hash = await createSnapshotHash('EG', 'banklive', 1000, prices);
  expect(hash).toBe(await createSnapshotHash('EG', 'banklive', 1000, prices));
  expect(hash).not.toBe(await createSnapshotHash('EG', 'banklive', 61000, prices));
  expect(hash).not.toBe(await createSnapshotHash('EG', 'goldbullioneg', 1000, prices));
  expect(hash).not.toBe(await createSnapshotHash('SA', 'banklive', 1000, prices));
});

test('parity hashes include FX changes and retain their existing minute buckets', async () => {
  const hash = await generateParityHash('AE', 'global_parity', 3000, 3.6725, 120000);
  expect(hash).toBe(await generateParityHash('AE', 'global_parity', 3000, 3.6725, 179999));
  expect(hash).not.toBe(await generateParityHash('AE', 'global_parity', 3000, 3.6725, 180000));
  expect(hash).not.toBe(await generateParityHash('AE', 'global_parity', 3000, 3.6735, 120000));
});
