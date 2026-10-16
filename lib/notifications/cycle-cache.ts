// Per-cycle only: reuse identical reads across rules without retaining stale
// prices between scheduled runs or mixing rules' different time windows.
export function createCycleLookup<T>(load: (key: string) => Promise<T>) {
  const pending = new Map<string, Promise<T>>();
  return (key: string): Promise<T> => {
    let value = pending.get(key);
    if (!value) {
      value = load(key).catch(error => { pending.delete(key); throw error; });
      pending.set(key, value);
    }
    return value;
  };
}
