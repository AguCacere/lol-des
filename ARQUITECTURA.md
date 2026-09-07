# Arquitectura

El mapa del proyecto. Está para **decidir qué NO abrir**: si la pregunta se contesta
acá, no hace falta leer `lib/refresh.ts` (1082 líneas) ni `app/api/ladder/route.ts`
(1074). Esos dos son el 80% del gasto de tokens de una sesión y casi siempre son
evitables.

## Forma general

Una sola página cliente (`app/page.tsx`) con cinco pestañas, y 16 route handlers.
**No hay Server Components de datos**: todo entra por `fetch` a `/api/*` desde el
navegador. El servidor solo existe en las rutas.

`app/page.tsx` carga `/api/ladder` una vez y de ahí sale casi toda la app: los
`Player` vienen completos (rango, pool, radar, historial, líneas, récords), así que
las pestañas Ranking, Estadísticas y Cara a cara **no piden nada más al servidor**.
Clash y Equipo cargan su ruta la primera vez que se las abre, no antes.

## Rutas

Todas viven en `app/api/*/route.ts`. "Sesión" = pasa por `exigirSesion` de
`lib/auth.ts`; sin `APP_PASSWORD` en el entorno responden 503 (falla cerrado: si la
cerradura no está puesta, nadie escribe).

| Ruta | Método | Qué hace | Escribe | Sesión | Cache-Control |
|---|---|---|---|---|---|
| `/api/ladder` | GET | El plato fuerte: arma los `Player` completos | no | no | `s-maxage=60` |
| `/api/live` | GET | Solo quién está en partida ahora (poll de 60s) | no | no | — |
| `/api/live-detail` | GET | Los diez de una partida en vivo, con líneas estimadas | no | no | `s-maxage=120` |
| `/api/clash` | GET | Torneos de Clash agrupados | no | no | `s-maxage=300` |
| `/api/team-digest` | GET | Resumen semanal del grupo | no | no | `s-maxage=300` (semana 0) / `3600` |
| `/api/liga` | GET | Tabla de la liga de la semana | no | no | — |
| `/api/liga` | POST | Anota o saca gente de la liga | sí | **sí** | — |
| `/api/liga/anunciar` | POST | Manda el mensaje de arranque a Discord | no | **sí** | — |
| `/api/summoners` | POST | Agrega un invocador al grupo | sí | **sí** | — |
| `/api/refresh` | POST | Refresca uno o todos (cooldown de 2 min) | sí | **sí** | — |
| `/api/backfill` | POST | Trae partidas viejas de un invocador | sí | **sí** | — |
| `/api/repair` | POST | Rellena columnas nuevas en filas viejas | sí | **sí** | — |
| `/api/coach` | POST | Análisis del pool con Claude | sí (caché) | **sí**\* | — |
| `/api/roast` | POST | Dispara la cargada de Discord | no | **sí** | — |
| `/api/login` | GET/POST/DELETE | Estado de sesión / entrar / salir | no | no | — |
| `/api/cron/refresh` | GET | Cron diario: refresca a todos | sí | `CRON_SECRET` | — |
| `/api/cron/liga` | GET | Cron de lunes: cierra la semana | sí | `CRON_SECRET` | — |

\* `/api/coach` con `{ peek: true }` **no** pide sesión: solo mira el caché de
`coach_reports` y nunca llama al modelo. Es lo que hace el panel al abrirse. Generar
un informe nuevo sí pide sesión — era el agujero concreto que motivó la cerradura.

Las que tardan (`refresh`, `backfill`, `repair`, `coach`) declaran
`maxDuration = 300`. Las que dependen de la hora o del pedido declaran
`dynamic = "force-dynamic"` — eso apaga el caché de datos de Next, pero **el CDN de
Vercel igual respeta `s-maxage`**, que es de donde sale la ventana de caché que hay
que tener en cuenta al agregar campos (ver `DECISIONES.md`).

## Módulos de `lib/`

Cada archivo arranca con un header que explica el porqué. Acá está solo para qué
sirve; si hace falta el detalle, se lee ese header, no el archivo entero.

**Riot y datos externos**
- `riot.ts` — el wrapper de la API de Riot (Account-V1, League-V4, Match-V5).
- `ddragon.ts` — Data Dragon: los ids numéricos (campeón, runa, hechizo) a nombre.
- `champion-names.ts` — id de campeón → nombre lindo.
- `live.ts` — Spectator-V5 para un lote de puuids, con la forma que renderiza la UI.
- `supabase.ts` — el cliente de servidor (service role, nunca al navegador).
- `discord.ts` — el webhook, best-effort: si falla no puede romper el cron.

