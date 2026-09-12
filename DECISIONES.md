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

**El gráfico grande de LP es una ESCALERA, y eso no se vuelve atrás.** El LP no se
mueve solo: entre dos fotos se queda quieto y salta de golpe cuando termina una
partida. Cualquier diagonal entre dos puntos afirma un movimiento gradual que no
existió — y no es un problema de huecos ni de espaciado, pasa igual entre dos fotos
pegadas. Por eso el eje por tiempo no lo arreglaba y por eso se revirtió: el problema
nunca estuvo en la X. El salto se dibuja en la foto NUEVA, que es lo único que se sabe
(la partida cayó en algún momento del tramo y recién en la segunda foto se la ve);
ponerlo al principio sería inventar el momento. Verificado sobre el path: 0 diagonales,
11 tramos horizontales y 9 verticales. Las juntas van en punta y no redondeadas — el
chiste es que el salto se vea seco.

**Los chiquitos NO van en escalera.** La sparkline de veinte puntos en una caja de 28px
se convierte en un peine. Ahí el gráfico es el respaldo de un número, no el dato en sí,
y la curva suave sigue siendo la forma correcta.

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
compartir la caja. Ahora van las siete en un gráfico arriba de la tabla, una en color y
el resto en gris: con siete colores a la par no se distingue ninguna, y bajo daltonismo
menos. Los chips de abajo son la leyenda Y el control — sin ellos, siete líneas grises
no dicen de quién es la pintada.

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
