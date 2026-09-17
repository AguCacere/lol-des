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
cambia con el enlace que está al lado del título.

**Estadísticas** — mejores winrates del grupo, ranking de campeones y sinergia de duos.

**Cara a cara** — dos jugadores del grupo comparados de frente, sin pedirle nada más al
servidor.

**Clash** — las partidas de Clash agrupadas por torneo, con su conclusión por día.

**Equipo** — el resumen semanal del grupo.

Además, sin pantalla propia:

**El bot de Discord** — anuncia ascensos y rachas, y **carga a quien juega mal**: KDA
desastroso, ahogarse en la fuente, perder contra un Nasus, cruzarse un Teemo. Se
dispara solo con el refresco.

Y al revés: cuando alguien **se lleva la partida al hombro**, también lo dice. Eso no
se mide igual en cada línea —un support hace el 11% del daño del equipo y un mid el
22%—, así que la vara es por rol, sacada de las partidas reales del grupo. El sup tiene
tres formas de calificar: curación y escudos (el enchanter), asistencias (el de
enganche) y daño aguantado con el cuerpo (el tanque). Si jugó así y encima perdió, sale
con otro texto: lo dejaron solo. Salta en ~2,5% de las partidas, la mitad de seguido que
la cargada — si saliera todos los días dejaría de significar algo.

Y **contesta comandos**. Cuatro, todos de lectura y todos servidos de Supabase:

| Comando | Qué contesta |
|---|---|
| `/liga` | La tabla de la semana, con el récord de cada uno |
| `/ranking` | El ladder, de mejor a peor |
| `/cargar jugador:<alguien>` | Su peor partida reciente, con la cargada puesta |
| `/ultima [jugador:<alguien>]` | Su última de soloq con KDA y **lo que valió en la liga**. Sin nombre, la tuya |

El campo `jugador` autocompleta con la gente del grupo, así que no hay forma de escribir
mal un nombre. Cada respuesta lleva al pie cuándo se actualizaron los datos — en un canal
el mensaje queda ahí para siempre y conviene saber de cuándo es.

No hace falta ningún proceso corriendo: Discord le pega a
`/api/discord/interactions` cuando alguien tipea, y eso es un route handler más. **Nada
de esto escribe**: anotarse a la liga o refrescar sigue siendo cosa de la app, con la
contraseña del grupo.

Todas las noches a las 23:55 manda el **parte diario de la liga**: cómo va la tabla y
cuánto movió cada uno ESE día, con medallas para el podio y 💩 para el resto. No lo
manda los domingos —ese día sale el cierre y los dos se pisarían— ni los días en que no
jugó nadie. Se puede mirar antes con `POST /api/liga/diario` (y `{"ahora":"…"}` para ver
el de otro día).

Los domingos a la noche, cuando cierra la semana, manda el **podio de la liga**: una
cargada por puesto —el primero se los garchó a todos, el segundo no le dio el
pitulín, el tercero ni pinchó ni cortó, los del medio son agua y el último nadó en
caca—. Se puede mirar antes de que salga sin mandar nada, con
`POST /api/liga/anunciar` y `{"tipo":"cierre"}`.

Y abajo del podio, **un título por persona**: el fierro (más partidas), el carnicero (más
asesinatos), el quirúrgico (mejor KDA), el generoso (más asistencias), el kamikaze (más
muertes), el turista (el que menos jugó), no faltó (más días), la racha, la maratón, el
fiel y la remontada. Cada uno se lleva **uno solo** —el que más lo destaca— así que el que
gana la liga no se lleva además todos los demás. Ninguno resta puntos: son todas cosas que
se ganan.

**La liga semanal** — una competencia interna por **puntos**, de lunes a domingo hora
argentina, aparte del ladder. El ladder mide dónde llegaste; la liga mide cuánto te
moviste esta semana.

Una victoria suma **1** y una derrota resta **0,75**; desde la **cuarta ganada al
hilo** cada victoria vale **1,25**. El castigo por perder es el que decide a partir de
qué winrate conviene jugar más: con −1 el equilibrio queda en 50% y jugar de más no
suma; con −0,5 baja a 33% y gana el que tiene más tiempo libre. Con −0,75 queda en
43%. El LP no puntúa: una victoria vale lo mismo en cualquier cuenta. Es opt-in: cada
uno cuenta desde que se lo anota, no desde el lunes.

