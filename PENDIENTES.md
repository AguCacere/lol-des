# Pendientes

Lo que quedó a medias y **no se deduce leyendo el código**. Los otros documentos cuentan
cómo está hecho lo que está hecho; este cuenta lo que falta, que es justo lo que se pierde
cuando se cierra una sesión.

Regla para mantenerlo: cuando algo de acá se termina, **se borra de acá** y —si dejó una
decisión— se escribe en `DECISIONES.md`. Una lista de pendientes con cosas ya hechas deja
de leerse a la segunda vez.

Lo que es de la liga **que viene** —dos semanas, bot nuevo, los "te cojo", el rebranding—
no está acá: vive en **`PROXIMO-TORNEO.md`**. Esto es lo que le falta a la de hoy.

Última revisión: 17 de septiembre de 2026.

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

**No bajar los 15 minutos del refresco de entrada.** Triplicar la frecuencia triplica las
llamadas a Riot y la key aguanta 100 cada 2 minutos: con trece invocadores probablemente
entre, pero es algo para medir, no para asumir.

## Suelto, ofrecido y no tomado

**Reusar `LigaDiaADia` adentro del modal de `LigaTorneo`** para ver el día por día de las
semanas ya cerradas. No cuesta consultas nuevas: el `resumen` guardado de cada semana ya
tiene el acumulado por día de cada uno.
