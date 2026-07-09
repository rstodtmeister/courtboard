alter table public.admin_users
add column if not exists role text not null default 'admin',
add column if not exists invited_by uuid references auth.users(id) on delete set null,
add column if not exists updated_at timestamptz not null default now(),
add constraint admin_users_role_check check (role in ('superadmin', 'admin'));

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
  );
$$;

drop policy if exists "admins can read admin users" on public.admin_users;

create policy "admins can read admin users"
on public.admin_users
for select
to authenticated
using (public.is_admin());

create policy "superadmins can insert admin users"
on public.admin_users
for insert
to authenticated
with check (public.is_superadmin());

create policy "superadmins can update admin users"
on public.admin_users
for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

create trigger admin_users_touch_updated_at
before update on public.admin_users
for each row execute function public.touch_updated_at();
