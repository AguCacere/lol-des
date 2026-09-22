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
  queue_id      int not null default 420, -- Match-V5 queueId: 420=ranked solo/duo, 700=Clash (ver lib/clash.ts). Flex (440) NO se guarda: la cargada de Discord se la pregunta a Riot en vivo y la descarta (ver RANKED_FLEX_QUEUE_ID en lib/refresh.ts).
  game_duration_s int not null,
  ally_afk      boolean not null default false, -- se le fue un compañero: alguien de SU equipo (no él) jugó menos de la partida (ver aliadoAfk en lib/refresh.ts). Se decide al escribir la fila, con el payload de los diez jugadores que al leer ya no está. La liga descarta las DERROTAS con esto en true —Riot no te saca LP por una partida que se te fue— pero las victorias cuentan igual. Default false: las filas viejas cuentan como antes hasta que pase /api/repair.
  aliados       text[] not null default '{}', -- los 4 puuids del equipo propio, sin él. Riot NO manda quién fue en duo (Match-V5 no tiene party ni premade), así que el duo se deduce de acá: un compañero random aparece una vez, un duo aparece en quince partidas del mismo lado. Sale del payload que ya se baja en buildMatchRow: cero llamadas extra. Default '{}': las filas viejas quedan vacías hasta que pase /api/repair.
  played_at     timestamptz not null,
  inserted_at   timestamptz not null default now(),
  repaired_at   timestamptz,  -- marcador de POST /api/repair (ver repairMatches en lib/refresh.ts): null = a esta fila todavía le faltan columnas que se agregaron después de guardarla. Es el cursor de la reparación, por eso se puede llamar por tandas sin pasar nada.
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

-- El último análisis del pool generado por Claude para cada jugador (ver
-- lib/coach.ts y POST /api/coach). Se cachea acá y no se regenera en cada
-- carga del perfil por dos razones: cuesta plata por llamada, y el análisis
-- solo cambia de verdad cuando cambian los datos de abajo — no cada vez que
-- alguien abre la pestaña. `matches_at_generation` es lo que permite saber si
-- vale la pena regenerarlo: si el jugador sumó pocas partidas desde la última
-- vez, el informe sigue siendo el mismo.
create table if not exists coach_reports (
  puuid                text primary key references summoners(puuid) on delete cascade,
  payload              jsonb not null,   -- CoachReport ya validado contra el schema de lib/coach.ts
  matches_at_generation int not null,
  -- Hash del dossier EXACTO que se le mandó al modelo (ver renderDossier).
  -- Si el hash de hoy es idéntico, la entrada del modelo sería byte por byte
  -- la misma y la salida no aportaría nada nuevo: se devuelve lo cacheado sin
  -- llamar, incluso cuando el usuario aprieta "Regenerar". Es lo único que
  -- hace que regenerar sin haber jugado no cueste plata.
  dossier_hash         text,
  generated_at         timestamptz not null default now()
);

-- Curación y escudo SOBRE COMPAÑEROS. Son las dos únicas cifras que miden lo
-- que un support realmente hizo por el equipo, y hasta ahora el detalle de
-- partida no tenía ninguna: un enchanter terminaba con 5% de daño y nada que
-- mostrara su aporte.
--
-- Van estas y no `totalHeal`: esa incluye el robo de vida y la regeneración
-- propia, así que un bruiser top figura curando más que una Soraka.
alter table matches add column if not exists heal_teammates int;
alter table matches add column if not exists shield_teammates int;

-- ── Liga semanal (lib/liga.ts) ───────────────────────────────────────────
-- Una competencia interna por LP neto, de lunes 00:00 a domingo 23:59 hora
-- argentina. Aparte del ladder: el ladder mide dónde llegaste, esto mide
-- cuánto te moviste esta semana.
--
-- Se anota el que quiere, no compite todo el que está trackeado. La marca se
-- toca solo con la contraseña del grupo (ver lib/auth.ts).
alter table summoners add column if not exists participa_liga boolean not null default false;
-- Desde cuándo compite. Sin esto, anotar a alguien un miércoles le regala el
-- LP que hizo el lunes y el martes: podría mirar cómo viene la semana y
-- anotarse solo si le está yendo bien. Se pone al tildarlo y se borra al
-- destildarlo, así que volver a entrar arranca de cero.
alter table summoners add column if not exists liga_desde timestamptz;

