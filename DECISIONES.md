# Decisiones y trampas ya pisadas

Cada una es algo que ya salió mal una vez. Están acá para no volver a pisarlas y,
sobre todo, para no volver a *derivarlas* leyendo código.

## Datos

**`matches` tiene PK compuesta `(match_id, puuid)`.** Dos amigos en la misma partida
necesitan fila propia. Cualquier query que asuma `match_id` único cuenta partidas de
más o de menos según el caso.

**`buildMatchRow` es el único lugar que escribe una fila de partida.** El insert
normal, el backfill y el repair pasan todos por ahí. Columna nueva = `ALTER TABLE` +
el campo en `buildMatchRow` + `MatchRow` en `lib/types.ts` + la columna en el `select`
del ladder + `repaired_at = null` para que el repair rellene lo viejo. Si falta el
último paso, la columna queda en `null` para siempre en todo lo ya guardado.

**`lp_snapshots` solo inserta si algo cambió.** Un snapshot por refresco aunque no se
haya jugado aplana el gráfico: veinte puntos idénticos y después un salto. La
comparación con la fila anterior es a propósito.

**Contadores acumulados ≠ diferencias de ventana.** `lp_snapshots.wins/losses` son
acumulados de la season. Restar dos puntas solo funciona si **las dos** son válidas;
con la punta base en 0 sale la season entera — así apareció un "222V-225D en una
semana" en la liga. Las victorias y derrotas de un período se cuentan de `matches`,
no restando acumulados.

**La vista `ladder`: columnas nuevas al final.** Postgres tira 42P16 si se intenta
`CREATE OR REPLACE VIEW` cambiando el orden o el tipo de las columnas existentes.

**De flex no se guarda nada, nunca.** Se consulta en vivo para la cargada de Discord
y se descarta. Es un pedido explícito del dueño del proyecto, no una decisión técnica.

**`startTime` de Match-V5 filtra por el ARRANQUE de la partida**, no por el final.
Para una ventana de tiempo hay que pedir con margen hacia atrás y después filtrar por
el fin real (`played_at + game_duration_s`), o se pierden las partidas largas que
empezaron antes del corte.

## Riot

**Spectator-V5 no dice en qué línea juega nadie.** `teamPosition` llega recién con
Match-V5, cuando la partida terminó. Para la partida en vivo se estima en
`lib/live-roles.ts`.

**Asignación, no argmax.** Elegir para cada jugador su mejor línea por separado da
tres "mid" y ningún top. Se prueban las **120 permutaciones** de cinco líneas y se
maximiza el total: es exacto y no cuesta nada.

**El historial propio manda.** Si el que está jugando ese campeón ahora es del grupo,
su propio historial con ese campeón pesa 6 contra 1 del ladder general. Sin eso, la
estimación fallaba con los campeones que el grupo juega distinto al resto (un
Volibear top, un Veigar support).

**Subir `OBSERVACIONES_CONFIABLES` de 4 a 14 empeora.** Se midió: 92,6% → 84,9% con
muestras chicas. No tocarlo sin volver a medir.

## Caché y deploys

**La ventana de caché del CDN.** `/api/ladder` es `s-maxage=60`, `/api/team-digest`
`s-maxage=300`, `/api/live-detail` `s-maxage=120`. Después de cada deploy hay pestañas
con el bundle **nuevo** recibiendo JSON **viejo**. Todo campo nuevo se lee con guarda
(`?.`, un default) o la pantalla se rompe durante esa ventana. `force-dynamic` no
cambia esto: apaga el caché de datos de Next, no el del CDN.

## Gráficos y SVG

**`preserveAspectRatio="none"` deforma.** El `viewBox` tiene que estar cerca del
tamaño real de render o el dibujo se estira. Y el `<text>` de un SVG escala con la
caja: una etiqueta legible en desktop queda en 4,7px en mobile. **Las etiquetas van en
HTML encima del SVG**, no adentro.

**No fijarle altura a un SVG que se dimensiona solo.** `.lp-svg { height: 118px }`
contra un SVG que rendereaba ~136px hacía que el gráfico se saliera de su caja y el
pie de la tarjeta se le montara encima.

**`lineAreaGeometry` con menos de dos puntos divide por cero** y lee `points[0]` de un
array vacío. Un invocador recién agregado no tiene snapshots, y ese crash se llevaba
puesta la tabla entera. Ya tiene guarda; no sacarla.

## Diseño

**El idioma de las barras es uno solo en toda la app**: el **largo es volumen**, el
**verde/rojo es récord**. Vale en "Sus líneas", "Cómo arrancás", el pool y la liga.
Superponer una barra de winrate sobre una de volumen ya se probó y miente: una línea
de 5 partidas al 60% dibujaba más larga que una de 105 al 56%. Se usan barras V/D
apiladas escaladas por volumen.

**Verde #34C97C y rojo #F0555F están a ΔE 7,1 en visión deutan.** El color **nunca**
va solo: siempre con el número al lado.

**El `<img>` de campeón lleva `champ-icon-img`** y hay **una** regla global
(`width:100%; height:100%; object-fit:cover; display:block`). Antes cada contenedor
tenía que declarar la suya y dos se olvidaron: la imagen de 120px salía a tamaño
natural dentro de una caja de 36px. Contenedor nuevo ≠ regla nueva.

**Filas padre e hijo tienen que compartir grilla.** En "Enfrentamientos" eran dos
layouts flex distintos y las barras y los récords quedaban en x diferentes. Una sola
grilla, y se mide en el DOM a dos anchos.

## Estadística

