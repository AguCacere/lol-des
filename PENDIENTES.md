# Pendientes

Lo que quedó a medias y **no se deduce leyendo el código**. Los otros documentos cuentan
cómo está hecho lo que está hecho; este cuenta lo que falta, que es justo lo que se pierde
cuando se cierra una sesión.

Regla para mantenerlo: cuando algo de acá se termina, **se borra de acá** y —si dejó una
decisión— se escribe en `DECISIONES.md`. Una lista de pendientes con cosas ya hechas deja
de leerse a la segunda vez.

Lo que es de la liga **que viene** —dos semanas, bot nuevo, los "te cojo", el rebranding—
no está acá: vive en **`PROXIMO-TORNEO.md`**. Esto es lo que le falta a la de hoy.

Última revisión: 27 de septiembre de 2026.

## MIGRACIÓN SIN CORRER: la tabla `objetivos`

**Hay que correrla una vez desde el editor SQL de Supabase.** Está en
`supabase/schema.sql`, al final. Sin ella la pestaña Mejora funciona entera —
diagnóstico, patrones, progreso y cruces son todos cálculo sobre `matches`— pero no
se puede GUARDAR un foco: la ruta detecta que la tabla no existe y lo dice en
pantalla en vez de tirar 500.

## El plan de evolución: fase 7

`GRIETA_CENTRAL_PLAN_EVOLUCION.md` tiene siete fases. **Están las siete** (sistema
visual y navegación · Inicio · Ranking · Liga · Estadísticas · Mejora · Cara a cara,
Clash y Equipo). Lo único que falta del plan:

- **De la fase 6 quedó afuera, a propósito, la capa de IA (8.9).** El plan la pone
  explícitamente después del motor determinístico y dice que la pestaña tiene que
  ser útil sin ella. El motor ya calcula todo lo que un modelo necesitaría recibir
  (`lib/mejora.ts`); cuando se haga, recibe ESOS números y no los reemplaza.

De la fase 7 quedó una cosa **medida y sin resolver, que no es de código**: el grupo
no juega Clash desde el 26 de enero de 2026. La pestaña ahora dice hace cuánto fue,
así que ya no miente, pero son 38 partidas de hace ocho meses. Si no se vuelve a
jugar, en algún momento la pregunta va a ser si la pestaña sigue valiendo una de las
siete — no hay nada que arreglar ahí, hay que jugar un Clash.

Lo único que quedó abierto de la fase 5, y es de una línea:

- **Borrar `championLeaderboard` de `/api/ladder`.** Ya no lo dibuja nadie —lo
  reemplazó el bloque de Especialistas, que respeta el filtro de período— pero se
  sigue mandando por la ventana de caché del CDN, igual que `roleDistribution`. Se
  puede sacar en cualquier deploy posterior al que lo dejó de usar, junto con
  `computeChampionLeaderboard()` y el tipo `ChampionLeaderboardEntry`.

## El rearmado de Ranking y Perfil: terminado

Las cinco fases del pedido (ladder compacto + navegación · Resumen · Mejorar ·
Campeones · responsive) **están hechas**. El porqué de cada una está en
`DECISIONES.md`; el mapa de qué componente quedó en qué pestaña, en `ARQUITECTURA.md`.
Lo único que quedó afuera a propósito es la pestaña **Historial**, y está explicado
allá: `Player.matches` trae cinco partidas, que son las que ya muestra el Resumen. Para
que exista de verdad hace falta una ruta nueva que traiga el historial completo.

El Resumen se rehizo después, y con él se fue la pestaña **Mejorar**: no era otra
dimensión del perfil sino la interpretación de sus datos, y repetía adentro las
líneas y la forma reciente. El perfil son dos pestañas, Resumen y Campeones. Está
todo en `DECISIONES.md` → "El perfil tenía tres pestañas y una era la conclusión de
otra", con la medición del gráfico nuevo y de la atribución de LP partida por
partida. El pie desparejo que antes figuraba acá dejó de existir: las dos columnas
quedaron parejas.

