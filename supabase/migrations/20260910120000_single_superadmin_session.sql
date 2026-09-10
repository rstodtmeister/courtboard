-- Keep a high-water mark even after Supabase removes a signed-out session.
-- An older session must never become active again by reloading the browser.
create table public.superadmin_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  session_created_at timestamptz not null
);

alter table public.superadmin_sessions enable row level security;
revoke all on public.superadmin_sessions from anon, authenticated;

insert into public.superadmin_sessions (user_id, session_id, session_created_at)
select distinct on (s.user_id) s.user_id, s.id, s.created_at
from auth.sessions s
join public.admin_users a on a.user_id = s.user_id
where a.role = 'superadmin'
order by s.user_id, s.created_at desc, s.id desc;

create function public.get_admin_session_status()
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when a.password_setup_required then 'unauthorized'
      when a.role <> 'superadmin' then 'admin'
      when exists (
        select 1 from public.superadmin_sessions active
        join auth.sessions s on s.id = active.session_id and s.user_id = active.user_id
        where active.user_id = a.user_id
          and active.session_id::text = auth.jwt()->>'session_id'
      ) then 'superadmin'
      else 'replaced'
    end
    from public.admin_users a where a.user_id = auth.uid()
  ), 'unauthorized');
$$;

-- Only a genuinely newer Auth session may take over. The browser supplies
-- neither the user ID, session ID nor timestamp; they come from verified Auth.
create function public.claim_admin_session()
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  admin_role text;
  setup_required boolean;
  candidate_id uuid;
  candidate_created_at timestamptz;
begin
  select a.role, a.password_setup_required into admin_role, setup_required
  from public.admin_users a where a.user_id = auth.uid() for update;
  if not found or setup_required then
    return 'unauthorized';
  end if;
  if admin_role <> 'superadmin' then
    return 'admin';
  end if;

  select s.id, s.created_at into candidate_id, candidate_created_at
  from auth.sessions s
  where s.user_id = auth.uid()
  order by s.created_at desc, s.id desc limit 1;
  if candidate_id is null or candidate_id::text is distinct from auth.jwt()->>'session_id' then
    return 'replaced';
  end if;

  insert into public.superadmin_sessions as active (user_id, session_id, session_created_at)
  values (auth.uid(), candidate_id, candidate_created_at)
  on conflict (user_id) do update
  set session_id = excluded.session_id, session_created_at = excluded.session_created_at
  where (excluded.session_created_at, excluded.session_id) > (active.session_created_at, active.session_id);

  return public.get_admin_session_status();
end;
$$;

revoke all on function public.get_admin_session_status() from public;
revoke all on function public.claim_admin_session() from public;
grant execute on function public.get_admin_session_status() to authenticated;
grant execute on function public.claim_admin_session() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.get_admin_session_status() in ('admin', 'superadmin');
$$;

create or replace function public.is_superadmin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.get_admin_session_status() = 'superadmin';
$$;

create or replace function public.can_access_tournament(tournament_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() and (
    public.is_superadmin() or exists (
      select 1 from public.tournament_admins assignment
      where assignment.tournament_id = can_access_tournament.tournament_id
        and assignment.user_id = auth.uid()
    )
  );
$$;

-- Old tournament assignments must not bypass the session check.
drop policy "admins can read own tournament assignments" on public.tournament_admins;
create policy "admins can read own tournament assignments"
on public.tournament_admins for select to authenticated
using (public.is_admin() and (public.is_superadmin() or user_id = auth.uid()));
