-- Supabase's historic defaults granted new public functions to API roles.
-- Require every future RPC to opt in explicitly instead.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

alter function public.touch_updated_at() set search_path = '';

revoke execute on function public.touch_updated_at() from public, anon, authenticated, service_role;
revoke execute on function public.capture_current_court_stream() from public, anon, authenticated, service_role;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;

revoke execute on function public.can_access_tournament(uuid) from public, anon;
revoke execute on function public.claim_admin_session() from public, anon;
revoke execute on function public.get_admin_session_status() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_superadmin() from public, anon;
revoke execute on function public.mark_admin_password_setup_complete() from public, anon;

grant execute on function public.can_access_tournament(uuid) to authenticated, service_role;
grant execute on function public.claim_admin_session() to authenticated, service_role;
grant execute on function public.get_admin_session_status() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_superadmin() to authenticated, service_role;
grant execute on function public.mark_admin_password_setup_complete() to authenticated, service_role;

