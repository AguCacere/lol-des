# Arquitectura

El mapa del proyecto. Está para **decidir qué NO abrir**: si la pregunta se contesta
acá, no hace falta leer `lib/refresh.ts` (1196 líneas) ni `app/api/ladder/route.ts`
(1257). Esos dos son el 80% del gasto de tokens de una sesión y casi siempre son
evitables.

## Forma general

Una sola página cliente (`app/page.tsx`) con **siete** pestañas, y 23 route handlers.
Abre en **Inicio**, no en el ladder.
**No hay Server Components de datos**: todo entra por `fetch` a `/api/*` desde el
navegador. El servidor solo existe en las rutas.

`app/page.tsx` carga `/api/ladder` una vez y de ahí sale casi toda la app: los
`Player` vienen completos (rango, pool, radar, historial, líneas, récords) y en la
misma respuesta viaja `radiografia`, que es toda la pestaña Estadísticas ya
calculada, así que las pestañas Ranking, Estadísticas y Cara a cara **no piden nada
más al servidor**. El filtro de período de Estadísticas tampoco: las tres ventanas
vienen en la misma respuesta y cambiar de una a otra es estado de React.
Clash y Equipo cargan su ruta la primera vez que se las abre, no antes.

## Rutas

Todas viven en `app/api/*/route.ts`. "Sesión" = pasa por `exigirSesion` de
`lib/auth.ts`; sin `APP_PASSWORD` en el entorno responden 503 (falla cerrado: si la
cerradura no está puesta, nadie escribe).

| Ruta | Método | Qué hace | Escribe | Sesión | Cache-Control |
|---|---|---|---|---|---|
| `/api/mejora` | GET | Todo lo que dibuja la pestaña Mejora para UNA persona: diagnóstico de la última, patrones, progreso, cruces, líneas de base y el objetivo activo. Sin caché: se abre justo después de jugar | no | no | `no-store` |
| `/api/mejora` | POST | Guarda un objetivo o cierra el activo | sí | **sí** | — |
| `/api/ladder` | GET | El plato fuerte: arma los `Player` completos, la sinergia de dúos y la **radiografía** que dibuja Estadísticas | no | no | `s-maxage=240, swr=600` |
| `/api/live` | GET | Solo quién está en partida ahora (poll de 60s) | no | no | — |
| `/api/live-detail` | GET | Los diez de una partida en vivo, con líneas estimadas | no | no | `s-maxage=120` |
| `/api/clash` | GET | Torneos de Clash agrupados | no | no | `s-maxage=300` |
| `/api/team-digest` | GET | Resumen semanal del grupo | no | no | `s-maxage=300` (semana 0) / `3600` |
| `/api/liga` | GET | Tabla de la liga de la semana, la carrera, la vitrina de campeones, TODAS las partidas de la semana de cada uno con su LP y su KDA (el detalle que se abre las agrupa por día para poder auditar el puntaje), y `actualizado` (cuándo escribió el cron, para el cartel de frescura propio de la liga) | no | no | `s-maxage=240, swr=600` |
| `/api/liga` | POST | Anota o saca gente de la liga | sí | **sí** | — |
| `/api/liga/semana` | GET | Cómo terminó una semana vieja: tabla final, carrera y quién cobró | no | no | `s-maxage=21600, swr=86400` |
| `/api/liga/semana` | POST | Rescata a mano la foto de una semana vieja sin `resumen` | sí | **sí** | — |
| `/api/liga/anunciar` | POST | Manda el mensaje de arranque a Discord. Con `{tipo:"cierre"}` devuelve la vista previa del anuncio de cierre y no manda nada | no | **sí** | — |
| `/api/liga/diario` | GET | El parte diario al Discord: cómo va la liga y qué movió cada uno hoy. Se calla los domingos y los días sin partidas | no | `CRON_SECRET` | — |
| `/api/liga/diario` | POST | Vista previa del parte, sin mandar nada. Con `{ahora:"…"}` se ve el de otro día | no | **sí** | — |
| `/api/summoners` | POST | Agrega un invocador al grupo | sí | **sí** | — |
| `/api/refresh` | POST | Refresca uno o todos (cooldown de 2 min) | sí | **sí** | — |
| `/api/backfill` | POST | Trae partidas viejas de un invocador | sí | **sí** | — |
| `/api/repair` | POST | Rellena columnas nuevas en filas viejas | sí | **sí** | — |
| `/api/coach` | POST | Análisis del pool con Claude | sí (caché) | **sí**\* | — |
| `/api/roast` | POST | Dispara la cargada de Discord | no | **sí** | — |
| `/api/carry` | POST | Dispara la carrileada: el gemelo de `/api/roast` para el otro lado | no | **sí** | — |
| `/api/torneos` | GET/POST/PATCH/DELETE | Planificar los torneos: cuándo arranca cada uno, cuándo cierra y sus mínimos | sí | **sí** | — |
| `/api/login` | GET/POST/DELETE | Estado de sesión / entrar / salir | no | no | — |
| `/api/discord/interactions` | POST | La puerta del bot: los cuatro comandos. La cerradura es la **firma Ed25519** de Discord, no la sesión | no | firma | — |
| `/api/discord/registrar` | POST | Le registra a Discord el menú de comandos. Lo mismo que `scripts/registrar-comandos.mjs`, pero sin necesitar una consola con Node | no | **sí** | — |
| `/api/discord/probar` | POST | Si los anuncios salen por el bot o por el webhook. Sin body no manda nada; con `{mandar:true}` manda, reacciona y borra | no | **sí** | — |
| `/api/discord/decir` | POST | Un mensaje propio, como el bot, con reacciones opcionales. Sin `{mandar:true}` es vista previa | no | **sí** | — |
| `/api/cron/refresh` | GET | Cada 15 min: refresca a todos | sí | `CRON_SECRET` | — |
| `/api/cron/liga` | GET | Cierra la semana. Ya NO está en `vercel.json` (le dio el lugar al parte diario): queda para pegarle a mano | sí | `CRON_SECRET` | — |

