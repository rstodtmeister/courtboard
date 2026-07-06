alter table public.games
  add column if not exists point_history text,
  add column if not exists score_locked_by_device text,
  add column if not exists score_locked_at timestamptz;

create index if not exists games_score_lock_idx
  on public.games(score_locked_by_device)
  where score_locked_by_device is not null;
