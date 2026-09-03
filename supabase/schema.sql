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
  profile_icon_id int,                        -- Summoner-V4 — para el avatar real del perfil (Data Dragon, ver lib/ddragon.ts)
  summoner_level int,                         -- Summoner-V4 — mismo call que profile_icon_id, sin costo extra de la API
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
-- dos veces — antes de llamar a Match-V5 por un matchId, fijarse si ya existe acá
-- PARA ESE puuid puntual (ver lib/refresh.ts). match_id solo no alcanza como
-- primary key: una partida trae hasta 10 jugadores, y si dos amigos
-- trackeados están en la misma partida, cada uno necesita su propia fila
-- (kills/deaths/cs/etc. son por jugador). Con match_id como PK única, el
-- segundo jugador de esa partida compartida chocaba contra la fila que ya
-- había insertado el primero — el insert tiraba duplicate key, refreshOne
-- abortaba ahí mismo, y todo lo que venía después en esa misma corrida
-- (maestría, ícono de perfil) nunca llegaba a correr para ese jugador.
create table if not exists matches (
  match_id      text not null,
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
  turret_takedowns int not null default 0, -- de challenges (Riot) — kill O asistencia, no solo el golpe final
  dragon_takedowns int not null default 0,
  baron_takedowns int not null default 0,
  herald_takedowns int not null default 0,
  inhibitor_kills int,          -- Riot no expone un equivalente de "takedown" para esto, solo el golpe final propio
  first_blood   boolean not null default false, -- kill o asistencia de first blood
  first_tower   boolean not null default false, -- kill o asistencia de la primera torre
  summoner1     text,          -- hechizo de invocador, ej. "Flash"
  summoner2     text,
  solo_kills    int,           -- de challenges (Riot) — puede faltar en partidas viejas
  skillshots_hit int,
  damage_per_min numeric(6,1),
  gold_diff_10  int,           -- oro propio menos el del rival del mismo carril, a los 10/15/20 min
  gold_diff_15  int,           -- (Match-V5 timeline) — null si la partida terminó antes de ese minuto
  gold_diff_20  int,           -- o si no se pudo identificar al rival del mismo carril
  first_blood_time_s int,      -- segundo del juego en que ocurrió la primera sangre (dato de la partida, no del jugador)
  first_tower_time_s int,      -- ídem para la primera torre caída
  first_tower_mine boolean,    -- true si la tiró el equipo de este jugador, false si fue el rival, null si no hay dato (remake) o partida vieja
  first_dragon_time_s int,
  first_dragon_mine boolean,
  first_baron_time_s int,
  first_baron_mine boolean,
  dragon_types  text[] not null default '{}', -- monsterSubType (Match-V5 timeline) por cada dragón que MATÓ este jugador (no asistió), ej. {FIRE_DRAGON,WATER_DRAGON} — puede ser más corto que dragon_takedowns, que también cuenta asistencias
  item_build    int[] not null default '{}', -- itemId de cada ITEM_PURCHASED (Match-V5 timeline) de este jugador, EN ORDEN de compra real — no reconciliado contra ventas/undo, incluye consumibles/trinket. Vacío en partidas guardadas antes de que este campo existiera.
  team_position text,          -- TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY
  opponent_champion text,      -- campeón del rival del MISMO carril (mismo teamPosition, otro equipo). Sale del payload de Match-V5 que ya bajamos, sin llamada extra — es la base de los matchups ("con Caitlyn contra Jhin: 11V 8D"). Null si Riot no resolvió posición o nadie coincidió.
  queue_id      int not null default 420, -- Match-V5 queueId: 420=ranked solo/duo, 700=Clash (ver lib/clash.ts)
  game_duration_s int not null,
  played_at     timestamptz not null,
  inserted_at   timestamptz not null default now(),
  primary key (match_id, puuid)
);
create index if not exists matches_puuid_played_idx
  on matches (puuid, played_at desc);

-- Top campeones por maestría (Champion Mastery V4) — refleja el career-wide
-- de Riot, no nuestro historial de partidas guardadas. Cada refresh borra e
-- inserta de nuevo el top 5 completo (no se acumula historial, solo importa
-- el estado actual), así que nunca queda un campeón viejo que ya salió del
-- top 5.
create table if not exists champion_mastery (
  puuid       text not null references summoners(puuid) on delete cascade,
  champion_id int not null,
  champion    text not null,
  level       int not null,
  points      int not null,
  updated_at  timestamptz not null default now(),
  primary key (puuid, champion_id)
);

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
  ls.captured_at as lp_captured_at,
  -- al final a propósito: `create or replace view` en Postgres solo permite
  -- agregar columnas al final del select, insertarla en el medio cuenta
  -- como "renombrar" la columna que quedaba en esa posición y tira 42P16.
  s.profile_icon_id,
  s.last_refreshed_at,
  s.summoner_level
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
alter table champion_mastery enable row level security;