**El winrate no se redondea, y el color sale de los contadores.** Las dos reglas
viven en `lib/winrate.ts` y no se reimplementan en ningún componente. 302V-307D es
49,59%: guardado como `Math.round` daba 50, se mostraba "50%", y el color salía de
`winrate >= 50 ? "good" : "bad"` sobre ese entero — o sea que un récord negativo se
pintaba de **verde**, al lado del "302V · 307D" que lo desmentía. Se muestra el real
con un decimal, y el tono se decide con `wins > losses`, que son enteros y no
necesitan epsilon. El empate exacto tiene su propio tono: 50V-50D no es ni bueno ni
malo, y con `>= 50` salía verde.

**Todo winrate se calcula desde (wins, games), nunca desde un porcentaje ya
calculado.** Además de ser exacto, esquiva la ventana de caché del CDN: los
contadores son idénticos en el JSON viejo y en el nuevo, el porcentaje no.

**Wilson al 99% (z=2.576) para ordenar winrates.** Al 95% un 3 de 3 le gana a un 7 de
10, que es exactamente lo que el orden tiene que evitar.

**Los promedios de rol salen del `team_position` real**, no de un rol declarado. Un
jugador "support" que jugó 40 partidas de mid no se compara contra supports.

## Seguridad

**Toda ruta que escribe pasa por `exigirSesion`.** Lo único gratis es
`/api/coach` con `{ peek: true }`, que solo mira el caché y **nunca llama al modelo**.
Generar un informe cuesta plata: eso pide sesión.

**Sin `APP_PASSWORD` en el entorno, las rutas que escriben responden 503.** Falla
cerrado a propósito: si la cerradura no está puesta, nadie escribe.

**La cookie de sesión está firmada con HMAC sobre la contraseña misma**, así que
cambiar `APP_PASSWORD` invalida todas las sesiones existentes. Es la forma de echar a
alguien.

**Un 401 en una ruta que recién funcionó no es un bug de código**: es la sesión
perdida. "Borrar datos del sitio" en DevTools se lleva la cookie puesta.

## Tiempo

**Argentina es UTC-3 todo el año** (no hay horario de verano desde 2009). La
conversión vive en un solo lugar: `lib/liga.ts`. No duplicarla.

**"actualizado hace X" es el refresco MÁS RECIENTE, y los atrasados van aparte.**
`last_refreshed_at` se escribe al final de `refreshOne`, así que un invocador que
falla (Riot 429, un puuid que devuelve 404) no la actualiza nunca. Cuando el cartel
mostraba el MÍNIMO del grupo —para no dejarse adular por el más fresco— ese
invocador trabado congelaba el número de toda la app: aparecía un "hace 21 min" con
el cron corriendo cada 15 y trece de catorce al día. Ahora son dos datos: la fecha
del más reciente, y cuántos llevan más de 35 minutos sin refrescarse.

**El refresco NO es el cron de `vercel.json`.** Lo dispara un scheduler externo cada
15 minutos, porque el plan Hobby de Vercel solo permite un cron por día. Mirar
`vercel.json` y sacar de ahí la frecuencia real da una respuesta equivocada: el dato
está en el header de `app/api/cron/refresh/route.ts`. Ya pasó una vez — le dije al
dueño que los datos tardaban hasta el otro día cuando en realidad tardan 15 minutos.

**Por eso la ruta contesta al toque y trabaja en `after()`**: los schedulers gratuitos
cortan la espera a los 30 segundos, bastante menos de lo que puede tardar un refresco
completo. `after()` mantiene viva la función hasta `maxDuration` aunque el que llamó
ya se haya ido.

**El cierre de la liga es idempotente y se dispara desde tres lados**: el cron de
refresco, el cron de liga y la lectura de `/api/liga`. Lo que lo hace seguro es
`liga_semanas`: una semana ya registrada no se vuelve a anunciar.

**La liga cuenta desde que cada uno se anota** (`summoners.liga_desde`), no desde el
lunes. Anotarse el miércoles después de ver que venís sumando no es lo mismo que
anotarse el lunes.

**`LIGA_INICIO` existe porque la liga cerró una semana anterior a su propia
existencia** y anunció un campeón en Discord. Una fecha de arranque no es opcional en
algo que corre solo.

## Convenciones de código

**`react-hooks/set-state-in-effect`**: la convención del repo es el `eslint-disable`
puntual **con motivo escrito**, cuando el `setState` pasa al resolver un fetch.

**Los headers de `lib/*.ts` son la documentación.** Explican el *porqué*, no el *qué*.
Si hace falta entender un módulo, se lee su header — no el archivo entero, y no se
duplica acá.

## Sandbox

Sin red a Riot, a Data Dragon ni a Supabase. Playwright usa
`executablePath: '/opt/pw-browsers/chromium'` (no correr `playwright install`) y hay
que **interceptar Data Dragon** o las imágenes quedan colgadas. Las rutas de Playwright
matchean **la última registrada primero**: un `**/*` registrado después de un mock
específico lo pisa.

**`cd` dentro de un comando compuesto de Bash persiste** entre llamadas y ya hizo
correr `npm run dev` desde el scratchpad. Usar rutas absolutas.

## Método

**Medir en el DOM, no confiar en la captura.** Dos veces en una misma sesión la
captura era un frame viejo del hot reload y me hizo "arreglar" algo que ya
funcionaba. Si el cambio es visual: `getBoundingClientRect` / `getComputedStyle`, no
el ojo sobre el PNG.

**Una hipótesis sin verificar no se implementa.** "Faltan datos en la base" era
plausible y estaba mal; el `SELECT` lo desmintió en diez segundos y el arreglo real
era otro.
