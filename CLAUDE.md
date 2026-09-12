# Grieta Central

Tracker de ranked privado para un grupo de amigos del LAS. No es un op.gg genérico:
todo está pensado para seis o siete personas que se conocen y se cargan entre ellas.

- **App**: Next.js 16 (App Router, TypeScript) en Vercel → https://lol-des.vercel.app
- **Datos**: Riot API + Data Dragon, cacheados en Supabase (Postgres)
- **Cinco pestañas**: Ranking (ladder + liga semanal), Estadísticas, Cara a cara, Clash, Equipo
- **Un bot de Discord** que anuncia rachas, ascensos y carga a quien juega mal
- **Una liga semanal** por puntos (victoria 1, derrota −0,75, y 1,25 desde la cuarta
  ganada al hilo), de lunes a domingo hora argentina, con premio. Para cobrarlo hay
  mínimos: 10 partidas en la semana y 3 el último día
- **Los datos se refrescan cada 15 minutos**, con un scheduler externo — NO con el cron
  de `vercel.json`, que en el plan Hobby solo puede correr una vez por día
- **La key de Riot NO vence cada 24 horas**: es una key de aplicación aprobada, no una
  de desarrollo. Nunca hay que "renovarla". Si fallan todos los invocadores a la vez,
  la causa está en otro lado — casi seguro en el cron o en el camino de escritura

## Antes de abrir un archivo

**Leé `ARQUITECTURA.md` primero.** Tiene el mapa de rutas, módulos y el flujo de datos.
Está escrito justamente para no tener que abrir los archivos grandes.

Los dos archivos más caros del repo y por dónde entrar sin leerlos enteros:

| Archivo | Líneas | La puerta |
|---|---|---|
| `lib/refresh.ts` | ~1090 | `refreshOne` (el ciclo por jugador) y `buildMatchRow` (arma la fila de partida) |
| `app/api/ladder/route.ts` | ~1080 | Un solo `GET` sin exports: queries en paralelo → un recorrido que llena Maps por puuid → un `.map` final que delega a `lib/` |

**`DECISIONES.md`** tiene las trampas ya pisadas. Vale la pena antes de tocar gráficos,
el esquema, la caché o los husos horarios — cada una está ahí porque ya rompió algo.

## Cómo se habla

Castellano rioplatense, en los comentarios y en la pantalla. De vos, directo, sin
adjetivos de relleno.

- **"línea"**, nunca "carril".
- Jerga argentina donde entre. El bot carga fuerte; la app es más seria pero no acartonada.
- **Prohibido en texto que ve el usuario**: "muestra", "tendencia estadística",
  "correlación". Nada que suene a paper. Se dice "de las últimas 20", no "sobre una
  muestra de 20".
- Los comentarios explican **por qué**, no qué. Si algo está hecho raro, el comentario
  dice qué pasaba antes.

## Reglas de trabajo

Sobre leer:

- `grep -n` para ubicar y leer solo ese tramo. No abrir un archivo entero para ver una función.
- No releer un archivo que ya editaste en esta sesión.
- Los headers de cada `lib/*.ts` son la mejor documentación que hay. Leer el header
  antes que el cuerpo.

Sobre verificar:

- Fixtures de prueba en `app/vt/page.tsx`. **Se borran antes de commitear.**
- Capturas solo si el cambio es visual. Y cuando saques una, **medí en el DOM** —
  `getBoundingClientRect`, `getComputedStyle`— en vez de creerle a la imagen: el hot
  reload devuelve frames viejos y ya hizo "arreglar" dos veces algo que funcionaba.
- Playwright: `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })` e
  interceptar `**://ddragon.leagueoflegends.com/**`, que desde el sandbox no hay red.
- Un solo `npm run build` al final. `npx tsc --noEmit` y `npx eslint` sí, seguido.

Sobre el repo:

- Se desarrolla directo en `main`. Vercel despliega de ahí.
- Commits con mensaje largo en castellano: qué cambió y **por qué**, incluido lo que se
  probó y lo que quedó sin verificar.
- Migraciones de Supabase: van a `supabase/schema.sql` **y** se le pasan al usuario para
  que las corra. Desde acá no hay acceso a la base.

## Comandos

```bash
npm run dev              # localhost:3000
npx tsc --noEmit         # tipos
npx eslint app lib components
npm run build            # el que vale antes de commitear
```

## Mantener esto vivo

| Si cambiás… | Actualizá |
|---|---|
| Una ruta de API o un módulo de `lib/` | `ARQUITECTURA.md` |
| El esquema, la caché, un huso horario o un gráfico | `DECISIONES.md` |
| Algo que se ve o se usa desde afuera | `README.md` |

Un documento que miente es peor que no tenerlo: el `README.md` viejo mandaba a buscar
un `lib/mock-data.ts` que no existe hace meses.

@AGENTS.md