\* `/api/coach` con `{ peek: true }` **no** pide sesión: solo mira el caché de
`coach_reports` y nunca llama al modelo. Es lo que hace el panel al abrirse. Generar
un informe nuevo sí pide sesión — era el agujero concreto que motivó la cerradura.

Las dos cachés de 240 segundos no son un ajuste fino: son el remedio de la caída de
septiembre. El pool de Supabase Nano tiene 15 conexiones, `/api/liga` hacía cinco
consultas por visita de cada uno y el cron se quedaba sin ninguna (ver `DECISIONES.md`).
La ventana se elige contra cada cuánto CAMBIAN los datos —el cron escribe cada 15
minutos—, no contra cada cuánto alguien mira.

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
- `discord.ts` — la salida al canal, best-effort: si falla no puede romper el
  cron. Manda por el **token del bot** cuando está configurado y cae al webhook
  cuando no; `reaccionar` y `editarMensaje` existen solo por el primer camino,
  porque un webhook no tiene identidad con la cual reaccionar.
- `discord-firma.ts` — verifica la firma Ed25519 de cada interacción. Sin
  dependencia nueva: Node hace Ed25519 nativo.
- `discord-comandos.ts` — los cuatro comandos del bot, de Supabase al texto.
  Ninguno toca Riot. Las definiciones que se le registran a Discord viven en
  `discord-comandos.json`, que también lee `scripts/registrar-comandos.mjs`.

**Ingesta**
- `refresh.ts` — todo lo que escribe partidas. **Sus puertas son `refreshOne`,
  `backfillOne`, `repairMatches` y `refreshAllSummoners`**; adentro, `buildMatchRow`
  (línea ~385) es el único lugar donde se arma una fila de `matches`.
  También vive acá la regla de **qué partida cuenta**: `RANKED_SOLO_QUEUE_ID`,
  `DURACION_MINIMA_S` (el corte de remake) y `esRemake`. Los remakes se guardan pero se
  filtran al LEER —un `.gte("game_duration_s", DURACION_MINIMA_S)` en cada consulta que
  cuenta partidas— así que arreglar esto no necesitó ni migración ni backfill. Toda
  consulta nueva sobre `matches` que cuente victorias, derrotas o promedios tiene que
  llevar ese filtro; ver DECISIONES → Riot.
  La otra regla de la casa vive acá al lado: `aliadoAfk`, que mira la experiencia por
  minuto de los cinco del equipo (`minutosSinJugar`, en `lib/timeline.ts`) y deja escrito
  en `matches.ally_afk` si a alguien se le plantó un compañero. Ese se
  decide al ESCRIBIR (al leer ya no está el payload) y lo filtran **solo las dos
  consultas de la liga**, no toda la app: un AFK es una derrota de verdad para Riot, pero
  no te saca LP. Las filas viejas quedan en `false` hasta que pase `repairMatches`.
