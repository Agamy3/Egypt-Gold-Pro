import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startVisiblePolling } from '../lib/client/visible-polling.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(hidden = false) {
  const document = new EventTarget(), window = new EventTarget();
  document.hidden = hidden;
  let time = 0, serial = 0;
  const timers = new Map();
  const options = { document, window, now: () => time, setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, at: time + ms }); return id; }, clearTimeout: id => timers.delete(id) };
  return { options, timers, document, window,
    hide() { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); },
    show() { document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); },
    async advance(ms) { time += ms; for (const [id, t] of [...timers]) if (t.at <= time) { timers.delete(id); t.fn(); } await flush(); },
  };
}

test('visible polls retain interval; hidden tabs stop; showing and focus cause one refresh', async () => {
  const h = harness(); let calls = 0;
  const stop = startVisiblePolling(async () => { calls++; }, 30000, h.options);
  await flush(); assert.equal(calls, 1);
  await h.advance(29999); assert.equal(calls, 1);
  await h.advance(1); assert.equal(calls, 2);
  h.hide(); await h.advance(300000); assert.equal(calls, 2); assert.equal(h.timers.size, 0);
  h.show(); await flush(); assert.equal(calls, 3);
  h.window.dispatchEvent(new Event('focus')); await flush(); assert.equal(calls, 3);
  stop(); assert.equal(h.timers.size, 0);
});

test('slow requests never overlap; hiding/unmounting aborts outstanding requests', async () => {
  const h = harness(); let calls = 0, activeSignal, finish;
  const stop = startVisiblePolling(signal => { calls++; activeSignal = signal; return new Promise(resolve => { finish = resolve; }); }, 100, h.options);
  await h.advance(1000); assert.equal(calls, 1);
  h.hide(); assert.equal(activeSignal.aborted, true);
  h.show(); await flush(); assert.equal(calls, 1);
  finish(); await flush(); assert.equal(calls, 2);
  stop(); assert.equal(activeSignal.aborted, true);
  finish(); await flush(); await h.advance(1000); assert.equal(calls, 2);
  h.show(); await flush(); assert.equal(calls, 2);
});

test('initial hidden pages do no work; preloaded data can delay its initial refresh', async () => {
  const h = harness(true); let calls = 0;
  const stop = startVisiblePolling(async () => { calls++; }, 100, h.options);
  await h.advance(1000); assert.equal(calls, 0);
  h.show(); await flush(); assert.equal(calls, 1); stop();
  const fresh = harness();
  const stopFresh = startVisiblePolling(async () => { calls++; }, 100, { ...fresh.options, immediate: false });
  await flush(); assert.equal(calls, 1);
  await fresh.advance(100); assert.equal(calls, 2); stopFresh();
});

test('transient failures retry on the next normal interval, not in a tight loop', async () => {
  const h = harness(); let calls = 0, errors = 0;
  const stop = startVisiblePolling(async () => { if (++calls === 1) throw Error('temporary'); }, 100, { ...h.options, onError: () => errors++ });
  await flush(); assert.equal(errors, 1); assert.equal(calls, 1);
  await h.advance(100); assert.equal(calls, 2); stop();
});
