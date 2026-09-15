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

**El puuid es para siempre, el "Nombre#TAG" no.** Cualquiera puede cambiarse el
Riot ID. Hasta que `refreshOne` volvió a preguntarlo (Account-V1 por puuid), el
nombre se escribía UNA sola vez al agregar al invocador y no se tocaba nunca más: el
que se lo cambiaba seguía figurando con el viejo para siempre, en el ladder, en la
liga y en las cargadas del bot. Se relee en cada refresco y solo se escribe si
cambió.

**`lp_snapshots` solo inserta si algo cambió.** Un snapshot por refresco aunque no se
haya jugado aplana el gráfico: veinte puntos idénticos y después un salto. La
comparación con la fila anterior es a propósito.

**Y esa comparación necesita que la LECTURA haya salido bien.** `upsertRankSnapshot`
pedía la última foto y descartaba el `error`, se quedaba solo con el `data`. Con la
base devolviendo 504 —la caída de septiembre— la lectura volvía vacía, `unchanged`
quedaba falso y el cron insertaba una fila idéntica a la anterior. En los datos reales
de "compren bitcoin": nueve filas guardadas en once horas, **cinco de ellas repetidas**
(`EMERALD IV 63, 178-162` cuatro veces seguidas), y 5 de 8 tramos del gráfico planos.
Ahora, si la lectura falla, **no se inserta nada** y se pierde la foto de ese ciclo. Es
el lado barato: la corrida siguiente vuelve a comparar contra la última guardada, así
que el ascenso o el descenso se avisan quince minutos más tarde pero no se pierden.
Una foto repetida, en cambio, queda en la base para siempre.

**Lo escrito no se puede desescribir, así que el que lee también filtra.** Las repetidas
que ya entraron se dejan afuera en `app/api/ladder/route.ts`, al armar `lpHistoryByPuuid`,
comparando cada fila con la anterior. Se eligió eso y no un `DELETE` porque arregla el
gráfico sin tocar la base. Mismos `wins` y `losses` entre dos fotos = no se jugó nada en
el medio, así que filtrarlas no pierde información: ni el pico (mira el máximo) ni el
Aegis, que de hecho **se ensuciaba** con las repetidas — abre ventanas de LP cero y, si
una partida caía adentro (Riot tarda en actualizar la entrada de liga), entraba como
muestra aislada de "esta partida dio 0 LP" y arrastraba las medianas.

**Contadores acumulados ≠ diferencias de ventana.** `lp_snapshots.wins/losses` son
acumulados de la season. Restar dos puntas solo funciona si **las dos** son válidas;
con la punta base en 0 sale la season entera — así apareció un "222V-225D en una
semana" en la liga. Las victorias y derrotas de un período se cuentan de `matches`,
no restando acumulados.

**El LP de UNA partida sale de dos fotos, y a veces no sale.** `lpPorPartida`
(`lib/liga.ts`) cruza los horarios de `matches` con `lp_snapshots`: si entre dos fotos
consecutivas cayó una sola partida, la diferencia de puntos es suya y punto. Si
cayeron dos o más, **no se reparte**: repartir en partes iguales le ponía "+9" a una
derrota, y toda esa pantalla existe para que el grupo pueda *verificar* el cálculo —
un número que contradice el resultado destruye lo único que aporta. Lo que sí se
muestra es el total del tramo con "entre 2", que es medido. El caso se vuelve raro
mientras el scheduler corra cada 15 minutos; si aparece seguido, el arreglo es bajar
el intervalo, no inventar el reparto.

**El puntaje depende del ORDEN de las partidas, no solo del total.** Desde que la
cuarta victoria al hilo vale 1,25, dos personas con el mismo 8V-4D pueden tener
puntajes distintos. Todo lo que calcule un puntaje tiene que reconstruir la secuencia
ordenada por `played_at` y pasarla por `puntosDeSecuencia` — `/api/liga` y
`lib/liga-cierre.ts` lo hacen los dos, y el cierre tuvo que dejar de sumar victorias
al vuelo justamente por esto. La curva de la fila sale del MISMO recorrido
(`acumulado`): si el número contara la racha y el gráfico no, la fila se contradiría
sola.

**El castigo por derrota fija en qué winrate conviene jugar más.** Con −1 el
equilibrio está en 50% y jugar de más no suma nada; con −0,5 baja a 33% y la liga la
gana el que tiene más tiempo libre — se probó con una tabla real y el último de esa
semana (10V-11D) pasaba a primero. Quedó en −0,75, o sea equilibrio en 43%. No es un
número estético: cambiarlo cambia qué premia la liga.

**El que va primero no es necesariamente el que cobra.** La liga tiene dos mínimos
(`MINIMO_SEMANAL` = 10, `MINIMO_ULTIMO_DIA` = 3, en `lib/liga.ts`) y el premio lo
levanta `ganadorDe`, que es el primero de la tabla que además los cumple — puede no
haber ninguno y la semana cierra sin premio. La POSICIÓN sigue siendo la que dan las
netas: lo que se pierde por no cumplir es el premio, no el puesto. Cualquier lugar que
corone a alguien (el cierre, el mensaje de Discord) tiene que pasar por `ganadorDe` y
no por `tabla[0]`, o la app dice una cosa y el premio va a otra.

**La vista `ladder`: columnas nuevas al final.** Postgres tira 42P16 si se intenta
`CREATE OR REPLACE VIEW` cambiando el orden o el tipo de las columnas existentes.

**De flex no se guarda nada, nunca.** Se consulta en vivo para la cargada de Discord
y se descarta. Es un pedido explícito del dueño del proyecto, no una decisión técnica.

**`startTime` de Match-V5 filtra por el ARRANQUE de la partida**, no por el final.
Para una ventana de tiempo hay que pedir con margen hacia atrás y después filtrar por
el fin real (`played_at + game_duration_s`), o se pierden las partidas largas que
empezaron antes del corte.

## Riot

**El detalle de un jugador muestra TODAS las partidas de la semana, no las últimas cinco.**
Eran cinco y por eso no servía para lo que se abre a hacer: la pantalla dice "+7,25" y con
cinco partidas de una semana de cuarenta no hay forma de auditar de dónde salió ese
número. Esta liga se juega por plata entre gente que ya desconfía del cálculo —por eso
existe este detalle— así que recortarlo es recortar justamente la prueba.

No cuesta una consulta más: esas partidas YA se traen todas para armar la tabla, el
`slice(0, 5)` solo achicaba la respuesta. Lo que cuesta es payload, y la cuenta cierra:
seis personas por una semana brava de cuarenta partidas son unos 240 objetos, que
comprimidos no llegan a diez kilobytes, una vez cada cuatro minutos por la caché del CDN.

**Y van AGRUPADAS POR DÍA, con el acumulado de cada día.** Cuarenta partidas corridas no
son transparencia, son un volcado: para llegar al número grande hay que ir sumando de a
0,75 con el dedo. Con el día como unidad la cuenta se lee de arriba abajo —"el sábado hizo
−1,5 y quedó en +3,5"— y adentro de cada día son tres o cuatro partidas, que sí se suman
de cabeza. **El acumulado no se recalcula**: sale de `porDia`, la misma curva que dibuja la
carrera y que llena la grilla del día a día, así que las tres pantallas no se pueden
contradecir. Verificado sobre una semana armada a mano: lun +1,25 → mar +0,75 → jue +5 →
sáb +3,5, y ese +3,5 es exactamente el puntaje que muestra la fila.

**La carrera y la grilla del día a día no son lo mismo, y por eso conviven.** El gráfico
da la FORMA —quién se escapó, cuándo se cruzaron— pero no tiene los números: no hay manera
de leer ahí "el martes hizo +2,25". La grilla es la cuenta. El dato es el mismo `porDia`
en los dos casos, así que no hay consulta nueva: lo único que faltaba era escribirlo.

Y por eso la grilla va detrás de un botón y no abierta: dos formas del mismo dato
compitiendo en la misma pantalla es exactamente lo que hace que una sección se sienta
recargada. Mismo cartel que "cómo terminó" —`.torneo-fondo` / `.torneo-caja`— porque es el
mismo gesto y dos carteles distintos para lo mismo harían parecer que la app la hicieron
dos personas.

**Son DOS vistas de la misma grilla, y la que contesta la pregunta es la segunda.**
"Puntos" muestra cuánto sumó cada uno ese día; "Puesto", en qué posición cerró. La segunda
es la que de verdad cuenta cómo se fue moviendo: se lee una fila de izquierda a derecha y
se ve a alguien subir de 6º a 1º. Un toggle y no las dos juntas — en una celda de treinta
píxeles, dos números apilados no son más información, son ruido.

