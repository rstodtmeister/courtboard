create extension if not exists pgcrypto;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hvv_edit_url text not null,
  hvv_public_url text,
  token_base_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  number text not null,
  game_date text,
  court text,
  team_a text,
  team_b text,
  referee text,
  result text,
  winner_team text,
  edit_url text,
  edit_method text not null default 'GET',
  edit_data text,
  game_rating text,
  set1_team_a text,
  set1_team_b text,
  set2_team_a text,
  set2_team_b text,
  set3_team_a text,
  set3_team_b text,
  printed boolean not null default false,
  dirty boolean not null default false,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, number)
);

create table public.score_entry_links (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  game_id uuid references public.games(id) on delete cascade,
  court text,
  token_hash text not null unique,
  expires_at timestamptz,
  used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint score_entry_links_target_check check (game_id is not null or court is not null)
);

create index games_tournament_id_idx on public.games(tournament_id);
create index games_tournament_number_idx on public.games(tournament_id, number);
create index score_entry_links_token_hash_idx on public.score_entry_links(token_hash);
create index score_entry_links_game_id_idx on public.score_entry_links(game_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tournaments_touch_updated_at
before update on public.tournaments
for each row execute function public.touch_updated_at();

create trigger games_touch_updated_at
before update on public.games
for each row execute function public.touch_updated_at();

alter table public.admin_users enable row level security;
alter table public.tournaments enable row level security;
alter table public.games enable row level security;
alter table public.score_entry_links enable row level security;

create policy "admins can read admin users"
on public.admin_users
for select
to authenticated
using (public.is_admin());

create policy "admins can manage tournaments"
on public.tournaments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can manage games"
on public.games
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can manage score entry links"
on public.score_entry_links
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
