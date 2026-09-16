do $$
begin
  if has_function_privilege('anon', 'public.touch_updated_at()', 'execute')
    or has_function_privilege('anon', 'public.capture_current_court_stream()', 'execute')
    or has_function_privilege('anon', 'public.rls_auto_enable()', 'execute')
    or has_function_privilege('anon', 'public.can_access_tournament(uuid)', 'execute')
    or has_function_privilege('anon', 'public.claim_admin_session()', 'execute')
    or has_function_privilege('anon', 'public.get_admin_session_status()', 'execute')
    or has_function_privilege('anon', 'public.is_admin()', 'execute')
    or has_function_privilege('anon', 'public.is_superadmin()', 'execute')
    or has_function_privilege('anon', 'public.mark_admin_password_setup_complete()', 'execute') then
    raise exception 'anon retains an internal function privilege';
  end if;

  if has_function_privilege('authenticated', 'public.touch_updated_at()', 'execute')
    or has_function_privilege('authenticated', 'public.capture_current_court_stream()', 'execute')
    or has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute') then
    raise exception 'authenticated retains a trigger-only function privilege';
  end if;

  if not has_function_privilege('authenticated', 'public.can_access_tournament(uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.claim_admin_session()', 'execute')
    or not has_function_privilege('authenticated', 'public.get_admin_session_status()', 'execute')
    or not has_function_privilege('authenticated', 'public.is_admin()', 'execute')
    or not has_function_privilege('authenticated', 'public.is_superadmin()', 'execute')
    or not has_function_privilege('authenticated', 'public.mark_admin_password_setup_complete()', 'execute') then
    raise exception 'authenticated lost a required admin function privilege';
  end if;
end;
$$;
