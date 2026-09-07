# Grieta Central

Tracker de ranked privado para un grupo de amigos del LAS — un circuito de SoloQ
Challenge, pero de seis personas que se conocen y se cargan entre ellas. No pretende
ser un op.gg genérico: todo lo que hace está pensado para ese grupo.

En producción: **https://lol-des.vercel.app**

## Qué hace

**Ranking** — el ladder ordenado por LP, con rango, racha, V/D y el gráfico de LP de
cada uno. Tocando una fila se abre el perfil completo: radar de rendimiento contra el
resto del grupo en su mismo rol, fortalezas y debilidades, forma reciente, detección de
tilt, pool de campeones, maestría de Riot, enfrentamientos de línea, historial por
línea (con detección de autofill), órdenes de compra, récords personales y las últimas
partidas con su timeline. Adentro de esta misma pestaña vive la **liga semanal**: se
cambia con el título.

**Estadísticas** — mejores winrates del grupo, ranking de campeones y sinergia de duos.

**Cara a cara** — dos jugadores del grupo comparados de frente, sin pedirle nada más al
servidor.

**Clash** — las partidas de Clash agrupadas por torneo, con su conclusión por día.

**Equipo** — el resumen semanal del grupo.

Además, sin pantalla propia:

**El bot de Discord** — anuncia ascensos y rachas, y **carga a quien juega mal**: KDA
desastroso, ahogarse en la fuente, perder contra un Nasus, cruzarse un Teemo. Se
dispara solo con el refresco.

**La liga semanal** — una competencia interna por **LP neto**, de lunes a domingo hora
argentina, aparte del ladder. El ladder mide dónde llegaste; la liga mide cuánto te
moviste esta semana. Es opt-in: cada uno cuenta desde que se lo anota, no desde el
lunes. Al cierre hay campeón y premio.

**La cerradura** — todo lo que escribe (agregar invocadores, refrescar, generar
informes con Claude, anotar gente en la liga) pide una contraseña compartida. Lo que
solo lee es abierto.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) en Vercel
- **Riot Games API** — Account-V1, League-V4, Match-V5, Spectator-V5, Mastery-V4
- **Data Dragon** para los assets estáticos
- **Supabase (Postgres)** — cachea lo de Riot y guarda el historial de LP, que Riot no
  expone (solo da el rango actual)
- **Claude** (`@anthropic-ai/sdk`) para el análisis del pool de campeones
- Sin librería de UI: CSS a mano en `app/globals.css`, paleta dark,
  Rajdhani/Sora/Manrope/IBM Plex Mono vía `next/font/google`

## Correrlo local

```bash
npm install
cp .env.example .env.local   # completar (ver abajo)
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

La base ya tiene que existir: crear el proyecto en Supabase y correr
`supabase/schema.sql` en el SQL Editor.

### Variables de entorno

| Variable | De dónde sale |
|---|---|
| `RIOT_API_KEY` | developer.riotgames.com → tu app |
| `RIOT_PLATFORM` | `la2` (LAS) |
| `RIOT_REGION` | `americas` — routing region de Account-V1 y Match-V5 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ídem — **nunca** al navegador |
| `APP_PASSWORD` | La contraseña compartida. **Sin esto, todas las rutas que escriben responden 503**: falla cerrado a propósito |
| `CRON_SECRET` | Lo que autentica a los crons de Vercel |
| `ANTHROPIC_API_KEY` | Para el análisis del pool. Sin esto ese panel no genera nada; el resto anda |
| `DISCORD_WEBHOOK_URL` | Opcional. Sin esto no se manda ninguna notificación y nada se rompe |

Si la Riot API Key se filtra, se regenera con "Nueva clave API" en el portal — no hace
falta pedir una app nueva.

## Crons

En `vercel.json`:

- `/api/cron/refresh` — todos los días a las **12:00 UTC**. Recorre a todos, trae
  partidas nuevas, guarda snapshots de LP y dispara las notificaciones de Discord.
- `/api/cron/liga` — los lunes a las **03:00 UTC**. Cierra la semana de la liga y
  corona al campeón.

El plan Hobby de Vercel dispara los crons **una vez por día y con imprecisión**, así
que el cierre de la liga es idempotente y también se dispara solo al leer `/api/liga`.
El refresco manual del botón "Actualizar" es lo que mantiene los datos al día durante
el día, con un cooldown de dos minutos.

## Estructura

```
app/
  page.tsx          # la única página: 5 pestañas, todo entra por fetch a /api/*
  api/              # 16 route handlers (ver ARQUITECTURA.md)
components/         # ~40 componentes, agrupados por pestaña en ARQUITECTURA.md
lib/                # Riot, cálculo puro, presentación e infraestructura
supabase/
  schema.sql        # summoners, matches, lp_snapshots, champion_mastery,
                    # coach_reports, liga_semanas + la view ladder
```

Para el mapa completo — la tabla de rutas, el flujo de datos de Riot a la pantalla, las
tablas con sus columnas y el patrón para agregar un dato al perfil — está
**`ARQUITECTURA.md`**. Las trampas ya pisadas (la ventana de caché del CDN, el huso de
Argentina, las PK compuestas, por qué las columnas nuevas de la view van al final)
están en **`DECISIONES.md`**.

## Comandos

```bash
npm run dev              # localhost:3000
npx tsc --noEmit         # tipos
npx eslint app lib components
npm run build
```

## Notas

Uso personal y no comercial, para el grupo. No está pensado para escalar más allá de
eso: seis o siete invocadores, una key personal de Riot (20 req/1s, 100 req/2min) y el
plan Hobby de Vercel.
