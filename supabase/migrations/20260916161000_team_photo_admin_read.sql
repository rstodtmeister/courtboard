create policy "admins read managed team photo files"
on storage.objects for select to authenticated using(
  bucket_id='team-photos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.can_access_tournament(((storage.foldername(name))[1])::uuid)
);
