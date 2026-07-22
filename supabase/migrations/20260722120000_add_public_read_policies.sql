drop policy if exists "Public tournaments are readable" on public.tournaments;
drop policy if exists "Public games are readable" on public.games;

create policy "Public tournaments are readable"
on public.tournaments
for select
to anon
using (true);

create policy "Public games are readable"
on public.games
for select
to anon
using (true);