Dos cosas de las fases hechas que quedaron **decididas y anotadas, no pendientes**:
que no hay rutas por sección (son pestañas) y que Inicio no repite el estado de la
barra de arriba. Las dos están en `DECISIONES.md` con el porqué; no son deuda.

Lo único que se pierde por no tener rutas y conviene saber: **no se puede compartir un
enlace a una sección**. Si alguna vez se pide, la forma barata es el hash (`#liga`),
no el App Router.

## SQL sin correr

Las migraciones de esta base se corren **a mano** desde el SQL Editor de Supabase. Desde
la sesión hay acceso de LECTURA por MCP —sirve para auditar y para verificar que algo se
corrió— pero las migraciones las sigue corriendo el dueño, que es como se trabajó hasta
ahora (ver `PROXIMO-TORNEO.md` → "Mejoras en la base").

**Todo lo que falta correr, en un solo bloque y EN ESTE ORDEN.** Va junto a propósito:
estuvo partido en dos y el `insert` se corrió sin la tabla creada, que da
`42P01: relation "liga_torneos" does not exist`.

```sql
-- 1. La tabla de torneos (lib/torneo.ts). Sin ella no se rompe nada: la liga
--    sigue usando el lunes a domingo deducido. Lo que no se puede es cambiar fechas.
create table if not exists liga_torneos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text,
  arranca_at    timestamptz not null,
  cierra_at     timestamptz not null,
  minimo_total  int not null default 10,
  minimo_ultimo int not null default 3,
  ultimo_desde  timestamptz,
  premio        text,
  creado_at     timestamptz not null default now(),
  constraint liga_torneos_ventana_valida check (cierra_at > arranca_at)
);
create index if not exists liga_torneos_ventana_idx on liga_torneos (arranca_at, cierra_at);
alter table liga_torneos enable row level security;

-- 2. La columna del bot. Sin ella los comandos andan igual, resolviendo por
--    nombre; lo único que falta es que `/ultima` sin argumentos diga "la tuya".
alter table summoners add column if not exists discord_id text;
create unique index if not exists summoners_discord_id_idx
  on summoners (discord_id) where discord_id is not null;

-- 3. El torneo en curso, extendido al lunes: 14/9 al 21/9, ocho días.
insert into liga_torneos (nombre, arranca_at, cierra_at, minimo_total, minimo_ultimo, ultimo_desde)
values (
  'Semana del 14 (extendida)',
  '2026-09-14T03:00:00Z',   -- lunes 14, 00:00 argentina
  '2026-09-22T03:00:00Z',   -- martes 22, 00:00 argentina → el último día es el lunes 21
  10, 3,
  '2026-09-21T03:00:00Z'    -- el mínimo de 3 cuenta el LUNES. Hay que avisarlo en el Discord.
);
```

**Si preferís que el último día siga siendo el domingo** y el lunes sea solo tiempo extra
—nadie pierde lo que venía planeando—, se cambia con esto, o desde el panel:

```sql
update liga_torneos set ultimo_desde = '2026-09-20T03:00:00Z'
where nombre = 'Semana del 14 (extendida)';
```

Las opciones NO van comentadas adentro del `values`: elegir una línea de ahí es fácil de
hacer mal y el error que da no dice qué pasó.

Después de esto, las fechas se editan desde el panel de la liga (atrás de la contraseña,
arriba del selector de jugadores) y para vincular a cada uno con Discord:

```sql
update summoners set discord_id = '123456789012345678' where game_name = 'VORE';
```

**Verificado el 17/9 contra la base, ya corrido y sin nada que hacer**: `liga_ajustes`
existe, la penalización de IGNAPP está cargada, y `heal_teammates` y `shield_teammates`
están las dos en `matches`.

