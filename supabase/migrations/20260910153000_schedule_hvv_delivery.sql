-- Supabase hosted extensions; credentials are configured separately in Vault.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create function public.wake_hvv_delivery_worker() returns void
language plpgsql security definer set search_path='' as $$
declare worker_secret text; project_url text;
begin
 if not exists(select 1 from public.hvv_delivery_jobs where
 (status in ('queued','retry') and available_at<=now()) or (status='processing' and lease_until<now())) then return; end if;
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='hvv_worker_secret';
 select decrypted_secret into project_url from vault.decrypted_secrets where name='hvv_worker_project_url';
 if worker_secret is null or project_url is null then return; end if;
 perform net.http_post(url:=project_url||'/functions/v1/process-hvv-deliveries',
 headers:=jsonb_build_object('Content-Type','application/json','x-worker-secret',worker_secret),
 body:='{}'::jsonb,timeout_milliseconds:=5000);
end;
$$;
revoke all on function public.wake_hvv_delivery_worker() from public,anon,authenticated;
select cron.schedule('courtboard-hvv-delivery','* * * * *','select public.wake_hvv_delivery_worker();');
