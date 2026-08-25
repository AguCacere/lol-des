# Grieta Central

Ranked tracker privado para el grupo — un circuito de SoloQ Challenge pero de
amigos. Ladder ordenado por LP, perfil de invocador con progresión de LP
("últimos 20"), comparación macro/micro contra el promedio del rol, y las
últimas partidas. Enfocado en el grupo, no en ser un op.gg genérico.

Este repo es el **mockup ya portado a una app real de Next.js**, todavía
corriendo sobre datos de ejemplo (`lib/mock-data.ts`) — la UI y la lógica de
render son 1:1 el diseño aprobado. Lo que falta para producción es cablear
Riot + Supabase donde ya están los `TODO(db)`.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Riot Games API** — `lib/riot.ts` (Account-V1, League-V4, Match-V5)
- **Supabase (Postgres)** — `supabase/schema.sql`, para cachear datos de Riot
  y guardar historial de LP (Riot no expone rango histórico, solo el actual)
- Sin librería de UI — CSS a mano en `app/globals.css`, portado del mockup
  (paleta full dark, Rajdhani/Sora/Manrope/IBM Plex Mono vía `next/font/google`)

## Empezar en local

```bash
npm install
cp .env.example .env.local   # completar con tus valores (ver abajo)
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

### Variables de entorno

Ya tenés un `.env.local` con tu Riot API Key personal cargada (la que te
aprobaron en el Developer Portal, app 874500) — está gitignoreado, así que no
se sube al repo. Lo que falta completar ahí son las dos de Supabase una vez
que crees el proyecto:

| Variable | De dónde sale |
|---|---|
| `RIOT_API_KEY` | developer.riotgames.com → tu app → ya cargada |
| `RIOT_PLATFORM` | `la2` (LAS) — cambiar si el grupo juega en otra región |
| `RIOT_REGION` | `americas` — routing region para Account-V1/Match-V5 |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API, en supabase.com |
| `SUPABASE_SERVICE_ROLE_KEY` | idem — **nunca** exponer al browser |

Si la Riot API Key se filtra alguna vez, se regenera con "Nueva clave API" en
el portal — no hace falta pedir una nueva app.

## Lo que falta para producción

1. **Base de datos** — crear (o elegir) un proyecto de Supabase y correr
   `supabase/schema.sql` en el SQL Editor. Define `summoners`, `lp_snapshots`,
   `matches` y una view `ladder` que ya arma el join con el último snapshot
   de cada uno.
2. **Reemplazar los datos mock** — `lib/mock-data.ts` tiene el generador
   determinístico que usa hoy `getLadder()` / `app/api/ladder/route.ts`.
   Una vez que la base tenga datos reales, ese route handler pasa a leer la
   view `ladder` de Supabase en vez de generar data.
3. **Job de refresh** — algo (cron de Vercel, Supabase Edge Function
   programada) que cada tanto recorra `summoners`, pegue contra
   `getLeagueEntriesByPuuid` y `getMatchIdsByPuuid`/`getMatchById`
   (`lib/riot.ts`), y guarde snapshots nuevos — así se arma el historial de
   LP sin pisar el rate limit de la key personal (20 req/1s, 100 req/2min).
4. **Deploy en Vercel** — conectar el repo, cargar las mismas env vars del
   `.env.local` en Project Settings → Environment Variables, deploy.

`app/api/summoners/route.ts` ya pega contra la Riot API real (no mock) —
sirve para probar que la key funciona:

```bash
curl -X POST http://localhost:3000/api/summoners \
  -H "Content-Type: application/json" \
  -d '{"gameName":"TuNombre","tagLine":"LAS"}'
```

## Estructura

```
app/
  page.tsx              # composición: TopBar + TabNav + Ladder + Profile
  api/ladder/           # GET — hoy devuelve mock, mañana la view de Supabase
  api/summoners/        # POST — ya real, resuelve Riot ID → puuid + rango
components/
  LadderTable.tsx        PlayerProfile.tsx       SparkChart.tsx
  TopBar.tsx              TabNav.tsx              RoleIcon.tsx
lib/
  mock-data.ts           # generador determinístico (a reemplazar)
  riot.ts                # wrapper de Account-V1 / League-V4 / Match-V5
  supabase.ts             # cliente server-side (service role)
  chart.ts                # smoothing Catmull-Rom → Bezier para los gráficos
  types.ts
supabase/
  schema.sql
```

## Notas

- Uso personal y no comercial, para el grupo de amigos — no está pensado
  para escalar más allá de eso.
- El buscador y el "agregar invocador" están armados para llegar a esto,
  pero la UI del ladder todavía no tiene el flujo de alta — hoy solo filtra
  la lista existente.
