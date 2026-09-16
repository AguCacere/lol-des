# Pendientes

Lo que quedó a medias y **no se deduce leyendo el código**. Los otros documentos cuentan
cómo está hecho lo que está hecho; este cuenta lo que falta, que es justo lo que se pierde
cuando se cierra una sesión.

Regla para mantenerlo: cuando algo de acá se termina, **se borra de acá** y —si dejó una
decisión— se escribe en `DECISIONES.md`. Una lista de pendientes con cosas ya hechas deja
de leerse a la segunda vez.

Última revisión: 16 de septiembre de 2026.

## SQL sin correr

Las migraciones de esta base se corren **a mano** desde el SQL Editor de Supabase: desde
el repo no hay acceso. Todo lo que está en `supabase/schema.sql` tiene que existir en la
base o la consulta que lo use falla.

**La tabla de ajustes de la liga.** Es lo último que se agregó y hay que correrla:

```sql
create table if not exists liga_ajustes (
  semana     date not null,
  puuid      text not null references summoners(puuid) on delete cascade,
  puntos     numeric(5,2) not null,
  motivo     text not null,
  creado_at  timestamptz not null default now(),
  primary key (semana, puuid)
);
alter table liga_ajustes enable row level security;
```

Sin ella `/api/liga` no se rompe —loguea el error y sirve la tabla sin ajustes, que es el
modo de fallar elegido— pero ninguna penalización aparece.

**La penalización de IGNAPP**, pendiente de que cierre la votación en Discord. Son −2
puntos por haber cambiado de cuenta a mitad de semana, **solo esta semana y solo para él**:

```sql
insert into liga_ajustes (semana, puuid, puntos, motivo)
select '2026-09-14'::date, puuid, -2, 'cambió de cuenta'
from summoners where game_name = 'IGNAPP';
```

Si el `game_name` no es exactamente ese no inserta nada, y se nota porque el −2 no
aparece en la tabla. Para sacarlo: `delete from liga_ajustes where semana = '2026-09-14'::date;`

**Y hay que verificar dos columnas viejas** que quedaron colgadas de antes:

```sql
select column_name from information_schema.columns
where table_name = 'matches' and column_name in ('heal_teammates', 'shield_teammates');
```

Si no devuelve las dos:

```sql
alter table matches add column if not exists heal_teammates int;
alter table matches add column if not exists shield_teammates int;
```

## La reparación de partidas, a medias

`POST /api/repair` vuelve a pedirle cada partida a Riot y reescribe la fila entera con
`buildMatchRow`. Es como se rellenan las columnas que se agregaron **después** de haber
guardado esa partida.

Quedaron **unas 610 filas** con `repaired_at` en null. Se repararon solo las ~20 más
nuevas, que eran las que hacían falta para el AFK de esta semana. Las viejas no molestan
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

## El bot de Discord interactivo

La idea aprobada en principio: que el bot deje de ser solo un webhook que anuncia y pase a
contestar comandos.

**Lo importante, porque es lo que suele frenar la idea**: no hace falta un proceso
corriendo. Discord tiene dos modos y el de *HTTP Interactions* encaja con Vercel — le das
una URL, Discord te hace POST cuando alguien tipea, y eso es un route handler común.

Lo que sí hay que resolver:

- **Verificar la firma** Ed25519 de cada request. Node lo hace nativo, sin dependencia
  nueva. Sin esto cualquiera le pega al endpoint.
- **La regla de los 3 segundos**: hay que contestar antes o Discord corta. Para lo que
  sale de Supabase sobra; cualquier cosa que toque a Riot necesita respuesta diferida.
- **Una columna `discord_id` en `summoners`**, para atar cada usuario de Discord a su
  invocador. Sin eso `/cargar @fulano` no sabe a quién carga.

Los cuatro comandos de la v1, todos de lectura y todos servidos de Supabase (cero llamadas
a Riot, así ninguno se acerca a los 3 segundos):

| Comando | De dónde sale |
|---|---|
| `/cargar @alguien` | `lib/roast.ts`, que ya está entero — es solo un gatillo nuevo |
| `/liga` | la tabla de la semana |
| `/ranking` | el ladder |
| `/ultima @alguien` | su última partida con KDA y lo que valió en la liga |

**Nada que escriba en la v1.** Anotarse a la liga, refrescar o anular una partida es la
cerradura de la app expuesta en un canal donde cualquiera del server puede tipear. Si
después se quieren escrituras, van con lista de `discord_id` permitidos, no con la
contraseña.

**Y las reacciones**: una webhook no tiene token, así que no puede reaccionar a su propio
mensaje. Hoy los 👍👎 de una votación los tiene que poner alguien a mano. Con bot de verdad
los deja puestos solo.

### Lo del cron, que hay que mirar antes de diseñar

Los **dos slots de Vercel Hobby están ocupados** (`vercel.json`): el refresco de
contención a las 12 UTC y el parte diario a las 23:55 argentinas. No queda lugar. Si el
bot necesita algo programado propio, va al scheduler externo (cron-job.org), que ya está.

Los comandos en sí **no necesitan cron** —son pull, no push—, pero el cron decide qué tan
fresca sale la respuesta, y en un canal eso se nota más que en la web, donde el
"actualizado hace X" está al lado explicando. Dos cosas baratas que lo tapan casi todo:
que el comando lea **Supabase directo** (se saltea los 4 minutos de caché del CDN) y que
la respuesta lleve **el mismo "actualizado hace X"** al pie.

**No bajar los 15 minutos del refresco de entrada.** Triplicar la frecuencia triplica las
llamadas a Riot y la key aguanta 100 cada 2 minutos: con trece invocadores probablemente
entre, pero es algo para medir, no para asumir. Mejor salida: que el comando refresque al
jugador que le preguntaste si su dato está viejo — frescura solo cuando alguien la pide.
Eso ya toca la regla de los 3 segundos, así que es v2 del bot.

## Suelto, ofrecido y no tomado

**Reusar `LigaDiaADia` adentro del modal de `LigaTorneo`** para ver el día por día de las
semanas ya cerradas. No cuesta consultas nuevas: el `resumen` guardado de cada semana ya
tiene el acumulado por día de cada uno.