**Y acá una tabla SÍ es la forma correcta.** La sección se rehízo entera para dejar de
parecer una planilla, pero esto compara las mismas celdas entre personas Y entre días, que
es justo para lo que sirve una tabla y para lo que no sirve una lista (ver "tabla contra
lista" más arriba). Con su propio `overflow-x` —siete días más el nombre no entran en un
teléfono— y la columna de nombres pegada a la izquierda: sin eso uno arrastra hasta el
sábado y ya no sabe de quién es la fila.

**Los títulos de la semana son UNO por persona, y esa es toda la idea.** El problema
más grande que tenía la liga no era técnico: son cinco o seis jugando por UN premio, así
que el miércoles ya hay tres que no llegan al podio y para esos tres el jueves, el viernes
y el sábado no tienen nada. Y el mensaje del domingo lo empeoraba — nombra a uno campeón y
a los demás como el chiste. Eso es gracioso una vez; la tercera vez que sos "agua" dejás
de jugar.

Lo obvio sería "el líder de cada categoría gana esa categoría", y está mal: el que ganó la
liga suele ser también el que más jugó y el de mejor racha, así que se llevaría tres
títulos y volvíamos al mismo lugar. Es un REPARTO: se busca, entre todos los pares
(persona sin título, título libre), el de mejor posición, y así hasta que cada uno tiene
el suyo. Medido con una semana donde el campeón encabezaba tres categorías: se llevó una
sola y los otros cinco tuvieron la suya.

**Y ninguno resta.** Esto no es un detalle de tono: la liga ya probó que un arranque en
negativo hace que la gente deje de jugar —"dejo de participar si arranco en negativo", con
todas las letras— así que acá no hay castigos. El peor título posible sigue siendo un
título.

**La distinción que hay que respetar al agregar categorías: relativas contra absolutas.**
Una relativa dice "el que más X del grupo" y es cierta sea cual sea el número, así que no
lleva piso y siempre tiene dueño. Una absoluta afirma algo por su cuenta, y sin piso salen
cosas como "la racha: 1 al hilo", que no reconoce nada — deja en evidencia que no había
nada que reconocer. **Tiene que haber tantas relativas como gente pueda jugar**: son las
que garantizan que una semana floja no deje a nadie afuera. Se descubrió probando
justamente eso: con cinco relativas y seis jugadores, una semana en la que todos jugaron
dos o tres partidas dejaba a uno sin nada. Hoy son seis.

**El parte diario se calla dos veces, y eso es la mitad del diseño.** El bot manda
todas las noches cómo va la liga, pero devuelve null —o sea, no manda— los domingos y
los días en que no jugó nadie. Los domingos porque ese día sale el cierre con el podio y
las cargadas, y dos mensajes de la liga a la misma hora se pisan; los días vacíos porque
un bot que escribe "no se movió nadie" es un bot que el canal aprende a saltear, y
después no lo leen ni cuando tiene algo. Por eso "no mandé nada" contesta **200** y no un
error: es el caso normal. Si falla de verdad (Supabase caído) tira 502, para que en el
log del scheduler no se confunda una caída con un domingo.

**Y lo que hace que valga leerlo no es la tabla: es lo que cada uno movió HOY.** Los
puestos casi no se mueven de un día para el otro, así que un parte que solo repita el
orden es el mismo mensaje siete veces. El delta sale de `porDia` —el último cierre menos
el anterior—, o sea del MISMO array que dibuja la carrera, para que el bot y el gráfico
no puedan decir cosas distintas.

**"No jugó" NO se puede deducir de que el puntaje del día sea 0.** Parece que sí y no:
tres victorias y cuatro derrotas dan exactamente 1+1+1−0,75·4 = 0, y eso es un día de
siete partidas, no un día sin aparecer. Por eso `FilaDelDia` lleva `jugadas` aparte, que
se cuenta en `tablaDeSemanaEnBase` contra el 00:00 argentino de hoy —con las partidas ya
filtradas por cola, remake y arranque de cada uno—. Contarlo en una segunda consulta con
sus propios filtros hubiera sido una copia de las reglas esperando a desincronizarse.

**Un remake trae `win` puesto, y no significa nada.** Cuando a alguien no le carga el
juego y a los tres minutos el equipo vota /remake, Riot **no cuenta esa partida**: ni LP,
ni victoria, ni derrota en el récord de la cuenta. Pero en el payload de Match-V5 viene
igual con `win: true` para el equipo que quedó completo y `win: false` para el que perdió
al que se cayó, y la app se lo creía. La liga sumaba un punto de un lado y restaba 0,75
del otro por una partida de cuatro minutos que nunca se jugó; el bot cargaba por una
derrota que Riot no anotó; y las rachas se partían solas.

Pasó dos semanas seguidas. Medido con la tabla de puntos de la liga: una victoria, un
remake contado como derrota y otra victoria daban **+1,25** en vez de **+2**; al del otro
lado, el mismo remake contado como victoria lo dejaba en **−0,5** en vez de **−1,5**. Y un
remake en el medio de cuatro ganadas al hilo cortaba el bono de racha: **+3,25** en lugar
de **+4,25**.

**El corte va en la DURACIÓN (`DURACION_MINIMA_S = 300`), no en el flag de Riot**, aunque
el flag (`gameEndedInEarlySurrender`) sea más preciso. La razón es que tiene que valer
para las filas YA guardadas, y en la base lo único que hay es `game_duration_s`: guardar
el flag pedía una columna nueva más un repaso de toda la historia contra la API. Con la
duración, el arreglo es un `.gte()` en cada consulta y corrige lo viejo y lo nuevo sin
tocar el esquema ni pedirle nada a Riot. Cinco minutos no es ambiguo: una ranked no puede
terminar antes —el nexo no se cae tan rápido y el voto de rendirse recién se habilita a
los 15— así que todo lo que dura menos es un remake o una partida que cortó el servidor,
y ninguna de las dos cuenta. Donde SÍ está el payload a mano (la cargada, que lo baja
igual) se usan las dos cosas: `esRemake` en `lib/refresh.ts`.

**Va en TODAS las consultas que cuentan partidas, no solo en la liga.** Si el ladder
contara los remakes y la liga no, el récord del mismo jugador diría dos cosas distintas
en dos pestañas. Están filtrados `/api/liga`, `lib/liga-cierre.ts`, `/api/ladder`,
`/api/team-digest`, `/api/coach`, el aviso de racha y la búsqueda de la peor partida.
La única excepción es `/api/roast` **pedida con un `match_id` explícito**: si alguien
pasa el id a mano, que conteste de esa partida y no "no la encuentro".

**Las semanas ya cerradas no cambian.** El cierre guarda su `resumen` y la vitrina lo lee
de ahí, así que una liga que el bot ya anunció se queda con los números que se anunciaron
—ver "un resultado anunciado es un HECHO"—. Para recalcular una a propósito está el POST
de `/api/liga/semana`.

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

**La key de Riot no vence.** Es una key de aplicación aprobada, no una de desarrollo:
no hay que renovarla cada 24 horas y "se venció la key" NUNCA es la explicación de que
falle todo junto. Queda escrito porque es la primera hipótesis que aparece cuando los
catorce fallan a la vez, y es la equivocada: ya se descartó midiendo —un `POST
/api/refresh` manual devolvió "ok" para los catorce mientras el cron llevaba 55 minutos
sin actualizar a ninguno.

**La caché del CDN no es una optimización: es lo que mantiene vivo al cron.** La base
es una Nano con un pool de 15 conexiones. Cada lectura sin cachear de los doce amigos
mirando a la vez es una conexión, y cuando el pool se llena el gateway devuelve 504 —
incluso a un select de doce filas. Ahí el cron se queda sin conexión y NADIE se
actualiza, que es el síntoma visible ("actualizado hace 31 min" con un cron de 15).

Dos cosas estaban mal y las dos salieron de contar, no de intuir:

- **`/api/liga` no tenía NINGUNA caché** y es la tabla de la pestaña por defecto: cinco
  consultas —invocadores, fotos de una semana, partidas de la semana, historial y
  plantel— por cada visita de cada uno.
- **`/api/ladder` cacheaba 60 segundos**, cinco veces más ajustado que quien lo consume:
  el cliente recarga el ladder entero cada 5 minutos (`FULL_REFRESH_MS` en
  `app/page.tsx`) y los datos de abajo solo cambian cuando escribe el cron, cada 15.
  O sea que se rearmaba el ladder —que lee TODAS las partidas ranked de los doce, sin
  límite— muchas más veces de las que nadie podía notar.

Las dos quedaron en `s-maxage=240`. **La regla: la caché se elige contra cada cuánto
cambian los datos (15 minutos), no contra cada cuánto alguien mira.** Y el estado "en
vivo" no depende de esto: lo trae `/api/live`, que es la consulta liviana que la
pantalla pollea cada 60s justamente para no recargar el ladder entero.

**Con caché, toda mutación necesita saltearla.** Agregar un invocador o anotar a alguien
en la liga y después releer devolvía la respuesta cacheada de ANTES del cambio: parecía
que el botón no había hecho nada. Las dos relecturas post-POST van con `?t=Date.now()`.

**Cada respuesta cacheada necesita su PROPIO cartel de "actualizado hace".** El TopBar
ya mostraba uno, pero sale de `/api/ladder`; la liga se lee de `/api/liga`. Son dos
entradas de caché distintas que vencen cada una por su lado, así que el cartel de arriba
podía decir "recién" con la tabla de abajo cuatro minutos atrás. Un reloj que mide otra
respuesta es peor que no tener reloj: da confianza en un número viejo. `/api/liga`
manda ahora su propio `actualizado` y el panel de la liga lo escribe.

Dos detalles que hacen que sirva. **Va como marca de tiempo ISO, no como texto ya
armado**: el cuerpo lo puede servir el CDN cuatro minutos después de haberlo calculado,
y un "hace 2 min" escrito en el server mentiría exactamente en esos cuatro minutos —
con la marca, la resta la hace el reloj del que mira y el cartel envejece junto con la
respuesta cacheada. Y **el cliente tiene un tick de 30s** cuyo único trabajo es volver
a dibujar ese texto: sin él la etiqueta se congela en el minuto en que cargó la pestaña
y dice "hace 1 min" durante media hora, que es justo el caso —la pestaña que quedó
abierta— que el cartel viene a resolver.

**El camino completo de una partida hasta la pantalla son cinco esperas, no una.** Se
midió una que "tardó" y no había nada roto: Riot tarda en publicar la partida (1-3 min),
el scheduler externo corre cada 15, la corrida en sí tarda ~30s (medido: trece
invocadores, todos `ok`, 28 segundos), el CDN sirve hasta 240s de su copia, y encima el
`stale-while-revalidate=600` hace que **la primera visita después de que vence los 240s
todavía reciba la vieja** mientras busca la nueva por detrás. Ese último escalón es el
que hace que se sienta roto en vez de lento: recargás y está viejo, recargás de nuevo y
ahí sí. Peor caso ~20-25 minutos, todo esperado. Antes de tocar nada, mirar el log de
`/api/cron/refresh`: la línea `cron refresh done:` lista el resultado invocador por
invocador y dice si la corrida fue el problema o no lo fue.

**Un error de Supabase en la primera consulta se lleva puesto el ciclo entero.**
`refreshAllSummoners` arranca leyendo la lista de invocadores; si esa consulta falla,
tira antes del bucle y NADIE se refresca — y como los errores por invocador sí están
atrapados y guardados en `results`, la única señal es una línea de log. Pasó: el cron
contestaba 200 cada 15 minutos, los catorce quedaban "sin actualizar" y el log decía
`cron refresh failed: Gateway Timeout`, un 504 del gateway de Supabase en un select de
trece filas. Ahora esa consulta va con `conReintento` (`lib/supabase.ts`), que reintenta
**solo lo transitorio** —timeouts, gateway, red— y no lo que va a fallar igual la
segunda vez, como un permiso o una columna mal escrita.

**La base es una Nano: el pool son 15 conexiones y ese es el techo.** Cuando se llena,
el gateway devuelve **504 hasta en un select de trece filas** — no es que la consulta
sea cara, es que no consigue conexión. Se vio así en los logs de Supabase: el mismo
`GET /rest/v1/summoners?select=puuid,last_refreshed_at` con 504 en los cuatro ciclos
del cron seguidos, y al lado los pesados de verdad (el `matches` con sesenta columnas
para todos los puuids, el `champion_mastery` con la lista de IN larga). Por eso el
refresco corre de a 2 y no de a 4: el ciclo tiene quince minutos para catorce
invocadores, tiempo sobra y lo que falta es pool. Antes de agregar concurrencia o
consultas nuevas, mirar el pool.

**Borrar-y-volver-a-insertar no es una transacción.** `champion_mastery` se escribía
con un DELETE de todo lo del puuid y después un INSERT. Cuando el DELETE se comió un
504 —el cliente se rinde, el servidor a veces igual ejecuta— el INSERT que venía atrás
chocaba con un 23505 `duplicate key`. Está en los logs, con seis segundos de
diferencia. Ahora es un upsert por `(puuid, champion_id)` y después un DELETE de lo que
sobró: hace lo mismo, pero si cualquiera de los dos pasos falla la tabla queda
consistente y el refresco siguiente la deja al día.

**El `select` de `matches` del ladder está partido en dos, y las dos mitades tienen que
usar la MISMA regla.** De las 58 columnas, 21 las necesita el agregado —pool de
campeones, récords, radar por línea, líneas, duos— para TODAS las partidas; las otras 37
solo las lee el bloque del detalle, que corta en `arr.length >= 5`: las últimas cinco de
cada jugador, unas setenta filas contra miles. Traer las 58 para todo era el pedido más
caro de la app y tiene 504 propios en los logs.

Ahora hay una consulta liviana (`COLUMNAS_AGREGADO`) y otra que pide `COLUMNAS_DETALLE`
solo para los `match_id` de esas primeras cinco, y las dos mitades se vuelven a pegar
antes del bucle — así el bucle sigue viendo filas enteras y su lógica quedó intacta. El
peligro está en la regla: el pre-recorrido que elige los `match_id` cuenta hasta cinco
por puuid sobre el mismo arreglo y en el mismo orden que el bucle. **Si alguien mueve el
corte de cinco en un lado y no en el otro, a alguna partida le van a faltar los datos del
detalle.** Están pegados y comentados a propósito. Las filas que no entran se completan
con `DETALLE_VACIO`, tipado con `Omit<MatchDetalle, …>`: si se agrega una columna al
detalle y se olvida ahí, no compila.

**Cómo se lee un error para saber de quién es.** Todo lo que sale de Riot viene con el
prefijo `Riot API error <status>:` (`lib/riot.ts`), así que un mensaje pelado como
"Gateway Timeout" es de Supabase, no de Riot. Eso solo ya descarta media hipótesis sin
tocar nada.

## Caché y deploys

**La ventana de caché del CDN.** `/api/ladder` es `s-maxage=60`, `/api/team-digest`
`s-maxage=300`, `/api/live-detail` `s-maxage=120`. Después de cada deploy hay pestañas
con el bundle **nuevo** recibiendo JSON **viejo**. Todo campo nuevo se lee con guarda
(`?.`, un default) o la pantalla se rompe durante esa ventana. `force-dynamic` no
cambia esto: apaga el caché de datos de Next, no el del CDN.

## Gráficos y SVG

**Una caja suelta en una sección sin cajas se lee como pegada de otra pantalla.**
Cuando la lista de la liga dejó de tener marcos, los chips de la leyenda del gráfico
quedaron siendo lo ÚNICO encerrado en píldoras con borde de toda la sección: siete
botones en fila entre un gráfico sin marcos y una lista sin marcos. Siguen siendo
`<button>` —son el control que elige a quién seguir— pero dejaron de vestirse como
uno: al elegido lo marca el peso de la letra y su marquita más grande. Y el aire
entre chips subió a 18px, porque sin marco lo que los separa es el espacio.

**Un dato repetido a cuarenta píxeles del otro no es redundancia: es una línea que no
pertenece a ningún bloque.** "14 sept – 20 sept · faltan 6 días" vivía suelto entre
las reglas y el panel de estado, y el panel decía "faltan 6 días" en grande justo
abajo. Medido con `innerText`: el mismo texto dos veces en la misma pantalla. La
fecha pasó a ser el TÍTULO del panel —que es lo que siempre fue, el marco de la
semana— y la cuenta regresiva quedó una sola vez. Se fueron con eso `.liga-rango`,
`.liga-falta`, `.liga-contexto-fecha` y `.liga-rango-solo`, que quedaron muertas.

**"Se siente formulario" tiene una causa estructural: era una TABLA.** La liga se
dibujaba con una grilla de siete columnas y una fila de rótulos arriba. Esa forma
promete algo que en este grupo nadie hace —comparar columna por columna de punta a
punta— y a cambio hace que seis amigos compitiendo se lean como un reporte. El
patrón que corresponde es LISTA: se usa tabla cuando hay que comparar atributos
entre muchos ítems, y lista cuando se lee para abajo y a cada uno le importan pocos
datos. Lo que lo cambió, en orden de cuánto pesa cada cosa:

1. **Sacar el encabezado de columnas.** Es LA señal de planilla, y cada dato se
   rotula solo (el emblema dice el rango, "7V · 1D" dice el récord, el marcador
   lleva "puntos" abajo del número).
2. **Flex en vez de grid.** Sin columnas fijas no hay casillas que se alineen entre
   filas. De paso desaparecieron las tres bandas de `@media` que había que calcular
   para que ninguna columna bajara de su mínimo.
3. **Siete columnas a tres zonas**: puesto · cara+identidad · marcador. El avatar y
   el arte del campeón se montan en un solo retrato —eran dos casillas—, y el rango
   y el récord bajan a vivir abajo del nombre.
4. **Separador entrado, no marco.** Una hairline entre personas que arranca después
   del retrato, en vez de un borde que cierra cada fila.
5. **Ritmo por jerarquía, no por decoración.** Medido: el puntero mide 121px de
   alto, los que juegan 110 y los que no jugaron 89; y adentro de una fila hay cinco
   tamaños de letra (27/22 del marcador · 16,5/14,5 del nombre · 14 del récord · 11
   de la metadata · 9,5/8,5 del LP y la unidad).

**El `1fr` en el texto, otra vez — y ahora con nombre.** Con el bloque del nombre
estirando, a 1180px quedaban novecientos píxeles de aire entre el nombre y el
marcador: dos islas que el ojo tenía que unir a mano, que es exactamente lo que se
siente como columnas. El arreglo no es repartir mejor el sobrante sino **darle a la
lista un ancho de lectura propio** (1040px) más angosto que la tarjeta. La carrera
de arriba sí usa los 1180 porque un gráfico de siete líneas los aprovecha; una lista
de siete personas no. Una columna angosta abajo de un gráfico ancho es una
jerarquía, no un descuido.

**Lo que se expande CUELGA, no se apila.** El detalle de las últimas partidas era un
rectángulo con fondo, borde abajo y barra al costado: otra caja del ancho de la
tarjeta que no se sabía de quién era hasta leerla. Ahora no tiene fondo ni bordes y
lo que lo ata es la POSICIÓN — entra hasta donde arranca el nombre y un hilo vertical
baja desde el CENTRO DEL AVATAR de esa persona (medido: 79px desde el borde de la
lista; desalineado colgaba del número del puesto y no de nadie). La misma idea que un
hilo de respuestas: la sangría dice de quién es.

**Un resultado ya anunciado es un HECHO: se guarda, no se recalcula.** El cartel de
"cómo terminó el torneo pasado" reconstruía la semana leyendo quién tiene
`participa_liga = true`, que es un estado del **presente**. El día que se destildó a
todos para rearmar el formato, una semana que ya había cerrado y tenía campeón
anunciado se quedó sin participantes y la pantalla dijo que no había jugado nadie. Y
volver a anotarlos **no lo arregla**: al desanotar se borra `liga_desde`, y al
reanotar se sella con la fecha de hoy, que filtra todas las partidas viejas. La
historia se había perdido con un checkbox. Ahora el cierre escribe
`liga_semanas.resumen` (jsonb) con la foto entera y la pantalla la LEE; el cálculo en
vivo queda de respaldo para las semanas viejas que no la tienen.

**Un `{ data }` sin `error` convierte una caída en un dato falso.** Las consultas que
arman la tabla de la liga descartaban el `error` del cliente de Supabase. Cuando una
falla —el 504 del pool lleno— `data` viene `undefined`, el `?? []` lo vuelve "cero
partidas" y sale un 200 con todos en "no jugó". No es solo un error invisible: MIENTE
sobre el marcador, que es lo peor que puede hacer esta pantalla. Van con `throw` y la
ruta contesta 502 con el motivo. Y un resultado vacío sospechoso (gente anotada, cero
partidas) **no se cachea**: guardarlo seis horas convierte un parpadeo en una tarde de
pantalla rota.

**El número que se muestra tiene que ser el que DECIDE.** La vitrina de campeones
mostraba el `lp_neto` guardado en `liga_semanas` —un "+144" verde al lado del
ganador— cuando la liga se gana por PUNTOS (`MODO_LIGA = "puntos"`): el tipo había
ganado con +10,25 y la vitrina lo contradecía con un número cuatro veces más grande
sacado de otra unidad. Se agregó `liga_semanas.puntos` y el LP quedó de contexto. Las
semanas viejas que no lo tienen muestran el LP **rotulado** ("+144 LP"), que es lo
mínimo para que no se lea como si fuera el puntaje.

**Una columna nueva en una base que se migra a mano se lee con `select("*")`.** Entre
el deploy y el momento en que el usuario corre el SQL, un `select` con la lista de
columnas falla ENTERO y la sección desaparece de la pantalla sin decir por qué. Y el
`insert` del cierre, que sí tiene que nombrarla, reintenta sin ella y avisa en el log:
perder el cierre de la semana por una migración pendiente es mucho peor que cerrarla
sin un dato de adorno.

**El punteado es un estilo de SERIE, no de eje.** La línea del cero de la carrera iba
punteada, con el color del texto y a 0,75 de opacidad —más marcada que las líneas de
la gente, que van a 0,4— justamente para que se notara el umbral. Se leía como un
jugador más, sobre todo cuando el último cruzaba a negativo y le pasaba por al lado.
El arreglo va al revés en las tres cosas: **sólida, del color de la grilla y más
apagada que cualquier línea de datos** (medido: el cero queda en rgb(46,46,45) contra
rgb(59,59,56) de una línea de contexto). Y el que marca el umbral pasa a ser el
**número del eje**, que es texto y nadie confunde con una línea. La otra mitad del
arreglo es de forma y no de color: el cero **cruza la caja entera** y las líneas de
datos terminan adentro — lo que llega hasta el borde se lee como mobiliario.

**Una etiqueta que se empuja para no pisarse deja de señalar su línea.** Los nombres
del pasillo de la carrera se corren hacia abajo cuando dos terminan juntos, y con
seis que llegan amontonados el nombre queda a veinte píxeles de donde termina su
línea: el pasillo se convierte en una lista al costado y "se pierde de vista" cuál es
cuál. La solución no es apretar menos, es **dibujar la guía** del final real de la
línea hasta la altura a la que quedó el nombre, más **un punto en la punta de cada
línea** que dé el ancla desde donde empezar a seguirla. La guía va en unidades del
`viewBox` y la etiqueta HTML arranca exactamente donde la guía termina: con
`preserveAspectRatio="none"` los píxeles del SVG y los del HTML no son los mismos.

**El resaltado que entra por varios lados va por estado, no por `:hover +`.** Con la
línea, el nombre del pasillo y el chip apuntando todos al mismo corredor, el selector
CSS solo cubre uno. Y el resaltado no mueve nada de lugar: solo opacidad y color —
que el dibujo se reacomode bajo el mouse es lo que hizo insoportable el hover viejo.

**`preserveAspectRatio="none"` deforma.** El `viewBox` tiene que estar cerca del
tamaño real de render o el dibujo se estira. El remedio para una columna fluida es
`max-width` igual al ancho del viewBox: **estirar es la dirección fea** —engorda el
trazo solo en horizontal y convierte el punto final del `SparkChart` en un óvalo—
mientras que comprimir apenas afina la línea. El del ladder venía con viewBox de 150
en una columna de 305: 2,03x de estirón, y era la razón de que se viera peor que el
de la liga, que va 1:1. Y el `<text>` de un SVG escala con la
caja: una etiqueta legible en desktop queda en 4,7px en mobile. **Las etiquetas van en
HTML encima del SVG**, no adentro.

**El eje X va por índice, y mover eso a tiempo real YA SE PROBÓ Y SE REVIRTIÓ.** La
idea era buena en el papel: el gráfico promete fechas en las puntas ("8 sept … 12 sept")
y adentro no las cumplía, así que un hueco de horas se dibujaba como una bajada suave y
continua. Pero este grupo juega poco y salteado —siete victorias y tres derrotas en OCHO
días es un caso real— y con la X por tiempo eso queda como dos rectas larguísimas y medio
cuadro vacío. Quedó peor que el problema que venía a resolver. Si alguien lo vuelve a
intentar: con un piso de separación se puede evitar que los saques se amontonen (se midió:
5 partidas en 2,2 h pasaban del 2,1% del ancho al 7,7%), pero las rectas largas de los
días sin jugar no las arregla nada.

**Se miraron los `captured_at` reales y el problema no era el eje: eran fotos
repetidas.** Nueve filas de "compren bitcoin" en once horas, cinco repetidas, 5 de 8
tramos planos — el gráfico dibujaba una meseta larga porque más de la mitad de la
ventana de veinte puntos era relleno. Se arregló en las dos puntas (ver `lp_snapshots`
en **Datos**). Moraleja del episodio entero: dos intentos de arreglar el gráfico
tocando el eje —y uno revertido— cuando la pregunta se contestaba con un `select` de
cuarenta filas.

**La escalera del LP SE PROBÓ Y SE SACÓ. No volver a intentarla.** El razonamiento era
correcto: el LP no se mueve solo —entre dos fotos se queda quieto y salta de golpe
cuando termina una partida— así que cualquier diagonal afirma un movimiento gradual que
no existió. Se implementó, se verificó sobre el path (0 diagonales, 11 tramos
horizontales, 9 verticales) y en pantalla quedó horrible: con veinticinco fotos en
cuatro días —el caso real, el cron corre cada 15 minutos— son veinticinco escaloncitos
de dos píxeles y el gráfico se lee como un peine, no como una escalada.

La lección, que vale más que el caso: **la forma más fiel no es la mejor si a la
densidad real del dato se vuelve ilegible.** Un gráfico que no se puede leer no
comunica nada, y eso es peor que la pequeña mentira de la diagonal. La escalera sería
la forma correcta con cinco o seis fotos; con veinticinco no.

**La curva suave INTERPOLA: pasa por todos los puntos. La que aproximaba se sacó.**
La primera versión era una cuadrática por los puntos MEDIOS usando el punto real como
control. Eso aproxima, no interpola: la línea no pasaba por ninguno de los puntos de
adentro. Con el gráfico marcando cada cierre de día con un círculo, los círculos
quedaban flotando arriba o abajo del trazo — un gráfico que se contradice a sí mismo.
Ahora es interpolación cúbica monótona (Fritsch–Carlson), que da las dos propiedades a
la vez: toca cada punto Y no se pasa entre dos (que es lo que descalificó a Catmull-Rom,
que inventa picos). Medido sobre el path renderizado: desvío punto-curva 0,001px y
sobrepaso 0px.

**La selección de la carrera va por CLICK, no por hover.** Con seis líneas, el hover
hacía que el resaltado saltara de una a otra con solo cruzar el gráfico: el dibujo se
movía solo mientras uno intentaba leerlo. El hover quedó nada más como afordancia —la
línea de abajo del mouse se aclara— que avisa que se puede tocar sin cambiar nada.

**Y ahora TODOS los gráficos de línea usan la misma forma: la curva suave.** El de LP
del perfil, las sparklines del ladder y la carrera de la liga. Antes convivían tres
—recta, curva y escalera— y lo único que se notaba era que cada gráfico parecía de otra
aplicación. `stepPath` y la opción `"escalera"` ya no existen en `lib/chart.ts`.

**"Se siente tosco" tiene causas concretas, no es una impresión.** La carrera con eje
y nombres ya se entendía y seguía viéndose mal. Lo que faltaba, en orden de cuánto
cambió:

1. **Curva en vez de polilínea.** Los quiebres en punta sobre fondo negro leen como un
   diagrama técnico. Se usa `smoothLinePath` (ver arriba: cúbica monótona, pasa por
   cada punto y no se pasa entre dos). Que invente el camino entre dos cierres de día
   es aceptable porque una recta ya lo inventaba igual: entre un cierre y el otro
   hubo partidas sueltas que no se pueden dibujar en un eje por día. Y los puntos
   reales quedan marcados con un círculo, que es lo que la mantiene honesta.
2. **Relleno con degradado abajo de la línea en foco.** Solo de esa: seis rellenos
   superpuestos son un manchón. El degradado cae rápido (0,16 → 0,03 al 45% → 0) por
   una razón medida, no estética: el área cierra con un corte vertical abajo del
   último punto y con un degradado parejo ese corte se ve como una pared.
3. **Columnas por día.** Verticales en cada cierre. Son lo que convierte líneas
   flotando en una grilla: sin ellas, relacionar una altura con un día obligaba a
   bajar la vista hasta las etiquetas.
4. **Encabezado de tres niveles** (rótulo · titular · pie) en vez de un renglón de 11px
   con todo adentro, que se leía como una nota al pie de algo.
5. **Zona de agarre para el mouse.** Un trazo transparente de 16px encima de cada línea:
   una de 1,5px no se puede apuntar, y un gráfico que no reacciona a nada se siente
   muerto.

**El pasillo de nombres se mide en %, no en px.** Son 152 de un viewBox de 1000, o sea
15,2% del ancho REAL de la caja. Con un `max-width` fijo el nombre se salía de la
tarjeta apenas la pantalla bajaba de ~1100px — medido: "marlboro de diez" se escapaba a
900. Abajo de 1024 se cae el puntaje del pasillo, porque entre las dos cosas el que ata
la línea a una persona es el nombre.

**Pero abajo de 700 se cae el NOMBRE, no la etiqueta.** La primera versión apagaba el
pasillo entero con el argumento de que 152 de 1000 son unos 50px reales y ahí no hay
nombre que se lea. La mitad era cierta y la conclusión no: en el teléfono cada línea
terminaba en una punta muda, se veía que alguien había subido pero no cuánto, y el número
que el gráfico viene a contar había que ir a buscarlo abajo. Las dos reglas —"sin puntaje"
de 1024 y "sin nombre" de 700— se sumaban y no quedaba nada. En 50px no entra
"marlboro de diez" pero "−1,25" entra de sobra, así que en el teléfono el que se queda es
el puntaje y los nombres pasan a la fila de chips, que ahí es la leyenda. Por eso el
`@media (max-width:1024px)` lleva además `(min-width:701px)`: sin ese tope de abajo las
dos reglas vuelven a pisarse.

**Y en el teléfono la etiqueta se ancla al borde derecho, no al final de la guía.**
Arrancando desde la izquierda y creciendo hacia afuera, el que decide si entra es el
ancho del texto: en el pasillo del teléfono hay unos 50px y "−1,25" mide 33, así que
cualquier cosa que agrande un poco la letra —el tamaño de fuente del sistema, el zoom de
accesibilidad de iOS, una tipografía que cae distinta a la que uno probó— la empuja fuera
de la tarjeta, y fuera de la tarjeta no se ve nada. Con `right:0` sumado al `left` que ya
pone el componente, la caja ocupa el pasillo entero y el número se va contra el borde con
`flex-end`: no hay ancho que lo saque, y si algún día no entrara se desborda hacia ADENTRO
del dibujo, donde por lo menos se lee. **La regla general: una etiqueta al borde de algo
se ancla al borde, no se la posiciona y se reza.** Probado agrandando la fuente un 55%
(11px → 17px): las cinco siguen dentro de la tarjeta y de la pantalla a 390 y a 360.

**Y las etiquetas necesitan menos interlineado cuando el gráfico se achica.** `SEPARACION`
son 18 unidades de un viewBox de 264, pero abajo de 560 el SVG pasa a medir 194px reales:
esas 18 unidades valen 13px y una etiqueta con interlineado normal mide 15. Medido, un par
se pisaba a 560 y para abajo. Con `line-height:1` entran justas. **La trampa general: todo
lo que separa cosas DENTRO del viewBox se achica con él, y el texto HTML de encima no** —
son dos sistemas de medida y hay que acordarse de que no escalan juntos.

**El detalle que se abre es una LÍNEA DE TIEMPO, no una mini tabla.** Era `V | campeón
| puntos | LP`: cuatro columnas, una raya divisoria arriba de cada fila y la "V" o la "D"
metidas en un rectángulo pintado de verde o rojo. Con eso, la expansión de una lista sin
marcos se leía como una planilla pegada abajo del jugador, que es justo lo que la lista
había dejado de ser. Y además era mentira sobre lo que es: no son cuatro registros, es la
secuencia de partidas que construyó el puntaje.

Lo que lo cambió no fueron los colores ni los paddings:

- **El hilo que ya colgaba del avatar pasó a ser el eje de la secuencia.** Estaba puesto
  para decir "este detalle es de él" y no hacía nada más; ahora los nodos de cada partida
  van ENSARTADOS en él (sangría 70 + media columna 9 = 78, que es donde cae). Un solo
  trazo dice las dos cosas: de quién es y que las partidas van una tras otra.
- **El nodo ES el resultado.** Un ✓ o una ✕ del color que corresponde, con el fondo de la
  sección atrás para tapar el hilo justo detrás del signo. Reemplaza al rectángulo
  pintado: el color tiñe el signo, no una pastilla.
- **Se fueron las divisorias.** Eran lo último de la planilla: con una raya arriba de
  cada fila, cuatro eventos se leen como cuatro renglones. Ahora separa el aire y une el
  hilo.
- **Puntos arriba, LP abajo, los dos contra el borde derecho.** Iban uno al lado del otro
  con tamaños parecidos, así que la pantalla no decía cuál de los dos decide la liga. Y
  el número lleva un "pt" chiquito al lado porque "+1" y "+18 LP" sin la unidad se leen
  como dos versiones del mismo dato.

**Apilar dos renglones salió gratis, y ese era el requisito difícil.** El pedido era
mejorar la presentación SIN estirar el bloque. Con `line-height:1` y `gap:0`, la pila de
puntos + LP mide 22px, o sea menos que el avatar (24), así que el que manda la altura de
la fila sigue siendo el avatar igual que antes. Medido: la fila pasó de 28 a **30px** —
+2— y en esos 30 entran un avatar más grande (22 → 24), el KDA que antes no estaba y un
renglón más de texto. **La lección: antes de agrandar la fila, fijarse quién le está
marcando el alto; si es otro elemento, el renglón nuevo no cuesta nada.**

**Y el KDA se sumó al detalle, pero NO al puntaje.** `kills/deaths/assists` entran en la
consulta de `/api/liga` solo para esta lista. La liga se decide por resultado, no por cómo
jugaste — pero abrir la fila y ver "ganó con Seraphine" sin saber si fue un 12/2 o un 1/9
deja la mitad de la historia afuera. Van opcionales en `PartidaLiga` por la ventana de
caché del CDN: si la respuesta es anterior al deploy, la línea sale sin KDA en vez de con
"0/0/0", que sería un dato inventado.

**Un gráfico sin eje Y no dice nada, y la primera carrera no tenía.** Salió con siete
líneas flotando sin una sola marca de cuánto: se veía que había una arriba y un montón
abajo, que es exactamente lo que ya decía la tabla. El usuario lo dijo así: "no se
entiende qué quiere demostrar". Faltaban tres cosas, y las tres son obligatorias, no
adornos:

1. **La escala.** Grilla con los puntos escritos y el cero más marcado que el resto. Las
   marcas salen de una lista de pasos redondos (0,5 · 1 · 2 · 2,5 · 5 · 10…) eligiendo
   el primero que deje cinco marcas o menos — un eje que dice 2,83 y 5,66 es peor que no
   tener eje.
2. **La identidad.** Cada línea termina con el nombre escrito al lado, empujados hacia
   abajo hasta que ninguno se pisa: se leen de arriba abajo en el orden en que van. Un
   gráfico que necesita que toques algo para saber de quién es cada línea no se
   entiende. Abajo de 700px el pasillo no entra (128 de 1000 son 45px reales) y ahí los
   chips vuelven a ser la leyenda.
3. **La proporción.** El viewBox de 620 se estiraba a 1150px reales —casi el doble— y
   eso aplasta las pendientes hasta que todo parece plano. Con 1000x250 el estirón baja
   a 1,20x, medido.

Y el subtítulo dice la ventaja del primero sobre el segundo. Es una resta, no una
interpretación, y es lo que hace que se lea sin estudiarlo.

**La liga se cuenta con UNA carrera, no con siete curvitas.** La columna "Evolución"
tenía una miniatura por fila. Cada una contaba la forma de esa semana por su cuenta,
pero ninguna podía contar la carrera —quién iba ganando el miércoles, cuándo se escapó
el primero—, que es la única pregunta que tiene una liga. Para eso las líneas tienen que
compartir la caja. Ahora van las siete en un gráfico arriba de la tabla. Los chips de
abajo son la leyenda Y el control.

**Y cada una lleva SU color. La versión de "una en color y el resto grises" se
probó y se cambió.** El argumento de entonces era que con siete colores a la par no
se distingue ninguna, y no era falso: es exactamente el problema que tiene una paleta
elegida a ojo. Pero la forma de énfasis tenía un agujero peor —en el medio del
dibujo, donde cuatro líneas se cruzan, no se podía seguir NINGUNA de las grises, que
es literalmente lo que reportó el usuario: "perdés la visión de la línea"—. Lo que
hace viable el color no es el gusto sino el método:

- **Los colores no se eligen, se toman de una paleta categórica documentada, en su
  orden documentado.** El orden ES el mecanismo de separación; reordenar o retocar un
  hex lo rompe. Están en `PALETA_SERIES` (`lib/chart.ts`).
- **Y se validan con el script, contra el fondo REAL.** No se razona sobre si una
  paleta es segura para daltonismo: se corre el validador. Contra `#050504`, los
  siete primeros pasan banda de luminosidad, piso de croma, separación con protanopia
  y deuteranopia (ΔE 8,4 el peor par vecino), piso de visión normal (ΔE 19,3) y
  contraste (todos ≥ 3:1).
- **Lo que NO pasa queda escrito.** El chequeo de todos-contra-todos falla: magenta y
  aguamarina colapsan con deuteranopia si quedan pegados (ΔE 1,6) y violeta y azul
  están justos con visión normal (ΔE 9,8). Se banca porque acá el color NUNCA es lo
  único que identifica una línea: cada una termina en su nombre escrito, los chips son
  leyenda y la que está en foco va a 2,6px con relleno y brillo contra 1,5px del
  resto. **Si alguna vez se usa esta paleta donde el color sea lo único, hay que bajar
  la cantidad de series — no cambiar los colores.**

**El color sigue a la PERSONA, nunca a su puesto.** Se reparte por PUUID ordenado y no
por posición en la tabla. Si saliera del puesto, el día que dos se pasan
intercambiarían de color y la pantalla diría que cambiaron de persona. El precio es
que si entra alguien nuevo al grupo, los que ordenan después de él corren un lugar y
cambian de color una vez; con un grupo fijo de seis pasa casi nunca, y la alternativa
—guardar el color en la base— es una columna y una migración para un problema que
todavía no existe.

**Dos reglas de color que se rompieron al pasar de gris a paleta**, y que valen para
cualquier gráfico del repo:

- **El texto lleva tinta de texto, nunca el color de la serie.** El nombre en foco
  estaba pintado del amarillo de la app; ahora va en blanco y la identidad la lleva la
  marca de al lado (la guía). Un nombre de color sobre negro además se lee peor.
- **La opacidad no es la que hace la jerarquía cuando hay color.** Las líneas de
  contexto estaban a 0,4 cuando eran todas grises; con colores saturados sobre negro,
  a 0,4 se vuelven barro. Subieron a 0,6 y el énfasis lo hace el GROSOR —1,5 contra
  2,6— más el relleno.

**Y el eje de esa carrera va por DÍA, no por partida.** Cada uno juega una cantidad
distinta, así que la partida 5 de uno y la 5 de otro pasaron en momentos distintos de la
semana: cruzarlas en el mismo eje no significa nada. El día es el único eje que
comparten los siete, son siete puntos (una cantidad que se lee) y no tiene el problema
de los huecos que hundió el intento del eje por tiempo. El acumulado sale de UNA sola
pasada por la secuencia entera: el bonus de racha depende del orden, así que contar cada
día por separado daría otro número que el de la tabla y la carrera terminaría en un
puesto distinto al del marcador.

**Sacar la columna liberó 190px y hubo que rehacer la aritmética de los cortes.** Con
siete columnas la banda ancha baja de 1036px a 865, y abajo de eso van las siete
apretadas. Medido con nombres reales: "ElNegroDeWhatsapp #LAS" pide 170px y entre 780 y
865 no los tenía — se arregló escondiendo el `#TAG` en esa banda (son 34px y es lo que
menos identifica de la celda) y bajando el rango de 150 a 144. Verificado en 1280, 900,
840, 831, 829, 800, 781, 770, 640, 430 y 390: cero cortes en todas.

**Varias curvas una al lado de la otra necesitan la MISMA escala, y el piso de
`minRange` no alcanza.** Vale igual para la carrera, que es donde vive ahora: las siete
líneas comparten la caja, así que comparten la escala por definición, pero hay que
calcularla sobre TODAS y no sobre la que está en foco — si no, cambiar de jugador movería
el eje y las líneas de los demás saltarían de lugar sin que haya pasado nada. La medición
que lo motivó, cuando esto era una columna: `lineAreaGeometry` escala cada serie contra
su propio techo y su propio piso. El piso de 10 tapa
una parte del problema por accidente (si todos los recorridos son menores a 10, todos
terminan escalados contra 10), pero deja dos agujeros: el **cero queda a distinta
altura en cada fila** —medido: 26, 26, 26 y 19,9 en una caja de 30— y en cuanto UNA
semana se pasa de 10 puntos las amplitudes dejan de ser proporcionales. Con
`escala` compartida: el cero a 22,3 en las cuatro filas, y una semana de +13,5 contra
una de +7,75 dibujan 18,3 y 10,5 px — razón 1,74, exactamente la de los datos (antes
eran 22 y 17,1: razón 1,29 para una diferencia real de 1,74). Con `escala` el piso
`minRange` no se aplica: el que la pasa ya miró todas las series y decide el recorrido
él (la liga usa 4 puntos, repartidos a los dos lados para que el cero no quede contra
el borde).

**Las etiquetas del techo y el piso van HACIA ADENTRO de la caja.** Por fuera se
solapaban, y por construcción: el techo es el punto más alto del gráfico, así que su
etiqueta puesta arriba se sale de la caja y aterriza sobre el encabezado
("11V-8D en 4 días"); el piso es el más bajo y la suya puesta abajo aterriza sobre el
pie ("8 sept · Bronce 1 · 1 LP"). Adentro no hay con qué chocar salvo la curva, y para
eso la etiqueta lleva su propio fondo.

**Y la etiqueta de una guía se MUEVE DE LADO, no se esconde.** Si un extremo cae en el
primer cuarto, el texto de la guía se va a la punta derecha. La línea cruza todo el
ancho, así que su texto vive igual de bien en cualquiera de las dos puntas — y
esconderlo sería peor: es lo que dice de qué división es esa línea.

**El umbral por distancia entre dos etiquetas de un SVG NO EXISTE si el SVG escala.**
Se intentó dos veces y las dos fallaron, así que queda escrito. `.lp-svg svg` va con
`height:auto`: el dibujo se escala entero con el ancho —un viewBox de 620×132 dibujado
en 324px mide 69px de alto, o sea todo comprimido a 0,52— pero las etiquetas son HTML y
miden siempre lo mismo. O sea que la separación en unidades del viewBox que hace falta
para que dos no se toquen DEPENDE del ancho al que se dibuje, y el componente no lo
sabe. Medido: dos etiquetas separadas por 53 unidades quedaban a 28px en el teléfono y
se montaban; para la caja más chica hacían falta ~75 de 132, más de la mitad del alto.
La regla que sí sirve mira el LADO, que no depende de la escala.

**Lo mismo vale para el recorte horizontal.** El `leftPct` de un extremo se recorta a
14%/86% y no a 9%: media etiqueta (~38px) son 6% del viewBox dibujado a 620px pero 13,4%
dibujado a 288, que es el ancho de la tarjeta en un teléfono. Con 9% se salía 3px de la
tarjeta ahí, medido.

**El tooltip no puede ser la única puerta al dato.** En el celular no hay hover, así
que el gráfico grande del perfil se podía mirar entero sin poder leer un solo valor.
El techo y el piso de la ventana ahora van escritos sobre el punto (`valorDePunto` en
`SparkChart`). Se saltean si caen en las puntas —el primero ya tiene su elo debajo del
gráfico y el último está en el encabezado— y el `left` se recorta a 9%/91% igual que el
tooltip: un pico en el segundo punto tiene el centro a menos de media etiqueta del
borde y se salía de la tarjeta. Se desvanecen mientras hay hover, que si no se pisan
con el tooltip. Medido a 340px de ancho de tarjeta: 44px de margen en el peor caso,
sin desbordes.

**Cambiar el espaciado del eje rompe el hover si el hover invierte un paso constante.**
`SparkChart` sacaba el índice con `Math.round((relX - padX) / stepX)`, que asume puntos
equiespaciados. Ahora busca el punto más cercano de verdad — con espaciado parejo da
exactamente el mismo resultado, y deja de depender de que el espaciado SEA parejo. Se
verificó apuntando al píxel exacto de los catorce puntos: 14/14.

**No fijarle altura a un SVG que se dimensiona solo.** `.lp-svg { height: 118px }`
contra un SVG que rendereaba ~136px hacía que el gráfico se saliera de su caja y el
pie de la tarjeta se le montara encima.

**`lineAreaGeometry` con menos de dos puntos divide por cero** y lee `points[0]` de un
array vacío. Un invocador recién agregado no tiene snapshots, y ese crash se llevaba
puesta la tabla entera. Ya tiene guarda; no sacarla.

## Diseño

**La regla que decide la plata estaba escondida.** La liga se juega por un premio y
para cobrarlo hay que cumplir dos mínimos, y la pantalla no decía en ningún lado
**quién los cumple hoy**. El que la abría veía un primer puesto y daba por hecho que ese
cobra — y puede no ser así: el premio se lo lleva el primero que además cumple, puede no
haber ninguno y la semana cerrar sin premio. Ese es el drama de toda la cosa y era
invisible. Ahora el panel de estado (`LigaEstado`) lo dice en un titular, con tres casos
bien distintos: lo cobra el que va primero (verde), hoy lo cobra OTRO porque el primero
no cumple (dorado — el caso que justifica el panel entero), o todavía no lo tiene nadie.
El color acá SÍ es el dato, no decoración.

**Y "7 sept – 13 sept" es un rótulo de archivo, no una cuenta regresiva.** Una
competencia con fecha de cierre tiene que decir en qué punto de la semana está. La barra
de siete casillas lo dice de un vistazo —cuántas pasaron, cuál es hoy— y el domingo va
marcado desde el lunes, porque es el día que decide el premio.

**"Hoy" es el único número de la tabla que se mueve.** Todo lo demás —puntaje, récord,
rango— es el acumulado de la semana y no cambia de un rato para otro. El chip de "+2,25
hoy" sale de restar los dos últimos valores de `porDia` y es lo que hace que valga la
pena volver a mirar la pantalla. Va en la columna del récord y no en la del puntaje:
habla de actividad, como la racha, y apilar un tercer número abajo del marcador lo hacía
competir consigo mismo.

**Un empate sin marcar se lee como orden arbitrario.** Con dos en +3 la tabla los ponía
uno arriba del otro sin decir por qué. En una liga con premio eso destruye la confianza
en la tabla entera, que es lo único que esa pantalla aporta. Ahora el segundo de un
empate lleva un "=" con el desempate explicado en el title.

**El respaldo del emblema de rango era un placeholder roto.** Los tiers sin arte propia
(hierro, plata, maestro y arriba) caían en un rectángulo liso con dos letras, y al lado
de las crestas de verdad "P4" en una caja gris se leía como un error de carga. Ahora es
una insignia con forma de escudo (`clip-path`), el color del tier y un aro finito: no es
el arte de Riot y no pretende serlo, pero deja de parecer roto. **Ojo**: el emblema real
lleva `clip-path:none` a propósito — es su propia forma irregular con su glow horneado,
y recortarlo en escudo lo arruina.

**Un componente que vive adentro de otro se mide con `@container`, no con `@media`.**
Esto ya se rompió una vez y vale escribirlo entero. La tarjeta de partida pasó a dos
columnas con `@media (max-width:720px)`, que mide el VIEWPORT — pero la tarjeta no ocupa
el viewport: vive adentro de la fila del perfil con el ancho que le toque. En un monitor
de 1400px la tarjeta puede medir 640 y cada columna 290, y ahí el bloque de "cómo se dio
la partida" —que tiene un eje de tiempo con los hitos ubicados en el minuto real— se
quedaba sin lugar y apilaba las etiquetas en tres renglones arriba de un gráfico
aplastado. Desde afuera parecía un problema de diseño; era un breakpoint midiendo la
cosa equivocada.

El corte quedó en **880px de contenedor** y no menos por una razón medida: es lo que
hace falta para que cada columna quede en ~430px, que es donde el 22% de `SOLAPE_PCT`
(`MatchTimeline`) vuelve a valer lo que mide una etiqueta de hito. Con columnas más
angostas, una separación expresada en PORCENTAJE deja de proteger de las
superposiciones — el porcentaje es el mismo pero los píxeles no. Verificado en ocho
anchos de contenedor, de 1120 a 360: cero etiquetas pisadas en todos.

Y la primera fila no va 50/50 sino 1,35fr contra 1fr: el relato lleva el gráfico con su
eje y la build es una tira de íconos que se arregla con menos.

**Una sola familia de chips en toda la tarjeta.** Convivían dos: los de Combate con
borde y fondo `--surface`, los de wards y objetivos sin borde y con `--surface-raised`.
De una columna no se notaba; a dos columnas quedaron uno al lado del otro y se vio que
eran de dos sistemas distintos. Ahora `.mini-breakdown-item` es idéntico a `.hecho` —
verificado propiedad por propiedad en el DOM: tamaño, padding, radio, fondo, borde y
color.

**Y la fila de objetivos no lleva rótulo, igual que la de Combate.** "Torres",
"dragones" y "barones" ya dicen que son objetivos: la palabra OBJETIVOS adelante era
redundante y se comía noventa píxeles de la primera fila, que a media columna es lo que
decide si las cinco píldoras entran en un renglón o en tres. De 3 filas ragged a 1 (o 2
en el teléfono).

**El signo de pregunta de una fila de chips va ADENTRO del flex, no al lado.** Como
hermano del contenedor se llevaba un renglón entero para sí solo —arriba o abajo de las
píldoras, según dónde se lo pusiera— porque el contenedor es ancho y lo empujaba. Se
probaron las dos posiciones y las dos fallaron igual; la que anda es pasarlo como item
más del mismo flex (`tip` en `MiniBreakdown`).

**La tarjeta de partida no es una lista, son tres filas.** Eran seis bloques apilados
—media pantalla de scroll para una partida— y la BUILD estaba al fondo de todo, abajo
de los números. No tiene sentido: con qué jugaste es parte de cómo se dio la partida, no
una nota al pie. Ahora: el encabezado (bandera + duración/CS/oro/nivel), después el
relato y la build lado a lado, y abajo los dos bloques de números lado a lado. En el
teléfono se apila igual que antes. Medido a 1000px: de una columna de seis a tres filas,
707px de alto.

**Y las tres cuotas van JUNTAS, en su propia sección.** Antes había dos en "Combate" y
una en "Visión", y son exactamente el mismo tipo de número: qué porción del equipo te
tocó. Separadas no se podían comparar entre ellas; juntas, sobre la misma escala y
contra la misma marca del quinto, se lee de un vistazo en qué pesaste y en qué no — que
es la lectura que de verdad describe una partida. Un support con 58% de las kills y 6%
del daño cuenta una historia; los mismos dos números en dos secciones distintas, no.

**Un bloque de estadísticas se siente "formulario" cuando dibuja igual tres tipos de
número que no valen lo mismo.** El detalle de partida tenía trece filas
etiqueta→valor idénticas, y ahí "% daño del equipo 14%" pesaba exactamente lo mismo que
"Primera sangre: No". Son tres cosas distintas y ahora se dibujan distinto:

- **Cuotas** (% del daño, participación en kills, participación en objetivos): son "mi
  porción del equipo". Un 14% suelto es trivia — puede ser excelente de support y un
  desastre de mid. Van como barra contra la marca del **quinto** (20%, lo que toca si
  los cinco aportan igual), que es una referencia gratis y que cualquiera entiende. El
  dorado marca estar por encima; abajo NO va en rojo, porque estar abajo del quinto no
  es un error: un support tiene que estar abajo. **La participación en kills va sin
  marca**: no es una quinta parte de nada, es en cuántas kills estuviste, y ponerle un
  20% sería inventar.
- **Magnitudes** (daño, visión): ficha con el número grande arriba y la etiqueta chica
  abajo, que es el orden en que se los mira.
- **Hechos** (skillshots, solo kills, primera sangre, pentakills, objetivos): chips en
  un renglón. Los que no pasaron se apagan en vez de desaparecer — un 0 en solo kills
  es información para el que esperaba tener alguno— salvo los booleanos en falso, que
  directamente no van: "Primera sangre: No" se comía una fila entera para no decir
  nada.

**Las fichas van en grilla con `auto-fit`, no en flex.** Con flex, una ficha sola en el
segundo renglón —el caso del support, que tiene cinco— crecía hasta el ancho completo y
se leía como un bloque aparte en vez de como la quinta de la fila. `auto-fit` colapsa
las columnas vacías, así que tres fichas siguen repartiéndose todo el ancho.

**Un dato repetido en todas las filas deja de ser un dato.** La tabla de la liga tenía
"se anotó el martes" abajo de los seis nombres —se anotaron todos el martes, es la
primera semana— y "0 / 3 último día" en cinco de seis, porque el último día todavía no
había empezado y nadie podía haber jugado. Dos renglones y un chip por fila que no
distinguían a nadie, no se podían accionar y le sumaban alto a cada fila. Ahora "se
anotó el" se esconde si lo dice TODA la tabla, y el cupo del último día no aparece hasta
que el último día arranca — la regla ya está escrita arriba, en la tira de reglas. La
regla general: antes de agregar una insignia a una fila, preguntarse qué filas NO la van
a tener.


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

**El `1fr` de una grilla va donde ESTIRA BIEN, no en el texto.** En la liga el `1fr`
estaba en el nombre: a 1210px se quedaba con 622px de los que usaba 150, y un nombre
flotando en medio de un hueco enorme es lo que hace que una tabla se lea como
planilla. El espacio tiene que ir a algo que crezca con sentido — una barra de
volumen (un div con ancho en %) estira perfecto y cuanto más larga mejor cuenta. Lo
que **no** puede recibirlo es un `SparkChart`: usa `preserveAspectRatio="none"` y se
deforma, así que su columna se queda en el ancho que se le pasa por prop.

**El orden de las columnas ES la jerarquía.** En la liga el récord (`7V − 4D`) estaba
separado de las netas por la curva de LP, y la curva ocupaba el lugar de la derecha —
el del marcador. Resultado: dos números grandes compitiendo por ser "el score" y la
resta que explica el puntaje sin conexión visual con su resultado. El orden ahora es
puesto → quién → rango → curva → RÉCORD → NETAS: lo que explica el dato va pegado al
dato, y lo secundario al medio. No hizo falta cambiar tamaños ni colores.

**En el teléfono, antes de angostar una columna más, romper la fila en dos renglones.**
La fila de la liga tenía cinco columnas de datos en 390px y la que se comía el
sobrante era el nombre: 20px, o sea, no se leía de quién era la fila. Abajo de 480px
ahora el puesto, el avatar y las netas ocupan dos renglones y en el medio va el nombre
arriba y el récord abajo. Angostar hasta que algo desaparece no es responsive.

**El breakpoint de una grilla se CALCULA, no se elige.** Una fila de N columnas
necesita `suma de los mínimos + gaps + padding de la fila + padding de la app` para que
ninguna columna baje de su mínimo; abajo de eso las columnas se pisan y —con
`overflow:hidden` en la tabla— no aparece scroll ni ellipsis, simplemente se corta el
texto. La fila de la liga rompió así dos veces: el corte estaba en 640 cuando las siete
columnas necesitaban 766, y después en 900 cuando las ocho necesitaban 1036. Las dos
las encontró la medición, no el ojo. Hoy son: 8 columnas desde 1036, 7 desde 781, y
abajo de eso la fila de dos renglones.

**Dar vuelta un flex a columna cambia qué significa `align-self`.** Los grupos del
encabezado del ladder traen `align-self:center` para centrarse VERTICALMENTE contra el
título mientras la fila es horizontal. Al apilar el `.section-head` en el teléfono, el
eje cruzado pasa a ser el horizontal y ese mismo `center` los mandó al medio de la
pantalla: el título quedaba centrado y el resto de la app a la izquierda. Cada vez que
un `flex-direction:row` pasa a `column` hay que revisar los `align-self` de adentro.

**`min-width:0` es viral hacia abajo.** No alcanza con ponerlo en el hijo directo del
`1fr`: cada flex anidado que tenga que poder achicarse necesita el suyo. En la fila de
"Últimas partidas" lo tenía `.match-mid` pero no `.match-top-line`, así que el nombre
del campeón + "Para repasar" + "DERROTA" se desbordaban; y como la fila tiene
`overflow:hidden`, no aparecía scroll ni ellipsis: se dibujaba **encima** de la columna
de al lado. Un texto pisando a otro casi siempre es esto.

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

**La cuadrícula de días de la liga es de días CALENDARIO argentinos, y hay que
normalizar al lunes 00:00.** La barra de la semana marcaba "viernes" un sábado. No era
la base ni el huso: se le pasaba el arranque de la VENTANA, y la primera semana de la
liga arrancó un lunes a las 23:30, así que los "días" eran bloques de 24 horas corridos
desde las 23:30 —de viernes 23:30 a sábado 23:30— etiquetados con el día en que
EMPIEZAN. Un bloque 97% sábado se llamaba viernes. Medido el sábado 12/9 19:14 ARG: con
el arranque de la ventana daba 5 días corridos, con el lunes 00:00 da 6.

Ahora `diasCorridos`, `etiquetasDeDias` y `puntosPorDia` normalizan con `inicioDeSemana`
adentro, así que da igual qué instante de la semana se les pase — el error no se puede
repetir desde afuera. Probado hora por hora sobre las 168 de la semana: las 168 marcan
el día que es.


**Argentina es UTC-3 todo el año** (no hay horario de verano desde 2009). La
conversión vive en un solo lugar: `lib/liga.ts`. No duplicarla.

**Un 429 de Riot en el refresco se reintenta, no se da por perdido.** Se vio en
producción: dos de catorce invocadores quedaron 29 minutos atrás mientras los otros
doce estaban al día, y los dos habían fallado con 0,16 segundos de diferencia — la
firma de una pared de rate limit, no la de un puuid roto. `repairMatches` ya trataba
el 429 como "hay que frenar la tanda", pero el ciclo de refresco no lo trataba nadie:
subía al `catch` genérico de `refreshAllSummoners` y ese invocador se perdía la
corrida entera (sin `last_refreshed_at`, porque se escribe recién al final de
`refreshOne`). Ahora los que se comen un 429 se apartan, se espera lo que pidió Riot
—con tope de 60s, para no comerse el `maxDuration`— y se reintentan **de a uno**:
volver a lanzar cuatro en paralelo es chocar contra la misma pared. Los errores que
NO son rate limit no entran al reintento: un puuid que devuelve 404 no se arregla
esperando.

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

**Una victoria no puede sumar más de `TOPE_LP_POR_VICTORIA` (hoy 22).** Riot le da
bastante más LP por partida a una cuenta nueva, porque su MMR real está muy por
encima del rango que muestra: se vio un 4V-1D dando +141 al lado de otro 4V-1D dando
+54. En una liga por LP neto eso no es jugar mejor, es tener otra tabla de premios.
El tope se aplica **por victoria** y para eso hay que caminar foto por foto en vez de
restar las dos puntas — se puede porque `lp_snapshots` guarda `wins`/`losses` al lado
del `lp`, así que la diferencia entre dos fotos consecutivas dice exactamente cuántas
se ganaron en el medio. Las derrotas NO se topean: taparlas pediría un piso, o sea
inventar derrotas más caras que las reales. La curva se dibuja con los mismos tramos
topeados que el número, o el gráfico y el neto se contradirían.

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