**Los remakes no cuentan**, ni para los puntos ni para las 10 partidas del mínimo. Riot
tampoco los cuenta —no dan ni quitan LP— aunque en su API vengan con el resultado puesto.
Toda partida de menos de cinco minutos queda afuera en toda la app, así que el récord del
ladder y el de la liga dicen lo mismo. Y se puede comprobar: abriendo una fila de la
liga, cada partida muestra cuánto duró.

**Y una derrota con un aliado ido tampoco resta.** Si se te fue uno, Riot te cobra menos
LP o ninguno, así que la liga no te cobra puntos: no resta, no corta la racha y no cuenta
para las 10 del mínimo. A diferencia del remake **no desaparece**: en el desglose queda a
la vista, apagada y diciendo "no contó", porque esa partida sí se jugó y una derrota que
no está en ningún lado parece un bug. La victoria con uno menos sí cuenta, y vale lo mismo
que cualquier otra. Esto vale **solo en la liga**: en el ladder la derrota sigue estando,
porque en tu cuenta también.

Se decide al guardar la partida y mira la **experiencia**, no si se desconectó: el que se
queda parado en la base figura conectado toda la partida, pero deja de ganar experiencia
en el momento en que se planta. Cinco minutos seguidos sin ganar nada y esa partida no
cuenta. Al que se desconecta de verdad lo agarra igual. Al que se queda jugando pero
trollea, no: ese es indistinguible del que juega mal, y el que juega mal tiene que pagar.

**Los ajustes a mano.** Lo único que puede mover un puntaje sin ser una partida: una
penalización o un premio que acuerda el grupo, por semana y por persona (tabla
`liga_ajustes`). Aparece al lado del nombre con el motivo escrito —"−2 · cambió de
cuenta"— y nunca escondido: un número que se movió por fuera de la Grieta tiene que decir
por qué. No toca el récord de victorias y derrotas ni los mínimos, solo el puntaje. La
semana siguiente arranca limpia sola.

Para llevarse el premio no alcanza con ir primero: hay que jugar **10 partidas en la
semana** y **3 el último día**. Es contra el que agarra ventaja el martes y no juega
más para no arriesgarla. Si el puntero no llega a los mínimos, cobra el primero que
sí; si no llega nadie, la semana cierra sin premio.

En pantalla la liga son cuatro bloques, de arriba abajo: el **panel de estado**
(cuánto falta para que cierre, los siete días de la semana y en cuál estamos, y si el
que va primero cobra o qué le falta), **la carrera** —los puntos de todos día por día
en un solo gráfico, un color por persona, clic en un nombre para seguirlo; desde su
pie se abre **el día por día**, la grilla con los números que el gráfico no puede
mostrar y en qué puesto cerró cada uno cada día—, **la
tabla** y, al pie, **la vitrina de campeones**: el vigente con su foto y con cuánta
gente compitió, y las semanas anteriores abajo.

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
| `RIOT_API_KEY` | developer.riotgames.com → tu app. **Es una key de aplicación aprobada, no una de desarrollo: NO vence cada 24 horas.** Si todos los invocadores fallan a la vez, no es la key — buscá en otro lado |
| `RIOT_PLATFORM` | `la2` (LAS) |
| `RIOT_REGION` | `americas` — routing region de Account-V1 y Match-V5 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ídem — **nunca** al navegador |
| `APP_PASSWORD` | La contraseña compartida. **Sin esto, todas las rutas que escriben responden 503**: falla cerrado a propósito |
| `CRON_SECRET` | Autentica al scheduler externo que refresca cada 15 min, y a los crons de Vercel. Va como `Authorization: Bearer …` |
| `ANTHROPIC_API_KEY` | Para el análisis del pool. Sin esto ese panel no genera nada; el resto anda |
| `DISCORD_WEBHOOK_URL` | Opcional. Sin esto no se manda ninguna notificación y nada se rompe |
| `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` | Opcionales. Con las dos, los anuncios salen **como el bot** en vez de por el webhook, y el 👍 de la votación queda puesto solo. Sin ellas, todo cae al webhook igual que antes |
| `DISCORD_PUBLIC_KEY` | La cerradura del bot. **Sin esto no entra ningún comando** — falla cerrado, igual que `APP_PASSWORD` |
| `DISCORD_APP_ID` + `DISCORD_GUILD_ID` | Para registrar el menú de comandos, sea con `scripts/registrar-comandos.mjs` o con `POST /api/discord/registrar`. Como la segunda corre en el servidor, **van en Vercel también** |