- `mapping.ts` — tiers de League-V4 → los `TierKey` de la UI.

**Cálculo puro** (sin red ni base: entran datos, salen números)
- `ladder.ts` — tier, rachas, fechas relativas, promedios por rol.
- `wilson.ts` — el límite inferior de Wilson, para ordenar winrates con poca muestra.
- `lineas.ts` — historial por línea y detección de autofill.
- `live-roles.ts` — en qué línea juega cada uno **durante** la partida (Spectator no
  lo dice; se estima probando las 120 permutaciones).
- `matchups.ts` — enfrentamientos de línea, desde `matches.opponent_champion`.
- `radar.ts` — las siete dimensiones, contra el resto del grupo en ese mismo rol.
  Ya no se dibuja como radar: `ProfileMejorar` usa sus ejes como una lista ordenada.
- `form.ts` — forma reciente: sus últimas N contra todo lo anterior de él mismo.
- `tilt.ts` — "estás jugando peor Y no estás parando".
- `matchflags.ts` — marca partidas atípicas contra la forma propia.
- `builds.ts` — el orden de compra cruzado con el resultado.
- `champion-insights.ts` — maestría de Riot contra el pool real de ranked.
- `aegis.ts` — inferencia de "Aegis of Valor" a partir de los snapshots.
- `clash.ts` — agrupa las partidas de Clash (queue 700) en torneos.
- `timeline.ts` — extrae de los frames de Match-V5 los números de `MatchDetail`.
- `match-story.ts` — "dónde se dio vuelta la partida", en castellano.
- `torneo.ts` — **la ventana de cada torneo**: cuándo arranca, cuándo cierra,
  cuánto dura y qué mínimos pide. Es la capa de CALENDARIO y `liga.ts` la de
  puntaje: liga importa de acá, nunca al revés. Antes la ventana se DEDUCÍA (el
  lunes de la semana, más siete días) y el 7 estaba clavado en cinco lugares;
  ahora sale de `liga_torneos`, y sin fila cae al lunes a domingo de siempre.
- `liga.ts` — la liga: la tabla (`tablaDeLaSemana`), la tabla de puntos
  (`puntosDeSecuencia`, `PUNTOS_*`, `RACHA_DESDE`, `MODO_LIGA`), el acumulado por día
  que dibuja la carrera (`puntosPorDia`, `diasCorridos`, `etiquetasDeDias`), los
  mínimos para cobrar (`MINIMO_SEMANAL`, `MINIMO_ULTIMO_DIA`, `ganadorDe`) y los dos
  mensajes de Discord: `mensajeDeArranque`, `mensajeDeCierre` —el podio con una
  cargada por puesto, que no habla del premio a propósito— y `mensajeDelDia`, el
  parte diario (medallas para el podio, 💩 para el resto, y lo que movió cada uno
  hoy). `mensajeDelDia` devuelve **null** cuando no hay nada que mandar: los
  domingos —ese día sale el cierre y dos mensajes se pisan— y los días en que no
  jugó nadie.
- `palmares.ts` — el historial de la liga: `dueloDeLaEdicion` (por cuánto ganó y
  contra quién, null si el campeón no terminó primero), `palmares` y `titulosDe`
  (cuántas copas tiene cada uno, contadas por PUUID para que un renombre no
  parta a una persona en dos) y `comoSeDefinio`, la narración de la edición
  armada con restas sobre `porDia` y no con un modelo. Todas devuelven null
  cuando el dato no alcanza.
- `liga-titulos.ts` — los títulos de la semana: `repartirTitulos` da UNO por persona
  (el que más la destaca de los que quedan libres), no el líder de cada categoría. Ver
  DECISIONES para por qué, y para la regla de relativas contra absolutas antes de agregar
  una nueva.
- `liga-cierre.ts` — el cierre idempotente de la semana. `tablaDeSemanaEnBase` arma
  la tabla final desde la base —con `{conCarrera:true}` calcula también el acumulado
  por día—, `vistaPreviaDeCierre` devuelve el texto del anuncio sin escribir ni mandar
  nada, y `comoTerminoLaSemana` la foto que muestra el cartel del torneo pasado. Los
  tres salen del mismo armado a propósito: si la pantalla armara la tabla por su
  cuenta, una semana vieja podría mostrar un ganador distinto del que anunció el bot.
