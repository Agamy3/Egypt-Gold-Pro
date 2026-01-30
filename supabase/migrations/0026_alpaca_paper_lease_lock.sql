-- Fix Alpaca loop locking: use a row-based lease lock instead of pg advisory locks.
-- Advisory locks are session-bound and can behave poorly with pooled connections.

alter table public.alpaca_paper_state
  add column if not exists run_lock_until timestamptz,
  add column if not exists run_lock_token uuid;

create index if not exists idx_alpaca_paper_state_run_lock_until
  on public.alpaca_paper_state(run_lock_until);

