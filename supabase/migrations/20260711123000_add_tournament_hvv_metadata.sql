alter table public.tournaments
add column if not exists hvv_turnier_id text,
add column if not exists hvv_veranstaltung_id text,
add column if not exists hvv_type text,
add column if not exists hvv_gender text,
add column if not exists tournament_date text,
add column if not exists location text;

create index if not exists tournaments_hvv_turnier_id_idx
on public.tournaments(hvv_turnier_id);

create index if not exists tournaments_hvv_veranstaltung_id_idx
on public.tournaments(hvv_veranstaltung_id);