- `roast.ts` — las cargadas: plantillas, precedencia y las especiales.
- `hitos.ts` — los momentos que merecen un grito: penta, cuádruple, partida sin
  morir y récord personal roto. La tercera categoría, distinta de las otras dos:
  no es "jugó bien", es que **pasó algo**. Los umbrales se midieron contra las
  1058 partidas guardadas — sin el mínimo de historial, el récord solo salta en
  una de cada nueve partidas.
- `carry.ts` — la contracara: cuándo alguien se llevó la partida al hombro. Los
  umbrales son **por rol** y salieron de medir las 1047 partidas guardadas, no de
  elegirlos a ojo: el p90 del % de daño es 30 en las líneas y 22,5 en la jungla,
  y el support no se mide por daño en absoluto (tiene tres caminos: enchanter,
  enganche y tanque). Ver el header para por qué cada uno.
- `coach.ts` — el prompt del análisis del pool.

**Presentación**
- `actividad.ts` — lo que alimenta Inicio: `movimientosRecientes` (ascensos,
  descensos, LP y rachas de las últimas 24 horas, sacados de restar dos fotos de LP
  reales; cada uno trae el cambio ya escrito en UNA línea —"Esmeralda 2 → Esmeralda 1"—
  porque en pantalla el nombre y lo que le pasó son una sola unidad) y `resumenDeHoy` (partidas, V/D y cuántos jugaron HOY, por día calendario
  argentino). **Se calla antes que inventar**: si `lpHistory` —que son las últimas 20
  fotos, no las de las últimas N horas— no llega hasta el corte de la ventana, ese
  movimiento no se publica. Ver el header y DECISIONES.
- `mejora.ts` — el motor determinístico de la pestaña Mejora: el catálogo de
  `METRICAS` (siete), la línea de base propia de cada una (`baselineDe`, por
  percentiles), el `diagnostico` de una partida en tres capas, los `patrones`
  sobre una ventana, el `progreso` contra uno mismo, `matchupsDeMejora` y la
  evaluación de objetivos. **Todo se compara contra el propio historial del
  jugador, nunca contra una constante** — la mediana de CS por minuto del grupo
  va de 1,4 (support) a 7,7 (ADC), así que un umbral fijo mide roles, no
  personas. Cálculo puro, probado con fixture. No hay IA acá y el plan es
  explícito en que no tiene que hacer falta.
- `ruta-perfil.ts` — el enlace compartible de un perfil (`#inv/VORE-CHESS`) en las
  dos direcciones. Resuelve contra la lista de jugadores y no parseando el texto:
  un nombre de Riot puede tener espacios y guiones, así que desde el slug solo no
  se sabe dónde termina el nombre.
- `radiografia.ts` — lo que mira la pestaña Estadísticas, todo sobre una VENTANA
  elegible (7 días, 30 días o toda la temporada guardada): la `historia` del período
  (un protagonista y lo demás), el estado de forma —una sola lista por persona con
  su winrate del período, sus últimas 10, su racha, sus días, su LP y su campeón—,
  especialistas y campeones más jugados, y el salón de la fama. El mínimo del período
  ya NO expulsa de la lista: la marca con `alcanzaMinimo` y la pantalla muestra
  aparte y apagado a quien no llega, en vez de tragárselo sin decir por qué. Los umbrales están arriba del archivo con la tabla de la que salieron
  (`MINIMO_ESPECIALISTA`, `MINIMO_WINRATE`) — ver DECISIONES antes de tocarlos. Es
  cálculo puro: entran partidas, fotos de LP y personas; sale todo armado. Se llama
  UNA vez, desde `/api/ladder`, porque las dos consultas pesadas que necesita ya
  están leídas ahí.
- `chart.ts` — la geometría de las líneas y áreas de los gráficos: recta o curva
  suave (cúbica monótona: pasa por cada punto y no se pasa entre dos), con escala
  propia o compartida entre varias series. Y la paleta de series: `PALETA_SERIES`
  —ocho colores en orden fijo, validados contra el fondo real— y `coloresDeSeries`,
  que los reparte por ID ordenado para que el color siga a la PERSONA y no a su
  puesto en la tabla.
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
cron externo (cada 15 min) →  /api/cron/refresh ─┐
curl / consola            →  /api/refresh       ─┴→ refreshAllSummoners
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
                          racha / ascenso / cargada / carry / hito  →  Discord
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
  `queue_id`, `ally_afk` (se le fue un compañero) y `repaired_at`.
