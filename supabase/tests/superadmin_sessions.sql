-- Run against a migrated local database with psql -v ON_ERROR_STOP=1 -f ...
-- All fixture changes are rolled back; assertions run with the API role.
begin;

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002');
insert into public.admin_users (user_id, role, password_setup_required) values
  ('a1000000-0000-0000-0000-000000000001', 'superadmin', false),
  ('a1000000-0000-0000-0000-000000000002', 'admin', false);
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '2026-09-10 10:00:00+00', now());
insert into public.tournaments (id, name, hvv_edit_url) values
  ('c1000000-0000-0000-0000-000000000001', 'Single-session regression fixture', 'https://example.invalid');
insert into public.tournament_admins (tournament_id, user_id) values
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');
insert into public.games (id, tournament_id, number) values
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","session_id":"b1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  assert public.claim_admin_session() = 'superadmin', 'First login must claim the session';
  assert public.claim_admin_session() = 'superadmin', 'Refresh/reload must preserve the current session';
  assert public.is_superadmin(), 'Current session must retain superadmin rights';
  update public.games set referee = 'Device A' where id = 'd1000000-0000-0000-0000-000000000001';
  assert found, 'Current session must be able to save';
end $$;

reset role;
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', '2026-09-10 10:01:00+00', now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","session_id":"b1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ begin
  assert public.claim_admin_session() = 'superadmin', 'New login must take over';
  update public.games set referee = 'Device B' where id = 'd1000000-0000-0000-0000-000000000001';
  assert found, 'New device must be able to save';
end $$;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","session_id":"b1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  assert public.get_admin_session_status() = 'replaced', 'Old device must detect takeover';
  assert public.claim_admin_session() = 'replaced', 'Old device must not reclaim by refreshing';
  assert not public.is_admin() and not public.is_superadmin(), 'Old JWT must lose admin rights';
  assert not public.can_access_tournament('c1000000-0000-0000-0000-000000000001'), 'Assignments must not bypass the restriction';
  assert not exists (select 1 from public.admin_users), 'Edge Function role lookup must reject old JWT';
  assert not exists (select 1 from public.tournament_admins), 'Old JWT must not read assignments';
  update public.games set referee = 'Stale write' where id = 'd1000000-0000-0000-0000-000000000001';
  assert not found, 'Old device must not save with its still-valid JWT';
  begin
    update public.superadmin_sessions set session_id = 'b1000000-0000-0000-0000-000000000001';
    raise exception 'Browser must not write the session registry directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Signing out B removes its Auth row, but must never resurrect A.
reset role;
delete from auth.sessions where id = 'b1000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$ begin
  assert public.claim_admin_session() = 'replaced', 'Old session must remain blocked after newest session signs out';
end $$;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","session_id":"b1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ begin
  assert public.get_admin_session_status() = 'replaced', 'Deleted Auth session must not authorize a remaining access token';
end $$;

-- Ordinary admins retain access from multiple sessions.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002","session_id":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  assert public.claim_admin_session() = 'admin', 'Ordinary admin must not need a single-session claim';
  assert public.can_access_tournament('c1000000-0000-0000-0000-000000000001'), 'Assigned admin must retain access';
end $$;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002","session_id":"b2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ begin
  assert public.claim_admin_session() = 'admin', 'Second ordinary-admin session must still work';
end $$;

select set_config('request.jwt.claims', '{}', true);
do $$ begin
  assert public.claim_admin_session() = 'unauthorized', 'Missing identity must fail closed';
  assert not public.is_admin(), 'Missing identity must not authorize admin access';
end $$;

reset role;
rollback;