Si la Riot API Key se filtra, se regenera con "Nueva clave API" en el portal — no hace
falta pedir una app nueva.

## Crons

**`/api/cron/refresh` corre cada 15 minutos**, disparado por un scheduler externo
(tipo cron-job.org) que pega con `Authorization: Bearer $CRON_SECRET`. Recorre a
todos, trae partidas nuevas, guarda snapshots de LP, dispara las notificaciones de
Discord y de paso cierra la semana de la liga si terminó.

No sale de `vercel.json`: el plan Hobby de Vercel **solo permite un cron por día**,
que para una liga semanal por LP es demasiado poco. La entrada de `/api/cron/refresh`
a las 12:00 UTC que hay en `vercel.json` queda como red de contención por si el
scheduler externo se cae.

La ruta contesta al toque y hace el trabajo en segundo plano con `after()`: los
schedulers gratuitos cortan la espera a los 30 segundos, bastante menos de lo que
puede tardar un refresco completo.

**`/api/liga/diario` corre una vez por día, a las 23:55 argentinas** (`55 2 * * *` UTC),
y este **sí sale de `vercel.json`**: es lo único que necesita un disparador diario y
diario es justo lo que el plan Hobby sabe hacer. Vercel le manda el `CRON_SECRET` solo,
sin configurar nada afuera. En Hobby el disparo es "dentro de esa hora", o sea entre las
23:00 y las 23:59 argentinas — siempre el mismo día argentino, que es lo único que
importa acá.

Le sacó el lugar a `/api/cron/liga` (Hobby permite dos crons). No se pierde nada: el
cierre de la semana ya lo hace el cron de refresco cada 15 minutos, y leer `/api/liga`
también. El parte diario, en cambio, no tiene otro camino. La ruta `/api/cron/liga`
sigue existiendo para pegarle a mano.

Es seguro dispararlo de más: decide solo si hay algo para decir, y los días que no
—domingos y días sin partidas— contesta `{"mandado":false}` sin escribir en Discord.

**No hay botón de "Actualizar" en la app**: el cron de 15 minutos es lo único que
mantiene el ladder al día. `POST /api/refresh` existe para dispararlo a mano desde la
consola o con `curl` (pide sesión, y tiene un cooldown de dos minutos por invocador),
pero ninguna pantalla lo llama.

**Una partida tarda en aparecer, y es normal.** Riot demora en publicarla, el cron corre
cada 15 minutos y el CDN guarda la respuesta hasta 4 más — con el `stale-while-revalidate`,
la primera visita después de que vence esa ventana todavía recibe la copia vieja. Entre
la partida y la pantalla puede haber veinte minutos sin que nada esté roto. Por eso el
ladder y la liga muestran cada uno **su propio "actualizado hace X"**: son dos respuestas
con dos cachés distintas y pueden tener edades distintas. Si algo parece trabado, el log
de `/api/cron/refresh` (línea `cron refresh done:`) dice cómo le fue a cada invocador.

## Estructura

```
app/
  page.tsx          # la única página: 5 pestañas, todo entra por fetch a /api/*
  api/              # 21 route handlers (ver ARQUITECTURA.md)
components/         # ~40 componentes, agrupados por pestaña en ARQUITECTURA.md
lib/                # Riot, cálculo puro, presentación e infraestructura
scripts/
  registrar-comandos.mjs  # le registra a Discord el menú de comandos (a mano)
supabase/
  schema.sql        # summoners, matches, lp_snapshots, champion_mastery,
                    # coach_reports, liga_semanas, liga_ajustes + la view ladder
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

# Le registra a Discord el menú de comandos. Solo cuando cambia la lista.
node --env-file=.env.local scripts/registrar-comandos.mjs
```

Sin una consola con Node a mano, ese último paso sale igual desde la consola del
navegador en `lol-des.vercel.app`, con la sesión abierta:

```js
await (await fetch('/api/discord/registrar', { method: 'POST' })).json()
```

Y para saber si los anuncios están saliendo por el bot o cayendo al webhook —que no
se puede saber mirando, porque cuando falla el mensaje sale igual:

```js
await (await fetch('/api/discord/probar', { method: 'POST' })).json()
```

## Notas

Uso personal y no comercial, para el grupo. No está pensado para escalar más allá de
eso: seis o siete invocadores, una key personal de Riot (20 req/1s, 100 req/2min) y el
plan Hobby de Vercel.
