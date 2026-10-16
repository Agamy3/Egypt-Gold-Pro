import { createCycleLookup } from './cycle-cache';

test('identical history reads share work; different windows stay separate; cycles refresh', async () => {
  const load = jest.fn(async (key: string) => ({ key }));
  const cycle = createCycleLookup(load);
  const key = JSON.stringify({ country: 'EG', karat: 21, maxIso: '2026-10-16T12:00:00Z' });
  const [a, b] = await Promise.all([cycle(key), cycle(key)]);
  expect(a).toBe(b);
  expect(load).toHaveBeenCalledTimes(1);
  await cycle(key.replace('12:00', '11:00'));
  expect(load).toHaveBeenCalledTimes(2);
  await createCycleLookup(load)(key);
  expect(load).toHaveBeenCalledTimes(3);
});

test('failed reads can retry within a cycle', async () => {
  const load = jest.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce(42);
  const lookup = createCycleLookup(load);
  await expect(lookup('EG')).rejects.toThrow('temporary');
  await expect(lookup('EG')).resolves.toBe(42);
  expect(load).toHaveBeenCalledTimes(2);
});