- **`lp_snapshots`** — la serie de LP en el tiempo, para los gráficos y la liga.
  Solo inserta si algo cambió respecto de la fila anterior.
- **`champion_mastery`** — la maestría de Riot por campeón.
- **`coach_reports`** — el caché de los informes de Claude.
- **`liga_ajustes`** — los ajustes a mano del puntaje, PK `(semana, puuid)`: `puntos`
  (negativo castiga) y `motivo`, que es not null porque se muestra en pantalla. Lo leen
  `/api/liga` y `lib/liga-cierre.ts`, y las dos se lo pasan a `tablaDeLaSemana`, que lo
  suma a `puntos` y corre `porDia` en paralelo. Si solo lo aplicara una de las dos, el
  podio del bot diría algo distinto de la tabla.
- **`liga_semanas`** — las semanas cerradas de la liga: `semana` (el lunes, PK),
  `ganador_puuid`, `ganador_label`, `puntos` (el puntaje con el que ganó, que es lo
  que decide), `lp_neto` (contexto, ya no se muestra), `jugadores` y `resumen`
  (jsonb) — la foto final entera de esa semana, que se escribe al cerrar porque
  **una semana cerrada no se puede reconstruir después**: el armado en vivo depende
  de `participa_liga`, que es un estado del presente. Una semana
  registrada acá no se vuelve a anunciar: es el candado de idempotencia del cierre.
- **`ladder`** — **una vista**, no una tabla: `summoners` con los contadores ya
  agregados. Las columnas nuevas van **al final** o Postgres tira 42P16.

De **flex no se guarda nada, nunca**: se consulta en vivo para la cargada y se
descarta.

## Componentes por pestaña

`TopBar` (agregar invocador, refrescar, cerradura), `TabNav` (`inicio` · `ranking` ·
`stats` · `versus` · `clash` · `team`), `LiveTray` y `CommandPalette` viven fuera de las
pestañas.

- **Inicio** → `Inicio`. El hub. Tres zonas, no una pila de secciones: la franja del
  día (`.pulso`: la fecha, los números de hoy y quién está jugando, en ~46px), la liga
  (`.liga-spot`, la ÚNICA superficie de la pantalla) y una grilla de áreas
  (`.inicio-cuerpo`) donde el ladder va abajo de la liga y "qué se movió" ocupa las dos
  filas de la derecha. El interior de la card de la liga se parte en dos por
  **consulta de contenedor**, no por ancho de ventana. Ver DECISIONES para el porqué de
  cada una. No pide NADA al servidor: los `Player` ya vienen del ladder y la liga sale
  de `useLiga`. Los chips de "en partida" y el bloque de "qué se movió" **no existen**
  cuando no hay nada que mostrar — no hay tarjeta vacía.