**Ingesta**
- `refresh.ts` — todo lo que escribe partidas. **Sus puertas son `refreshOne`,
  `backfillOne`, `repairMatches` y `refreshAllSummoners`**; adentro, `buildMatchRow`
  (línea ~385) es el único lugar donde se arma una fila de `matches`.
- `mapping.ts` — tiers de League-V4 → los `TierKey` de la UI.

**Cálculo puro** (sin red ni base: entran datos, salen números)
- `ladder.ts` — tier, rachas, fechas relativas, promedios por rol.
- `wilson.ts` — el límite inferior de Wilson, para ordenar winrates con poca muestra.
- `lineas.ts` — historial por línea y detección de autofill.
- `live-roles.ts` — en qué línea juega cada uno **durante** la partida (Spectator no
  lo dice; se estima probando las 120 permutaciones).
- `matchups.ts` — enfrentamientos de línea, desde `matches.opponent_champion`.
- `radar.ts` — las siete dimensiones, contra el resto del grupo en ese mismo rol.
- `insights.ts` — fortalezas y debilidades contra el promedio real del rol.
- `form.ts` — forma reciente: sus últimas N contra todo lo anterior de él mismo.
- `tilt.ts` — "estás jugando peor Y no estás parando".
- `matchflags.ts` — marca partidas atípicas contra la forma propia.
- `builds.ts` — el orden de compra cruzado con el resultado.
- `champion-insights.ts` — maestría de Riot contra el pool real de ranked.
- `aegis.ts` — inferencia de "Aegis of Valor" a partir de los snapshots.
- `clash.ts` — agrupa las partidas de Clash (queue 700) en torneos.
- `timeline.ts` — extrae de los frames de Match-V5 los números de `MatchDetail`.
- `match-story.ts` — "dónde se dio vuelta la partida", en castellano.
- `liga.ts` — la liga semanal: ventanas de tiempo, tabla y mensajes.
- `liga-cierre.ts` — el cierre idempotente de la semana.
- `roast.ts` — las cargadas: plantillas, precedencia y las especiales.
- `coach.ts` — el prompt del análisis del pool.

**Presentación**
- `chart.ts` — la geometría de las líneas y áreas de los gráficos.
- `metric-info.ts` — los textos de los `InfoTip`.
- `useImageFallback.ts` — el hook de "si la imagen falla, mostrá un chip".
- `view-transition.ts` — cambios de vista con View Transition API.

**Infraestructura**
- `auth.ts` — la cerradura: `passwordCorrecta`, `sesionValida`, `exigirSesion`.
- `types.ts` — `Player`, `MatchRow`, `LadderRow` y compañía. Es el contrato entre el
  ladder y toda la UI.

## El flujo de datos

**De Riot a la base** (escribe):

```
cron diario (0 12 * * *)  →  /api/cron/refresh  ─┐
botón "Actualizar"        →  /api/refresh       ─┴→ refreshAllSummoners
                                                         │
                                                         ↓  por cada invocador
                                                     refreshOne
                                                         │
                    ┌────────────────────────────────────┼──────────────────────┐
                    ↓                    ↓               ↓                      ↓
             League-V4: rango     Mastery-V4        Match-V5: ids        lp_snapshots
             → summoners          → champion_       nuevos                (solo si cambió
                                    mastery            │                   algo)
                                                       ↓
                                              fetchAndStoreMatch
                                                       │
                                                       ↓
                                                 buildMatchRow  →  matches
                                                       │
                                                       ↓
                                            racha / ascenso / cargada  →  Discord
```

`repairMatches` y `backfillOne` entran por el mismo `buildMatchRow`: **hay un solo
lugar donde se arma una fila de partida**. Por eso agregar una columna es siempre el
mismo cambio (ver abajo).

**De la base a la pantalla** (lee):

```
app/page.tsx  ──fetch──→  /api/ladder GET
                              │
                              ├─ vista `ladder` (rango y contadores, ya agregados)
                              ├─ Promise.all en paralelo:
                              │    lp_snapshots · matches (queue 420) · champion_mastery
                              └─ Spectator-V5 en vivo, en paralelo con lo anterior
                              │
                              ↓
                    UN recorrido sobre matches que llena Maps por puuid
                    (pool, récords, matchups, líneas, promedios de rol…)
                              │
                              ↓
                    UN .map final por jugador que delega en los módulos
                    puros de lib/ (radar, insights, form, tilt, builds…)
                              │
                              ↓
                    { players, duoSynergy, championLeaderboard }
```

