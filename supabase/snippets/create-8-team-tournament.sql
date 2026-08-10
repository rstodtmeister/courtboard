-- Creates an 8-team round-robin tournament with 28 games.
-- Run with:
--   supabase db query < supabase/snippets/create-8-team-tournament.sql
--
-- The script replaces all existing tournament data. Because games and score
-- entry links are tied to tournaments with ON DELETE CASCADE, old games,
-- results, locks, and scoring links are removed as well.

begin;

delete from public.tournaments;

with created_tournament as (
  insert into public.tournaments (
    name,
    hvv_edit_url,
    hvv_public_url,
    token_base_url,
    courts
  )
  values (
    '8er Beachturnier',
    '',
    '',
    '',
    array['1', '2', '3', '4']::text[]
  )
  returning id
),
teams(seed, name) as (
  values
    (1, 'Marsa - Klara'),
    (2, 'Mecki - Antje'),
    (3, 'Robert - Klara'),
    (4, 'Kosta - Marie'),
    (5, 'Paula - Una'),
    (6, 'Richard - Anton'),
    (7, 'Anna - Heike'),
    (8, 'Lotti - Karotti')
),
schedule(round_number, court, team_a_seed, team_b_seed) as (
  values
    (1, '1', 1, 8),
    (1, '2', 2, 7),
    (1, '3', 3, 6),
    (1, '4', 4, 5),
    (2, '1', 1, 7),
    (2, '2', 8, 6),
    (2, '3', 2, 5),
    (2, '4', 3, 4),
    (3, '1', 1, 6),
    (3, '2', 7, 5),
    (3, '3', 8, 4),
    (3, '4', 2, 3),
    (4, '1', 1, 5),
    (4, '2', 6, 4),
    (4, '3', 7, 3),
    (4, '4', 8, 2),
    (5, '1', 1, 4),
    (5, '2', 5, 3),
    (5, '3', 6, 2),
    (5, '4', 7, 8),
    (6, '1', 1, 3),
    (6, '2', 4, 2),
    (6, '3', 5, 8),
    (6, '4', 6, 7),
    (7, '1', 1, 2),
    (7, '2', 3, 8),
    (7, '3', 4, 7),
    (7, '4', 5, 6)
)
insert into public.games (
  tournament_id,
  number,
  game_date,
  court,
  team_a,
  team_b,
  referee,
  result,
  winner_team,
  edit_url,
  edit_method,
  edit_data,
  game_rating,
  set1_team_a,
  set1_team_b,
  set2_team_a,
  set2_team_b,
  set3_team_a,
  set3_team_b,
  printed,
  dirty,
  completed
)
select
  created_tournament.id,
  row_number() over (order by schedule.round_number, schedule.court)::text as number,
  'Runde ' || schedule.round_number as game_date,
  schedule.court,
  team_a.name,
  team_b.name,
  '',
  '',
  '',
  '',
  'GET',
  '',
  'Normal',
  '',
  '',
  '',
  '',
  '',
  '',
  false,
  false,
  false
from schedule
cross join created_tournament
join teams team_a on team_a.seed = schedule.team_a_seed
join teams team_b on team_b.seed = schedule.team_b_seed
order by schedule.round_number, schedule.court;

commit;