**Pero ojo con la penalización de IGNAPP**: la fila está, y no hace nada. Él tiene
`participa_liga = false`, así que no está en la tabla de esta semana y el −2 no se lo
resta nadie. O se lo anota a la liga y ahí sí le pega, o la fila es decorativa y conviene
borrarla para que no aparezca el lunes que viene sin que nadie se acuerde de por qué:

```sql
delete from liga_ajustes where semana = '2026-09-14'::date;
```

## La reparación de partidas, a medias

`POST /api/repair` vuelve a pedirle cada partida a Riot y reescribe la fila entera con
`buildMatchRow`. Es como se rellenan las columnas que se agregaron **después** de haber
guardado esa partida.

Quedaron **606 filas** con `repaired_at` en null (contadas el 17/9 contra la base). Se
repararon solo las ~20 más nuevas, que eran las que hacían falta para el AFK de esta semana. Las viejas no molestan
—`ally_afk` en false significa "cuenta como antes"— así que esto es limpieza, no urgencia.

Va por tandas de 15 (~40 segundos cada una) desde la consola del navegador en
`lol-des.vercel.app`, con la sesión abierta:

```js
for (let i = 0; i < 8; i++) {
  const res = await fetch('/api/repair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"batchSize":15}',
  });
  if (!res.ok) { console.error('cortó:', res.status, await res.text()); break; }
  const r = await res.json();
  console.log(`tanda ${i + 1}`, r);
  if (!r.remaining) break;
}
```

Si tira 504, bajar el `batchSize` a 8. Lo ya reparado queda guardado: cada fila se escribe
apenas se repara, no al final de la tanda.

## Toni Zitnic

Quedó un arreglo de datos a mitad de camino sobre una partida suya. **El diagnóstico se
perdió**: se había pedido un `select` para confirmar el `match_id` real antes de hacer el
`UPDATE`, y esa salida nunca llegó. No hay que adivinar el UPDATE — hay que volver a
mirar qué está mal en su historial y recién ahí decidir.

## Anular una partida a mano

**Propuesto y no aprobado.** Es lo único que taparía el agujero que quedó abierto: el que
se queda jugando pero trollea. Ese gana experiencia como cualquiera, así que
`aliadoAfk` no lo puede distinguir del que juega mal — y al que juega mal la liga tiene
que cobrarle. Ver `DECISIONES.md` → "Lo que NO agarra".

La forma pensada: un control chico en el desglose de la liga, atrás de la contraseña del
grupo, que marque una derrota como que no cuenta. Con **motivo obligatorio y a la vista**,
y solo sobre derrotas —una victoria no hay nada que perdonarle—. Queda a la vista de todos
en el desglose, que en un grupo de seis es control suficiente.

Ahora que existe `liga_ajustes` hay una alternativa más barata que vale considerar: en vez
de anular la partida, **un ajuste de +0,75 con el motivo escrito**. No necesita columna
nueva ni tocar el cálculo, y deja el mismo rastro. Es menos prolijo —la partida sigue
restando y el ajuste se la devuelve— pero es una tarde menos de trabajo.

## Dos reglas nuevas de la liga, acordadas y sin implementar

Las dos **arrancan un lunes**, nunca a mitad de semana: aplicarlas sobre una tabla que la
gente viene mirando hace tres días reescribe puestos ya vividos, y eso quema más confianza
de la que arregla el cambio.

Son problemas **distintos** y conviene no confundirlos. Medido el miércoles 16/9, con la
tabla real:

| | V–D | Partidas | Winrate | Puntos |
|---|---|---|---|---|
| VORE | 17–10 | 27 | 63% | +11 |
| marlboro de diez | 13–8 | 21 | 62% | +9 |

Mismo winrate, dos puntos de diferencia: **la brecha es de partidas jugadas, no de nivel**.
Y VORE venía jugando en duo con un amigo diamante en una smurf — que es un problema de
legitimidad, pero **no es el que abre la tabla**: con el smurf al lado gana la misma
proporción que el otro jugando solo. Arreglar el duo esperando que se cierre la brecha no
va a funcionar.