- **Ranking** → `LadderTable` (que adentro tiene `LigaSemanal`, `TierEmblem`,
  `SparkChart`, `RoleIcon`, `PlayerAvatar`) + `PlayerProfile`.
  `LigaSemanal` arma la pestaña de la liga de arriba abajo: `LigaEstado` (el panel
  de cuánto falta y quién cobra, con el rango de la semana y el "actualizado hace X"
  de rótulo), `LigaCarrera` (el gráfico de la semana, con un
  color por jugador), la LISTA de jugadores (`.jug*` — ya no es una tabla: flex, sin
  encabezado de columnas y con el récord abajo del nombre; al tocar una se abre su
  historial `.liga-partida*`, una línea de tiempo cuyos nodos cuelgan del mismo hilo que
  baja del avatar del jugador), y al pie la vitrina de campeones —que no tiene
  componente propio: vive adentro de `LigaSemanal` con las clases `.vitrina*`—.
  Desde el pie de la carrera se abre `LigaDiaADia`, la grilla de jugadores × días
  con lo que hizo cada uno y en qué puesto cerró (dos vistas, un toggle). Sale del
  mismo `porDia` que dibuja la carrera, así que no pide nada al servidor.
  El detalle que se abre agrupa las partidas por día y **cada día se despliega**, con
  el más nuevo abierto por defecto (ver DECISIONES).
  Al pie, `LigaHistorial` —la última edición con su margen real, las anteriores
  y el palmarés— y desde ahí se abre `LigaTorneo`, el archivo de una edición: va encima y no en una pantalla propia porque es una foto de diez segundos
  y mandar a otra página obliga a irse de la liga y volver.
  `PlayerProfile` es el más grande: `RadarChart`, `InsightsCard`, `RecentForm`,
  `TiltCard`, `ChampionPool`, `MasteryPool`, `ChampionInsights`, `Matchups`,
  `LineHistory`, `BuildStarts`, `PersonalRecords`, `AegisStats`, `CoachPanel`,
  `ProfileMejorar` (una fila por métrica contra el promedio de su línea, partida en
  fortalezas y debilidades; reemplazó al radar, a su tabla y a la tarjeta de
  insights, que decían lo mismo tres veces y la última encima mal calculada),
  `ProfileForma` (la banda de "cómo viene" del Resumen: las últimas 5, las últimas
  20 contra su propio historial y la season, cada una con su muestra),
  `LiveGamePanel` y `MatchDetail` (que a su vez abre `MatchTimeline`).
- **Estadísticas** → `Estadisticas` (el armazón: elige la ventana y ordena las
  piezas) → `EstHistoria` (la portada del período: un protagonista y notas al
  costado), `EstForma` (UNA clasificación compacta: las últimas 10 en puntos, el récord
  del período, WR y balance; seis por defecto y filas que se abren), `EstCampeones` (un selector Especialistas/Más jugados, el arte del
  campeón como protagonista) y `EstRecords` (la pared: los dos grandes arriba, los otros cinco en una fila pareja). Al lado,
  `DuoSynergy`, que es un explorador en tres pasos: roster → vínculos → comparación.
  El período vive como estado de `Estadisticas`, no de la página: no lo lee nadie más.
- **Ranking** tiene DOS estados, no dos bloques apilados: el ladder (`LadderTable`,
  o `LigaSemanal` con el interruptor de vista) **o** el perfil (`PlayerProfile`),
  nunca los dos. Tocar una fila entra al perfil y escribe `#inv/nombre-tag`; se sale
  con "← Volver al ladder" o con el botón Atrás del navegador, que hacen lo mismo.
  El hash lo resuelve `lib/ruta-perfil.ts` contra la lista de jugadores cargada.
- **Mejora** → `Mejora`. La única pestaña que pide por UNA persona: carga
  `/api/mejora?puuid=…` al elegir a alguien del roster, con un guardia contra
  respuestas que vuelven fuera de orden.
- **Cara a cara** → `HeadToHead`. No pide nada al servidor.
- **Clash** → `ClashHistory`.
- **Equipo** → `TeamDigest`.

`useLiga` (`components/useLiga.ts`) es el caché de módulo de `/api/liga`: lo comparten
Inicio y `LigaSemanal` para no pedir dos veces la misma respuesta pesada. Ahí viven
también los tipos `Datos`, `Fila` y `PartidaLiga`.

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

Y las del bot: `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` (mandar como el bot;
sin ellas todo cae al webhook), `DISCORD_PUBLIC_KEY` (la cerradura de
`/api/discord/interactions` — sin ella no entra ningún comando), y
`DISCORD_APP_ID` + `DISCORD_GUILD_ID`, que usa el registro del menú de comandos
—`POST /api/discord/registrar` o el script— y por la primera **también van en
Vercel**.

**El refresco corre cada 15 minutos**, disparado por un scheduler externo (tipo
cron-job.org) con `Authorization: Bearer $CRON_SECRET`. No sale de `vercel.json`
porque el plan Hobby de Vercel solo permite un cron por día; las entradas que hay
ahí (`/api/cron/refresh` a las 12:00 UTC, `/api/cron/liga` los lunes a las 03:00)
quedan como red de contención.

La ruta contesta al toque y trabaja en `after()`: los schedulers gratuitos cortan la
espera a los 30s, menos de lo que tarda un refresco completo.

El cierre de la liga se dispara desde tres lados —el cron de refresco, el cron de
liga y la lectura de `/api/liga`— y es idempotente, así que no importa cuál llegue
primero.
