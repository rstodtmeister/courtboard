alter table public.games
  add column if not exists completed boolean not null default false;