### 1. Tope de partidas que puntúan por día

**Las primeras cinco de cada día cuentan para la liga.** De la sexta en adelante se sigue
jugando, se sigue sumando LP y queda todo en el historial, pero no mueve el puntaje.

El día pasa a valer entre −3,75 y +5 **para todos por igual**, así que el que tiene la
tarde libre no se puede despegar del que labura. No toca el valor de la victoria, ni el de
la derrota, ni el bono de racha: todo lo que ya saben de memoria sigue igual.

Son las PRIMERAS cinco y no las cinco mejores. Con "las mejores" jugar de más sigue
conviniendo —solo podés mejorar el conjunto—, que es justo lo que hay que cortar. Efecto
lateral bienvenido: si arrancás el día perdiendo tres, las que siguen ya no te hunden más.

**El tope es solo para PUNTUAR.** Los mínimos (10 en la semana, 3 el último día) tienen
que seguir contando **todas** las jugadas: el mínimo es por presentarse, el tope es por
puntaje. Si el tope también contara para el mínimo, obligaría a jugar más para llegar —
exactamente lo contrario de lo que busca.

Junto con esto va un **piso de puntaje, tipo −3**. El miércoles había alguien en −6,5, y
ese es el que abandona. Es el argumento del propio dueño de la liga: *"dejo de participar
si arranco en negativo"*. Con piso, una mala racha te deja atrás pero no te expulsa.

### 2. En duo, solo con los del tablero

**Una victoria jugada en duo con alguien que no está en la liga no puntúa.** La partida no
se prohíbe: cuenta para tu LP y para el ladder, pero no para los puntos.

**Solo las victorias, no las derrotas.** Anular la partida entera deja un agujero: el que
viene perdiendo invita al amigo de afuera y sus derrotas dejan de restar, un colchón
gratis e invisible hasta que alguien revise el desglose. Anulando solo las victorias no hay
agujero y la regla se lee sola: *no te llevás el crédito de una victoria que no ganaste
solo.*

**Descartada: "el podio no puede jugar en duo"** (la primera idea). El podio cambia todos
los días, así que es una regla que no podés saber si estás cumpliendo **en el momento de
encolar** — ¿vale si entrabas cuarto y terminaste tercero?— y esas se discuten siempre.
Además castiga ir primero, que es la misma rubber-banding que darle menos puntos al
puntero: se nota y cae mal. La del tablero es fija, igual para todos, conocida antes de
encolar, y apunta al smurf y no al que va ganando. Encima empuja a que se junten entre
ellos, que es para lo que existe la liga.

**En pantalla no hay nada que inventar**: es la misma maquinaria del "no contó" que ya usa
la derrota con un aliado ido. Aparece en el desglose, apagada, con el motivo al lado.

