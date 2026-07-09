alter table public.admin_users
add column if not exists password_setup_required boolean not null default true;

update public.admin_users
set password_setup_required = false
where password_setup_required is true
  and user_id in (
    select id
    from auth.users
    where last_sign_in_at is not null
  );

create or replace function public.mark_admin_password_setup_complete()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.admin_users
  set password_setup_required = false
  where user_id = auth.uid();
end;
$$;

grant execute on function public.mark_admin_password_setup_complete() to authenticated;

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
      and password_setup_required is false
  );
$$;

create or replace function public.is_superadmin()
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
      and role = 'superadmin'
      and password_setup_required is false
  );
$$;
