insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('team-photos','team-photos',true,5242880,array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.team_photos(
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  seed_number integer not null check(seed_number>0),
  team_name text not null check(length(team_name) between 1 and 200),
  storage_path text not null,
  updated_at timestamptz not null default now(),
  primary key(tournament_id,seed_number)
);
alter table public.team_photos enable row level security;
create policy "team photos are public" on public.team_photos for select to anon using(true);
create policy "admins manage team photos" on public.team_photos for all to authenticated
 using(public.can_access_tournament(tournament_id)) with check(public.can_access_tournament(tournament_id));
revoke all on public.team_photos from public,anon,authenticated;
grant select on public.team_photos to anon,authenticated;
grant insert,update,delete on public.team_photos to authenticated;

create policy "team photo files are public" on storage.objects for select to anon using(bucket_id='team-photos');
create policy "admins upload team photos" on storage.objects for insert to authenticated with check(
 bucket_id='team-photos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and public.can_access_tournament(((storage.foldername(name))[1])::uuid));
create policy "admins update team photos" on storage.objects for update to authenticated using(
 bucket_id='team-photos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and public.can_access_tournament(((storage.foldername(name))[1])::uuid)) with check(
 bucket_id='team-photos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and public.can_access_tournament(((storage.foldername(name))[1])::uuid));
create policy "admins delete team photos" on storage.objects for delete to authenticated using(
 bucket_id='team-photos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and public.can_access_tournament(((storage.foldername(name))[1])::uuid));