**Arrancar por honor, no por código.** La base **no guarda con quién jugaste**: de cada
partida se guarda una fila por jugador nuestro, con el rival de tu línea, y los puuids de
los otros nueve ni se leen. Y aunque se guardaran, **Riot no dice quién era premade** —no
hay dato de party en soloq—, así que el duo solo se puede *inferir* por repetición ("este
puuid de afuera apareció cinco veces en tu equipo esta semana"). Eso implica que las
primeras dos partidas con el smurf igual contarían, o anularlas retroactivamente, que
mueve la tabla para atrás.

Entonces: la regla escrita y el desglose a la vista, que en un grupo de seis es control
suficiente. La detección automática —columna con los puuids de los compañeros, `/api/repair`
para lo viejo, y un umbral de repeticiones— recién si aparece que alguien la esquiva, con
datos de que hacía falta y no por las dudas.

## El duo con gente de afuera: hecho, falta confirmar y anunciar

El mecanismo está entero y desplegado (`liga_vetados` + `matches.aliados`). Ver
DECISIONES para por qué es una tabla y no un `liga_ajustes`. Lo que queda es humano:

**Confirmar el puuid.** La lista tiene UNA cuenta, identificada por repetición y no por
nombre: desde el entorno de desarrollo no hay key de Riot, así que no se pudo resolver
puuid → Riot ID. Se la dedujo de aparecer cuatro veces del mismo lado, las cuatro
ganadas, en partidas del 16/09 (Sylas, Pantheon) y del 18/09 (Caitlyn y una más).
El dueño de la liga tiene que chequearlas contra el historial. Si alguna no es, el
arreglo es un `delete` de una línea.

**Lo que esto mueve:** VORE pasa de +12,25 a +8,25 y de 1º a 2º; marlboro de diez
queda ganando con +10. No es un detalle de tabla, cambia quién cobra.

**`laburo de esto#CHESS` NO está vetada y es a propósito.** Apareció en los datos (8
partidas, 4V-4D, valía −1,25) y el dueño decidió expresamente perdonarla. Si alguien la
agrega después, que sea por una decisión nueva y no por creer que se olvidó.

**Falta el anuncio, y tiene una contradicción sin resolver.** El borrador del mensaje
decía "arranca desde el torneo que viene", pero el veto ya corrige el torneo en curso.
Hay que elegir una de las dos ANTES de mandarlo: o el mensaje dice que este torneo se
corrige, o el veto se aplica desde el siguiente. Anunciar lo primero y hacer lo segundo
es la única versión de esto que termina mal.

**Resolver un puuid a Riot ID no tiene ruta.** `getAccountByPuuid` existe en lib/riot.ts
y no la expone nadie. Un endpoint chico de admin evitaría el problema de arriba la
próxima vez, que la va a haber: quedan dos puuids sin identificar con 2 partidas cada
uno, y el veto es una lista que va a crecer.

## El bot de Discord

**Está prendido y andando** (17/9). Los cuatro comandos contestan en el canal, y los
anuncios automáticos —ascensos, descensos, rachas, cargadas, el parte diario y el
cierre— salen firmados por el bot, con las reacciones que puede dejar puestas solo.
Verificado con `POST /api/discord/probar`, que da `camino: "bot"` y los cinco pasos en
verde.

Lo único que queda es **la migración de `discord_id`** (arriba, en "SQL sin correr"). Sin
ella todo funciona: los comandos resuelven al jugador por nombre con autocompletado. Lo
único que falta es que `/ultima` sin argumentos conteste "la tuya".

Si algo deja de salir, el orden para mirarlo es siempre el mismo:
`POST /api/discord/probar` sin body dice quién es el bot y qué canal ve sin escribirle a
nadie; con `{mandar:true}` prueba el camino entero y limpia atrás suyo.

### La v2, que es la que el torneo necesita

Los "te cojo" **son escrituras desde Discord**, así que necesitan una v2 y esa
dependencia es real, no un detalle (ver `PROXIMO-TORNEO.md`). Lo que hay que agregar:

- **La lista de `discord_id` permitidos.** Una firma válida prueba que el pedido vino de
  Discord, no que lo haya tipeado alguien de la casa: en un canal cualquiera del server
  puede escribir. La columna `discord_id` pasa a ser esa lista.
- **Frescura a pedido**: que el comando refresque al jugador por el que preguntaron si
  su dato está viejo, en vez de subir la frecuencia del cron. Eso sí toca a Riot, pero
  la respuesta ya es diferida, así que la regla de los 3 segundos dejó de ser el
  problema que parecía.

### Lo del cron, que sigue igual

Los **dos slots de Vercel Hobby están ocupados** (`vercel.json`): el refresco de
contención a las 12 UTC y el parte diario a las 23:55 argentinas. No queda lugar. Si el
bot necesita algo programado propio, va al scheduler externo (cron-job.org), que ya está.

Los comandos no necesitan cron —son pull, no push—, y los dos remedios baratos para la
frescura ya están puestos: leen **Supabase directo** (se saltean los 4 minutos de caché
del CDN) y llevan **el "actualizado hace X"** al pie.

### Bajar el refresco a 5 minutos: medido (18/09/2026)

Esto estaba como "no bajar los 15 minutos, es algo para medir". Se midió.

**Cuánto se gana.** El retraso real de una partida —de que termina a que está en la
base, que es exactamente cuándo sale el mensaje del bot— sobre 662 partidas de tres
semanas: mediana **9,0 min**, p90 15,2, p99 46,9. Con el cron cada 15 y las partidas
cayendo en cualquier momento, la espera promedio son 7,5 minutos, o sea que casi todo
ese retraso ES el cron; Riot publica en 1-2. A 5 minutos la espera promedio baja a 2,5:
la mediana quedaría cerca de **4 minutos**. Se corta a la mitad, y el que lo nota es el
bot.

La cola (17 partidas de 662 por encima de 20 min) no es el cron: viene en racimos —4 en
una hora el 12/09, 3 el 05/09— que son corridas perdidas o paredes de 429. Bajar la
frecuencia las ablanda (una corrida perdida cuesta 5 min y no 15) pero no las arregla.

**Riot no es el problema, y el que gasta no es el cron.** Un ciclo ocioso son 5 llamadas
por invocador (liga, ids de ranked, ids de flex, ids de clash, maestrías) × 14 = 70 por
corrida, concurrencia 2. A 5 minutos son 14 por minuto. **`/api/live` gasta más que
eso**: no tiene caché de CDN, es `force-dynamic` y dispara 14 llamadas a Spectator en
paralelo por cada poll, cada 60s, **por pestaña abierta**. Tres pestañas ya son 42 por
minuto. Si alguna vez hay que recortar llamadas a Riot, el lugar es ese —una caché corta
en `/api/live`— y no el cron.

**Lo que sí muerde es el Active CPU de Vercel.** Hobby incluye 4 horas de Active CPU por
mes (y 360 GB-hr de memoria, que sobra). La corrida tarda ~30s de reloj pero casi todo
es esperar a Riot, que con Fluid compute no cuenta; contando ~2s de CPU real por corrida
da ~1,6 h/mes a 15 minutos y **~4,8 h/mes a 5**, o sea justo por encima del tope. Y el
castigo de pasarse en Hobby no es una factura: **es la cuenta pausada**.

Ese número es una estimación —desde acá no se ve el consumo real—, así que **antes de
tocar el scheduler hay que mirar Vercel → Usage → Active CPU**. Si el mes va por menos
de 1,5 h, 5 minutos entra.

**El punto medio que probablemente convenga:** 5 minutos solo de noche (19:00 a 03:00
argentinas, que es cuando juegan) y 15 el resto. cron-job.org sabe hacerlo con dos
horarios. Son ~160 corridas por día en vez de 288, ~2,7 h de CPU al mes, y la mejora cae
justo en las horas en las que alguien la nota.

**La caché del CDN no acompaña y no hay que forzarla.** `/api/liga` y `/api/ladder` están
en `s-maxage=240`, así que la pantalla va a seguir hasta 4 minutos atrás de la base pase
lo que pase con el cron — parte del "17 minutos" es esto y no el refresco. Bajar esa
caché es justo lo que no hay que hacer: es lo que protege el pool de 15 conexiones de la
Nano (ver DECISIONES). Con el cron en 5, igual, los 240s ya son más finos que el ciclo.

## Suelto, ofrecido y no tomado

**Reusar `LigaDiaADia` adentro del modal de `LigaTorneo`** para ver el día por día de las
semanas ya cerradas. No cuesta consultas nuevas: el `resumen` guardado de cada semana ya
tiene el acumulado por día de cada uno.