-- Las semanas ya cerradas. Cumple dos funciones: el historial de campeones y
-- —más importante— el candado de idempotencia. El cron corre todos los días,
-- así que sin esto anunciaría al mismo ganador una y otra vez; con la semana
-- ya registrada, la segunda corrida no hace nada.
create table if not exists liga_semanas (
  semana        date primary key,       -- el LUNES de esa semana, en hora argentina
  ganador_puuid text references summoners(puuid) on delete set null,
  ganador_label text,                   -- el nombre tal como se anunció: sobrevive a que se borre el invocador
  lp_neto       int,                    -- el LP neto del ganador. Ya no decide nada (ver MODO_LIGA): queda de contexto
  -- El puntaje con el que ganó, que es lo que DECIDE la liga (MODO_LIGA =
  -- "puntos"). Se agregó después: hasta que existió, la vitrina de campeones
  -- mostraba el lp_neto —un "+144" al lado de un tipo que había ganado con
  -- +10,25— y contradecía a la tabla de la que salió. Numeric y no int porque
  -- los puntos tienen decimales (la derrota vale −0,75).
  puntos        numeric,
  jugadores     int not null default 0, -- cuántos participantes jugaron al menos una
  -- La foto final de esa semana, entera: la tabla con puntaje, V-D, mínimos y
  -- el acumulado por día de cada uno. Se escribe al cerrar.
  --
  -- Existe porque una semana cerrada NO se puede reconstruir después. Se
  -- reconstruía leyendo quién tiene participa_liga = true, que es un estado del
  -- PRESENTE: el día que se destildó a todos para rearmar el formato, la semana
  -- que ya había cerrado se quedó sin participantes y la pantalla dijo que no
  -- había jugado nadie. Y volver a anotarlos tampoco la arregla, porque
  -- liga_desde se sella con la fecha de hoy y filtra todas las partidas viejas.
  -- Un resultado ya anunciado es un HECHO: se guarda, no se recalcula.
  resumen       jsonb,
  cerrada_at    timestamptz not null default now()
);

-- Los ajustes a mano del puntaje de la liga: lo único que puede mover un
-- puntaje sin que sea una partida.
--
-- Nace de una penalización acordada por el grupo (alguien cambió de cuenta a
-- mitad de semana y se votó restarle 2). La tentación era resolverlo metiendo
-- derrotas falsas en `matches`, y hay que no hacerlo nunca: esa tabla alimenta
-- también el ladder, el KDA, los récords, los títulos y las cargadas del bot,
-- así que un ajuste de una semana le ensuciaría el historial para siempre.
--
-- Va POR SEMANA y no como columna de `summoners` porque una penalización es de
-- una semana puntual; la semana siguiente arranca limpia sola, sin que haya que
-- acordarse de borrar nada.
--
-- `motivo` es not null a propósito: un −2 que aparece sin explicación es
-- exactamente lo que hace que alguien desconfíe del cálculo, y el motivo se
-- muestra en pantalla al lado del nombre.
create table if not exists liga_ajustes (
  semana     date not null,            -- el LUNES de esa semana, igual que liga_semanas
  puuid      text not null references summoners(puuid) on delete cascade,
  puntos     numeric(5,2) not null,    -- negativo castiga, positivo premia. Decimal como el resto del puntaje
  motivo     text not null,
  creado_at  timestamptz not null default now(),
  primary key (semana, puuid)
);

-- Las cuentas con las que hacer duo NO puntúa en la liga.
--
-- Riot no dice quién fue en duo: Match-V5 no trae party ni premade, así que lo
-- único deducible es con quién estuviste en el mismo equipo (matches.aliados).
-- Por eso la lista es manual: se carga el puuid una vez y toda partida donde
-- aparezca deja de contar sola, esa y las que vengan.
--
-- Es una tabla y no un liga_ajustes a mano porque el ajuste a mano nace
-- vencido: se calculó uno de −4 por cuatro partidas y antes de correrlo ya
-- eran cinco. El puuid no se queda viejo; el número sí.
--
-- Anula la partida ENTERA, no solo la victoria: si con esa cuenta perdió,
-- tampoco le resta. Más fuerte que ally_afk, que descarta solo las derrotas.
create table if not exists liga_vetados (
  puuid      text primary key,
  nota       text,
  creado_at  timestamptz not null default now()
);

-- ── Los torneos de la liga (lib/torneo.ts) ───────────────────────────────
-- Cuándo arranca y cuándo cierra cada torneo, con sus mínimos.
--
-- Existe porque hasta acá la liga no TENÍA fechas: las deducía. inicioDeSemana
-- calculaba el lunes y finDeSemana le sumaba siete días. Eso alcanzaba mientras
-- un torneo fuera siempre una semana de lunes a domingo, y dejó de alcanzar el
-- día que hubo que agregarle un lunes porque había gente que no podía el domingo.
--
-- SIN ESTA TABLA TODO SIGUE ANDANDO IGUAL: si no hay fila para el momento que se
-- pregunta, torneoDerivado arma el lunes a domingo de siempre con los mínimos de
-- siempre. Por eso se puede desplegar el código antes de correr esto.
create table if not exists liga_torneos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text,                         -- "Semana del 14", "Torneo de octubre". Solo para la pantalla
  arranca_at    timestamptz not null,
  -- EXCLUSIVO, y a las 23:55 del ÚLTIMO DÍA — no a las 00:00 del siguiente.
  -- Es una regla del grupo: después de las 23:55 no entran más partidas. El
  -- cierre corre en el tick del cron de las 00:00, que refresca ANTES de
  -- cerrar, así que con el corte cinco minutos antes lo que cuenta ya está
  -- guardado cuando se cuenta. No mueve ningún día del calendario: ver
  -- CORTE_ANTES_DE_MEDIANOCHE_MS en lib/torneo.ts.
  cierra_at     timestamptz not null,
  minimo_total  int not null default 10,      -- partidas en TODO el torneo para cobrar
  minimo_ultimo int not null default 3,       -- partidas en el "último día"
  -- Desde cuándo cuenta el "último día". Se guarda y NO se deduce del cierre a
  -- propósito: al extender un torneo en curso, mover el último día
  -- automáticamente le cambia la regla a alguien que ya organizó su semana para
  -- cumplirla el domingo. Null = las últimas 24 horas, que es lo de siempre.
  ultimo_desde  timestamptz,
  premio        text,
  creado_at     timestamptz not null default now(),
  constraint liga_torneos_ventana_valida check (cierra_at > arranca_at)
);
-- Para torneoDe, que busca el que contiene un instante.
create index if not exists liga_torneos_ventana_idx on liga_torneos (arranca_at, cierra_at);
alter table liga_torneos enable row level security;

