/**
 * Poll only a visible page, with one request in flight. Keep the normal interval
 * between refreshes; waking a stale/hidden tab triggers one immediate refresh.
 * @param {(signal: AbortSignal) => unknown | Promise<unknown>} task
 * @param {number} intervalMs
 * @param {any} [options] Injectable browser/timer surfaces for deterministic tests.
 */
export function startVisiblePolling(task, intervalMs, options = {}) {
  const doc = options.document ?? globalThis.document;
  const win = options.window ?? globalThis.window;
  const later = options.setTimeout ?? globalThis.setTimeout;
  const clear = options.clearTimeout ?? globalThis.clearTimeout;
  const now = options.now ?? Date.now;
  let stopped = false, timer, controller, running = false;
  let lastStarted = -Infinity;
  let refreshOnVisible = false;
  const visible = () => !doc?.hidden;
  const cancelTimer = () => { if (timer !== undefined) { clear(timer); timer = undefined; } };
  const schedule = () => {
    cancelTimer();
    if (!stopped && visible()) timer = later(() => { timer = undefined; void run(); }, intervalMs);
  };
  async function run() {
    if (stopped || running || !visible()) return;
    cancelTimer();
    running = true;
    refreshOnVisible = false;
    controller = new AbortController();
    lastStarted = now();
    try { await task(controller.signal); }
    catch (error) { if (error?.name !== 'AbortError') options.onError?.(error); }
    finally {
      running = false;
      controller = undefined;
      if (refreshOnVisible && visible() && !stopped) void run(); else schedule();
    }
  }
  const onVisibility = () => {
    cancelTimer();
    if (!visible()) {
      refreshOnVisible = true;
      controller?.abort();
    } else if (refreshOnVisible || now() - lastStarted >= intervalMs) {
      refreshOnVisible = true;
      if (!running) void run();
    } else schedule();
  };
  const onFocus = () => {
    if (visible() && !running && now() - lastStarted >= intervalMs) void run();
  };
  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('focus', onFocus);
  if (options.immediate === false) { lastStarted = now(); schedule(); }
  else void run();
  return () => {
    stopped = true;
    cancelTimer();
    controller?.abort();
    doc?.removeEventListener('visibilitychange', onVisibility);
    win?.removeEventListener('focus', onFocus);
  };
}