Ese `.map` final es la clave: el handler es largo pero **no tiene lógica de negocio
propia**, solo junta lo que devuelven los módulos de `lib/`.

## Tablas de Supabase

- **`summoners`** — un invocador del grupo. `puuid` (PK), `game_name`, `tag_line`,
  rango actual (`tier`, `division`, `lp`, `wins`, `losses`), `role`, `icon_id`,
  `last_refreshed_at`, y `liga_desde` (desde cuándo cuenta para la liga).
- **`matches`** — una fila por **jugador por partida**: la PK es compuesta
  `(match_id, puuid)`, porque dos amigos en la misma partida necesitan fila propia.
  Guarda el stat line entero, los diffs de oro a los 10/15/20, los tiempos y la
  atribución de objetivos, `team_position`, `opponent_champion`, `item_build`,
  `queue_id` y `repaired_at`.
- **`lp_snapshots`** — la serie de LP en el tiempo, para los gráficos y la liga.
  Solo inserta si algo cambió respecto de la fila anterior.
- **`champion_mastery`** — la maestría de Riot por campeón.
- **`coach_reports`** — el caché de los informes de Claude.
- **`liga_semanas`** — las semanas cerradas de la liga, con su campeón.
- **`ladder`** — **una vista**, no una tabla: `summoners` con los contadores ya
  agregados. Las columnas nuevas van **al final** o Postgres tira 42P16.

De **flex no se guarda nada, nunca**: se consulta en vivo para la cargada y se
descarta.

## Componentes por pestaña

`TopBar` (agregar invocador, refrescar, cerradura), `TabNav` (`ranking` · `stats` ·
`versus` · `clash` · `team`), `LiveTray` y `CommandPalette` viven fuera de las
pestañas.

- **Ranking** → `LadderTable` (que adentro tiene `LigaSemanal`, `TierEmblem`,
  `SparkChart`, `RoleIcon`, `PlayerAvatar`) + `PlayerProfile`.
  `PlayerProfile` es el más grande: `RadarChart`, `InsightsCard`, `RecentForm`,
  `TiltCard`, `ChampionPool`, `MasteryPool`, `ChampionInsights`, `Matchups`,
  `LineHistory`, `BuildStarts`, `PersonalRecords`, `AegisStats`, `CoachPanel`,
  `LiveGamePanel` y `MatchDetail` (que a su vez abre `MatchTimeline`).
- **Estadísticas** → `TopWinrate`, `ChampionWinrateLeaderboard`, `DuoSynergy`.
- **Cara a cara** → `HeadToHead`. No pide nada al servidor.
- **Clash** → `ClashHistory`.
- **Equipo** → `TeamDigest`.

Compartidos: `ChampIcon`, `TierEmblem`, `PlayerAvatar`, `SparkChart`, `InfoTip`,
`StatIcons`, `StreakIcon`, `RoleIcon`, `Select`, `Cerradura` (que exporta
`fetchConClave`, el fetch que pide la contraseña cuando hace falta).

## Cómo agregar un dato al perfil

Es siempre el mismo patrón, y saberlo evita leer el handler del ladder entero:

1. **Si es una columna nueva de `matches`**: el `ALTER TABLE`, el campo en
   `buildMatchRow` (`lib/refresh.ts` ~385), el campo en `MatchRow` de `lib/types.ts`,
   la columna en el `select` de `matches` del ladder (~línea 144), y
   `repaired_at = null` para que `repairMatches` rellene lo viejo.
2. **El cálculo va en un módulo nuevo y puro de `lib/`**, con su header explicando
   el porqué. Nada de lógica dentro del route handler.
3. **Una línea en el `.map` final** de `/api/ladder` que llame a ese módulo.
4. **El campo en `Player`** (`lib/types.ts`).
5. **El componente** que lo muestra — y leerlo **con guarda**, porque durante la
   ventana del CDN llega JSON viejo sin ese campo (ver `DECISIONES.md`).

## Entorno

`RIOT_API_KEY`, `RIOT_REGION`, `RIOT_PLATFORM`, `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `DISCORD_WEBHOOK_URL`,
`APP_PASSWORD` (la cerradura), `CRON_SECRET` (los crons).

Crons en `vercel.json`: `/api/cron/refresh` todos los días a las 12:00 UTC y
`/api/cron/liga` los lunes a las 03:00 UTC. En el plan Hobby de Vercel disparan una
vez por día y con imprecisión, así que el cierre de la liga es idempotente y también
se dispara solo al leer `/api/liga`.