-- ── El bot de Discord (lib/discord-comandos.ts) ──────────────────────────
-- Ata un usuario de Discord a su invocador. Es lo que deja que `/ultima` sin
-- argumentos conteste "la tuya" en vez de pedir el nombre.
--
-- Nullable a propósito: el bot anda igual con la columna vacía —se nombra al
-- jugador y listo— así que vincularse es una comodidad, no un requisito. Eso
-- es lo que permite que el bot sirva desde el día uno sin tener que juntar
-- antes los catorce ids de Discord.
--
-- El UNIQUE no es decoración: sin él, dos invocadores con el mismo discord_id
-- hacen que "la tuya" devuelva cualquiera de los dos según el orden que le
-- pinte a Postgres — un bug que aparece una vez cada tanto y no se reproduce.
-- Es un índice parcial porque el UNIQUE común dejaría pasar todos los null
-- igual, pero así queda explícito que los no-vinculados no compiten entre sí.
--
-- Cuando el bot escriba algo (los "te cojo" del próximo torneo), esta columna
-- pasa a ser además la lista de permitidos: una firma de Discord válida prueba
-- que el pedido vino de Discord, no que lo tipeó alguien de la casa.
alter table summoners add column if not exists discord_id text;
create unique index if not exists summoners_discord_id_idx
  on summoners (discord_id) where discord_id is not null;

-- RLS: estas tablas se leen/escriben solo desde el backend (service role),
-- nunca directo desde el browser, así que se deja cerrado por defecto.
alter table liga_ajustes enable row level security;
alter table liga_semanas enable row level security;
alter table summoners enable row level security;
alter table lp_snapshots enable row level security;
alter table matches enable row level security;
alter table champion_mastery enable row level security;
alter table coach_reports enable row level security;

-- ── Los objetivos de "Mejora" (lib/mejora.ts) ────────────────────────────
-- Un objetivo es una métrica, un comparador, un umbral y una ventana:
-- "diferencia de oro @10 de −250 o más, sobre las próximas 5 partidas".
--
-- SIN ESTA TABLA LA PESTAÑA SIGUE ANDANDO: el diagnóstico por partida, los
-- patrones, el progreso y los matchups son todos cálculo sobre `matches` y no
-- necesitan nada de acá. Lo único que falta hasta que se corra esto es poder
-- GUARDAR un objetivo — la ruta detecta que la tabla no existe y devuelve
-- `objetivo: null` con un aviso, en vez de tirar 500. Por eso se puede
-- desplegar el código antes de correr esta migración.
--
-- Un objetivo pertenece a un PUUID, no a una persona logueada: la app tiene
-- una sola contraseña compartida y no hay usuarios. Es el mismo modelo que
-- `participa_liga` — cualquiera que entró puede anotarle un objetivo a
-- cualquiera, igual que puede anotarlo a la liga.
create table if not exists objetivos (
  id          uuid primary key default gen_random_uuid(),
  puuid       text not null references summoners(puuid) on delete cascade,
  -- Una ClaveMetrica de lib/mejora.ts. Texto y no un enum de Postgres: el
  -- catálogo de métricas se toca desde el código y un enum obligaría a una
  -- migración por cada métrica nueva. La ruta valida contra METRICAS.
  metrica     text not null,
  comparador  text not null check (comparador in ('gte', 'lte')),
  umbral      numeric not null,
  -- Sobre cuántas partidas posteriores se evalúa.
  ventana     int not null default 5 check (ventana between 3 and 20),
  creado_at   timestamptz not null default now(),
  -- Null mientras está activo. Se cierra en vez de borrarse para que quede
  -- el historial de objetivos que pide la pantalla.
  cerrado_at  timestamptz
);

-- "Uno principal activo a la vez", que es la regla del plan. Un índice único
-- parcial lo hace cumplir en la BASE y no solo en la ruta: si dos pestañas
-- guardan un objetivo a la vez, una de las dos falla en vez de dejar dos
-- activos que después nadie sabe cuál manda.
create unique index if not exists objetivos_uno_activo
  on objetivos (puuid) where cerrado_at is null;

create index if not exists objetivos_puuid_creado on objetivos (puuid, creado_at desc);
