-- Grieta Central — schema inicial
-- Correr esto en el SQL Editor de Supabase (o vía `supabase db push`) una vez
-- que el proyecto esté creado. Pensado para Postgres 15+.

create extension if not exists "pgcrypto";

-- Un invocador trackeado por el grupo. Se agrega vía POST /api/summoners
-- (buscador de Riot ID) y a partir de ahí se refresca solo.
create table if not exists summoners (
  puuid          text primary key,
  game_name      text not null,
  tag_line       text not null,
  platform       text not null default 'la2', -- routing value: la2=LAS, la1=LAN, na1, ...
  role           text,                        -- top/jungle/mid/adc/support — lo elige el jugador, Riot no lo expone
  main_champ     text,                        -- idem, cosmético
  is_you         boolean not null default false,
  added_at       timestamptz not null default now(),
  last_refreshed_at timestamptz
);

-- Una foto del rango en un momento dado. Se inserta una fila nueva cada vez
-- que corre el refresh job (cron) — es lo que arma el gráfico de progresión
-- de LP ("últimos 20"). Nunca se actualiza una fila existente, solo se agregan.
create table if not exists lp_snapshots (
  id          uuid primary key default gen_random_uuid(),
  puuid       text not null references summoners(puuid) on delete cascade,
  queue_type  text not null default 'RANKED_SOLO_5x5',
  tier        text not null,   -- IRON..CHALLENGER
  division    text not null,   -- IV..I (o '' en apex tiers)
  lp          int not null,
  wins        int not null,
  losses      int not null,
  captured_at timestamptz not null default now()
);
create index if not exists lp_snapshots_puuid_captured_idx
  on lp_snapshots (puuid, captured_at desc);

-- Partidas ya procesadas. La clave es evitar pedirle la misma partida a Riot
-- dos veces — antes de llamar a Match-V5 por un matchId, fijarse si ya existe acá.
create table if not exists matches (
  match_id      text primary key,
  puuid         text not null references summoners(puuid) on delete cascade,
  champion      text not null,
  win           boolean not null,
  kills         int not null,
  deaths        int not null,
  assists       int not null,
  cs            int not null,
  cs_per_min    numeric(4,1) not null,
  vision_score  int not null,
  gold_earned   int not null,
  damage_to_champs int not null,
  dmg_share     numeric(4,1) not null default 0, -- % del daño del equipo hecho por este jugador
  kill_participation numeric(4,1) not null default 0, -- (kills+asistencias propias) / kills del equipo
  obj_share     numeric(4,1) not null default 0, -- % del daño a objetivos del equipo hecho por este jugador
  primary_rune  text,          -- keystone, ej. "Conqueror" (Data Dragon, ver lib/ddragon.ts)
  primary_style text,          -- árbol de runas primario, ej. "Precision"
  secondary_style text,        -- árbol de runas secundario, ej. "Domination"
  double_kills  int not null default 0,
  triple_kills  int not null default 0,
  quadra_kills  int not null default 0,
  penta_kills   int not null default 0,
  champ_level   int,
  damage_taken  int,
  damage_mitigated int,
  wards_placed  int,
  wards_killed  int,
  control_wards int,           -- visionWardsBoughtInGame
  turret_kills  int,
  dragon_kills  int,
  baron_kills   int,
  inhibitor_kills int,
  first_blood   boolean not null default false, -- kill o asistencia de first blood
  first_tower   boolean not null default false, -- kill o asistencia de la primera torre
  summoner1     text,          -- hechizo de invocador, ej. "Flash"
  summoner2     text,
  solo_kills    int,           -- de challenges (Riot) — puede faltar en partidas viejas
  skillshots_hit int,
  damage_per_min numeric(6,1),
  team_position text,          -- TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY
  game_duration_s int not null,
  played_at     timestamptz not null,
  inserted_at   timestamptz not null default now()
);
create index if not exists matches_puuid_played_idx
  on matches (puuid, played_at desc);

-- Sirve rápido para armar el ladder sin tener que hacer el join en cada request.
create or replace view ladder as
select
  s.puuid,
  s.game_name,
  s.tag_line,
  s.role,
  s.main_champ,
  s.is_you,
  ls.tier,
  ls.division,
  ls.lp,
  ls.wins,
  ls.losses,
  ls.captured_at as lp_captured_at
from summoners s
left join lateral (
  select * from lp_snapshots
  where lp_snapshots.puuid = s.puuid
    and lp_snapshots.queue_type = 'RANKED_SOLO_5x5'
  order by captured_at desc
  limit 1
) ls on true;

-- RLS: estas tablas se leen/escriben solo desde el backend (service role),
-- nunca directo desde el browser, así que se deja cerrado por defecto.
alter table summoners enable row level security;
alter table lp_snapshots enable row level security;
alter table matches enable row level security;
