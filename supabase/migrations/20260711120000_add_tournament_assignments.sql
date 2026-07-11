create unique index if not exists tournaments_name_unique_idx
on public.tournaments (lower(btrim(name)));

create table if not exists public.tournament_admins (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

insert into public.tournament_admins (tournament_id, user_id)
select tournament.id, admin_user.user_id
from public.tournaments tournament
cross join public.admin_users admin_user
on conflict do nothing;

create index if not exists tournament_admins_user_id_idx
on public.tournament_admins(user_id);

alter table public.tournament_admins enable row level security;

create or replace function public.can_access_tournament(tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
    or exists (
      select 1
      from public.tournament_admins assignment
      where assignment.tournament_id = can_access_tournament.tournament_id
        and assignment.user_id = auth.uid()
    );
$$;

drop policy if exists "admins can manage tournaments" on public.tournaments;
drop policy if exists "admins can manage games" on public.games;
drop policy if exists "admins can manage score entry links" on public.score_entry_links;

create policy "authorized admins can read tournaments"
on public.tournaments
for select
to authenticated
using (public.can_access_tournament(id));

create policy "authorized admins can update tournaments"
on public.tournaments
for update
to authenticated
using (public.can_access_tournament(id))
with check (public.can_access_tournament(id));

create policy "superadmins can insert tournaments"
on public.tournaments
for insert
to authenticated
with check (public.is_superadmin());

create policy "superadmins can delete tournaments"
on public.tournaments
for delete
to authenticated
using (public.is_superadmin());

create policy "authorized admins can manage games"
on public.games
for all
to authenticated
using (public.can_access_tournament(tournament_id))
with check (public.can_access_tournament(tournament_id));

create policy "authorized admins can manage score entry links"
on public.score_entry_links
for all
to authenticated
using (public.can_access_tournament(tournament_id))
with check (public.can_access_tournament(tournament_id));

create policy "superadmins can manage tournament assignments"
on public.tournament_admins
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

create policy "admins can read own tournament assignments"
on public.tournament_admins
for select
to authenticated
using (public.is_superadmin() or user_id = auth.uid());
