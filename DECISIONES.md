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

**`summoners.discord_id` es opcional a propósito, y el bot tiene que andar sin
ella.** Ata un usuario de Discord a su invocador, pero es una comodidad —hace que
`/ultima` sin argumentos conteste "la tuya"— y no un requisito: los comandos resuelven
por nombre con autocompletado. Si se hubiera hecho obligatoria, el bot no habría
servido hasta terminar de juntar los catorce ids a mano. Por eso `porDiscord` traga el
error de "la columna no existe" y sigue de largo, igual que `/api/liga` con
`liga_ajustes`.

**La opción `jugador` de los comandos es texto con autocompletado, no de tipo USER.**
Con USER, Discord manda un id de Discord y el bot no sabe a qué invocador corresponde
hasta que esa persona esté vinculada — o sea, el bot no serviría hasta terminar la
migración de arriba. Con autocompletado la lista sale de la base (no hay forma de
escribir mal un nombre) y el valor que viaja es el **puuid**, así que la resolución es
exacta y no por nombre parecido.

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

**El área táctil se agranda con `pointer:coarse`, no con tamaños más grandes para todos.**
Auditado a 390px: siete controles quedaban abajo de 32px de alto —o sea más chicos que la
yema de un dedo—, y el peor era "ver los números" con **15px**, que es la puerta de entrada
a la grilla del día a día. Lo que crece es el ÁREA, no el dibujo: `padding-block` para
agarrar el toque y un `margin-block` negativo que lo compensa, así en pantalla no se mueve
nada. Y solo en pantallas de dedo, porque con mouse el control chiquito está bien y crecer
le rompería el ritmo a la línea donde vive.

**Medir esto en Playwright tiene una trampa que cuesta una hora.** Chromium le devuelve el
puntero FINO a la página en cuanto algo la toca —un tap, un `.click()` disparado desde JS,
el overlay de error de Next—, así que la media query deja de aplicar y la auditoría mide la
versión de escritorio creyendo que mide la del teléfono. Ni `hasTouch`, ni reaplicar
`Emulation.setEmulatedMedia` por CDP antes de medir lo evitan. Lo que funciona: **renderizar
cada estado ya abierto, sin una sola interacción**, o —para lo que solo existe con algo
abierto— inyectar las mismas declaraciones sin el `@media` y medir eso.

**La barra de secciones son TABS SUBRAYADOS, sin cápsula.** Tercera versión, y la última
ronda revirtió a la anterior — lo de abajo queda como historia, no como instrucción.

El pedido fue textual: la cápsula hacía que la navegación se leyera como *"un segmented
control / selector de filtros"* y no como la navegación principal de la app. Es correcto
y es de forma, no de color: un contenedor con fondo propio que ENCIERRA opciones es la
figura de un filtro. Ahora no hay contenedor; el activo es texto dorado con una barra de
2px abajo.

Lo que hace que esto cierre, y que es lo que faltaba las dos veces anteriores:

- **La línea del navbar y el separador del header son la MISMA línea.** Antes había dos
  rayas a catorce píxeles una de otra —una para cerrar el header, otra para el navbar— y
  eso es lo que hacía que se leyeran como dos componentes apilados. Con una sola, la
  identidad y la navegación son un bloque y la raya separa ESE bloque del contenido. El
  argumento de la ronda anterior ("sin borde en la barra, la cápsula es la única caja") se
  cae solo cuando la barra vuelve a tener línea.
- **El riel va en `.navbar`, no en `.tabnav`.** La barra es sticky: la línea tiene que
  viajar pegada arriba con ella y no quedarse con el contenido.
- **El indicador existe siempre y lo que cambia es su color**, no su tamaño. Así el texto
  no se mueve un píxel al cambiar de pestaña.
- **El aire de arriba va en `.navbar` y no en el margen del header.** Es lo único que se
  ve cuando la barra está fijada arriba de todo; puesto en el header, al scrollear
  desaparece y las pestañas quedan pegadas al borde de la pantalla.
- **La navegación se alineó a la izquierda**, al mismo borde que la identidad del header
  (medido: las dos en x=70). Centrada le rompía esa columna.

Y una trampa de mantenimiento que costó una vuelta: `.tab-btn.is-active` estaba definido
DOS veces, arriba con el resto del componente y otra vez trescientas líneas más abajo.
Ganaba el de abajo por orden, así que tocar el de arriba no hacía nada. Ahora hay uno
solo. Dos fuentes para el mismo estado es cómo se rompe un componente sin que nadie toque
el lugar que parece.

---

*Historia — lo de acá abajo YA NO ESTÁ EN EL CÓDIGO:*

**La barra de secciones es una CÁPSULA centrada, y el activo vuelve a ser una píldora
llena.** Esto revierte a propósito una decisión anterior: el activo había pasado de dorado
sólido a superficie elevada con texto dorado, para que el dorado siguiera siendo un acento
y no un cartel. Lo que cambió no es el criterio sino el contenedor — adentro de una
cápsula, el relleno ya no grita en medio de la pantalla: es la única pieza pintada de una
barra que por lo demás es gris sobre negro, y ahí "en qué sección estoy" se contesta sin
leer.

Tres cosas que hacen que funcione y que son fáciles de romper:

- **La franja de borde a borde se fue.** El comentario viejo decía que una píldora adentro
  de otra franja se lee como dos cajas discutiendo cuál manda, y era cierto MIENTRAS la
  barra tenía su propio borde inferior. Sin ese borde hay una sola caja: la cápsula
  flotando sobre el fondo. El sticky y el blur siguen, que es lo que de verdad hacía falta.
- **El atajo ⌘K salió del flujo** (`position:absolute`). Con `space-between` la cápsula
  quedaba corrida a la izquierda exactamente lo que mide ese botón: centrar de verdad
  significa que lo accesorio no empuje. Medido: 402,4px de margen izquierdo contra 402,5
  del derecho.
- **En el teléfono el centrado se apaga.** Centrar algo que no entra le come el principio
  —la primera pestaña arranca cortada por la izquierda— así que abajo de 640 vuelve a
  `flex-start` y la barra scrollea.

Y el hover pinta la MISMA forma, más apagada, con `:not(.is-active)` para que pasar el
mouse por la activa no la apague. Antes solo aclaraba el texto: no había nada que dijera
"esto es un botón del tamaño de esta pastilla".

**"pts" no se usa más para LP: es la unidad de la LIGA.** El delta del sparkline decía
"▲ 72 pts" al lado de un "+7,25" de la liga: dos escalas completamente distintas con el
mismo nombre, en la misma app. "pts" había nacido de un problema real —el delta es de
`rankScore`, no de LP crudo, y etiquetarlo "LP" a secas mostraba "Platino 3 · 64 LP →
Platino 2 · 36 LP ▲72 LP", un avance de 72 al lado de un número que visiblemente bajó—
pero la salida no era inventar una unidad: `rankScore` sube de a 100 por división y 400
por tier, o sea la MISMA escala que el LP, así que la diferencia son **LP netos** y punto.
El perfil ya lo decía así desde antes; faltaba en el ladder, en el tooltip del gráfico y en
la pestaña Equipo. Verificado que la etiqueta larga entra a 1280, 820 y 390px.

Lo único que sigue diciendo "pts" es la maestría de campeón, que son puntos de maestría de
Riot y no tienen nada que ver con ninguna de las dos escalas.

**"Hace un día" y "ayer" NO son lo mismo, y confundirlos ya rompió dos cosas.**
`formatRelativeDate` hacía `(ahora − entonces) / 24h`, o sea que medía tiempo
TRANSCURRIDO y lo escribía como si fuera una casilla del calendario. Una partida del lunes
20:32 mirada el martes 11:54 da quince horas, o sea "0 días", o sea **"hoy"**: un martes al
mediodía, cuatro partidas del lunes a la noche decían todas "hoy". Reportado por el
usuario, no encontrado leyendo.

Es la MISMA trampa que ya había roto la barra de días de la liga (ver `diasCorridos`): ahí
los "días" eran bloques de 24 horas corridos desde las 23:30, y un bloque que era 97%
sábado se llamaba viernes. Dos veces el mismo error en el mismo repo, así que la regla:
**todo lo que diga "hoy", "ayer" o un día de la semana se cuenta por día CALENDARIO
argentino** —restar el huso y truncar—, nunca por milisegundos transcurridos. Lo que sí va
por tiempo transcurrido es "actualizado hace 6 min", que mide otra cosa.

**Y toda fecha se escribe en hora argentina, siempre.** Auditado: las doce llamadas a
`toLocaleDateString` de la app declaran huso. Tres no lo hacían —el rango de la pestaña
Equipo, las puntas del gráfico de LP y su tooltip— y usaban el reloj del que mira, así que
una partida de las 22 de un 30 se escribía "1 sep" para cualquiera con el reloj adelantado.
Las de `lib/liga.ts` que formatean en `UTC` no son excepción: ahí se le resta
`ARG_OFFSET_MS` al instante ANTES de formatear, que es la misma cuenta por otro camino.

**`es-AR` sin `hour12` devuelve DOCE horas.** `toLocaleTimeString("es-AR", { hour:
"2-digit", minute: "2-digit" })` parece obvio y da `"09:14 p. m."` en Chrome, mientras el
resto de la app escribe 24 ("cierra 23:30", que sale de `horaCorta` en lib/liga.ts y
formatea a mano). Estaba mal en tres lugares —el perfil, el arranque de la liga y el
historial de Clash— y lo agarró una medición del DOM, no una lectura: en el código las
tres líneas se ven bien. **Si se escribe una hora nueva, va con `hour12: false`.**

**Y cada partida muestra CUÁNTO DURÓ, que es lo que hace auditable el filtro de
remakes.** El filtro vive en el servidor (`DURACION_MINIMA_S`) y es invisible: hasta que
la duración estuvo en pantalla, había que creerle. Ahora se verifica de un barrido
vertical — si todas dicen veinte o treinta minutos el filtro anda, y si alguna vez aparece
una de cuatro es un bug que grita, porque esa partida no tendría que estar en la lista ni
haber restado 0,75. Probado plantando un remake de 231 segundos en la lista: sale "4m"
entre un "40m" y un "37m" y no hay forma de no verlo.

Va en minutos y no en "28:14": el número está para auditar, no para cronometrar. Lo que
tiene que saltar es la diferencia entre 28 y 4, y los segundos en una columna de cuarenta
filas son ruido que tapa justamente eso. Y es el dato más apagado de la fila a propósito:
no es del partido, es del control — nadie viene a leer cuánto duró cada una.

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

**Una derrota con un aliado ido no resta en la liga, y eso SÍ es solo de la liga.** Mismo
principio que el remake —si Riot no te saca LP, la liga no te saca puntos— pero con el
alcance al revés. El remake no pasó para nadie, así que se filtra en toda la app. Un AFK
sí pasó: es una derrota de verdad en el récord de la cuenta, y si el ladder la escondiera
diría algo distinto de lo que dice el cliente de LoL. Entonces el filtro
(`.or("win.eq.true,ally_afk.eq.false")`) va solo en las dos consultas de la liga,
`/api/liga` y `lib/liga-cierre.ts`.

**Riot no expone la mitigación.** No hay ningún campo que diga "esta derrota te salió más
barata". Por eso la pregunta se da vuelta: en vez de preguntar si mitigó, se mira si
alguien del equipo dejó de jugar. Lo que se detecta es "se fue un aliado", no "Riot
mitigó" — parecido pero no idéntico, y la diferencia queda a favor del jugador a
propósito.

**Probada y descartada: detectarlo por el LP perdido.** Una derrota de −8 en vez de −18
está mitigada y el dato ya está en pantalla, así que parecía gratis. Es una trampa: el LP
sale de comparar dos fotos de `lp_snapshots` y queda en null cuando dos partidas caen
entre las mismas dos fotos o cuando la foto de después todavía no llegó. El puntaje de la
liga habría dependido de a qué hora corrió el cron, y la tabla se habría movido sola
días después.

**Probada y descartada como detector principal: `timePlayed`.** Parecía la respuesta
obvia —Riot manda los segundos que jugó cada uno, el que se fue tiene menos— y la primera
versión salió así. Falló contra la primera partida real que tenía que agarrar: los
**diez** jugadores con `timePlayed: 1470` en una partida de 1470 segundos, con un
Renekton que terminó en **nivel 9 con 5.132 de oro** mientras sus compañeros estaban en
12, 14 y 14. `timePlayed` mide **tiempo conectado**, no si jugó, y el que se queda parado
en la base nunca se desconecta. Mover el umbral no servía: el número era cero, no chico.
Quedó como respaldo para cuando el timeline no viene, que es lo único que sí agarra.

**Lo que decide es la EXPERIENCIA del timeline, y el oro no sirve.** Parado en la fuente
seguís cobrando los ~20 de oro pasivo cada diez segundos, así que `totalGold` sube igual
que el de cualquiera. La experiencia solo entra si hay algo muriendo cerca: en la base es
exactamente cero. `minutosSinJugar` (`lib/timeline.ts`) devuelve la **racha más larga** de
minutos seguidos sin ganar experiencia, y con cinco alcanza. Es la racha y no el total a
propósito: cinco minutos sueltos repartidos en media hora son muertes largas y recalls,
cinco pegados no le pasan a nadie que esté jugando —ni al que va 0/10, que igual gana
experiencia mientras se la pierden—. Y no cuesta una llamada más: el timeline ya se baja
para cada partida por los `gold_diff_*`.

**Y esta vez sí hubo columna nueva** (`matches.ally_afk`), al revés que con el remake. No
había alternativa: `timePlayed` es por jugador y la base guarda una fila por jugador
nuestro, así que el payload con los diez solo existe en el momento de escribir. Se decide
ahí, una vez, y no cambia nunca más. Las filas viejas quedan en `false` —o sea, cuentan
como antes— hasta que pase `/api/repair`, que las vuelve a armar con `buildMatchRow` y de
paso les pone el flag.

**Solo aliados, nunca uno mismo**: si el que se fue fuiste vos, Riot te cobra la derrota
entera y encima el LeaverBuster. Los cortes del respaldo por `timePlayed` son
`faltante >= 300s` **Y** `faltante/duración >= 0,2`, juntos porque cada uno tapa el
agujero del otro: la fracción sola deja pasar al que abandona a los 30 de una de 40, los
cinco minutos solos marcan como abandono una reconexión corta en una de una hora.

**Lo que NO agarra**: al que se queda jugando pero trollea —compra lo que no va, pelea
sola, se tira a la torre—. Ese gana experiencia como cualquiera y es indistinguible de
alguien que juega mal, que es justamente lo que la liga sí tiene que cobrar. Para eso no
hay dato: haría falta poder anular una partida a mano.

**La victoria con un aliado ido sí cuenta.** Ganar con uno menos da LP completo y tiene
más mérito, no menos. Solo se descarta la derrota.

**Para el puntaje se descarta entera, pero en pantalla se ve.** No resta, no suma, no
corta la racha, no decide el campeón de la semana y no cuenta para las 10 del mínimo: en
el cálculo no existe, igual que un remake. En el desglose, en cambio, aparece apagada y
diciendo "no contó".

La primera versión la filtraba también en pantalla, con un `.or()` en la consulta, por
consistencia con los remakes. Estaba mal y se vio al primer uso: **un remake no se jugó y
no lo extraña nadie; una derrota que sí pasó y no está en ningún lado parece que la app se
comió una partida.** El desglose existe justamente para ser la PRUEBA de dónde sale el
puntaje —la liga se juega por plata entre gente que ya desconfía del cálculo—, así que
esconder una partida es esconder la prueba. Dice "no contó" y no "0 pt" porque el cero se
lee como un resultado del cálculo, y lo que pasó es que quedó afuera.

Como consecuencia el filtro salió de la consulta y pasó a JS (`cuentan` contra `suyas` en
`/api/liga`), y eso arregló dos cosas de paso: **`lpPorPartida` ahora ve todas las
partidas del tramo**, así que reparte bien el LP en vez de atribuirle a una lo que
movieron dos; y el valor de cada partida se indexa **por `match_id` y no por posición**
—antes era `valeCadaUna[suyas.length - 1 - i]`, y con una sola anulada en el medio todo
lo anterior quedaba corrido un lugar—.

**Un ajuste a mano va en su propia tabla, nunca en `matches`.** Cuando el grupo votó
restarle 2 puntos a alguien por cambiar de cuenta a mitad de semana, la salida rápida era
meterle dos derrotas falsas. Hay que no hacerlo nunca: `matches` alimenta también el
ladder, el KDA, los récords personales, los títulos del cierre y las cargadas del bot, así
que un ajuste de UNA semana le ensuciaría el historial para siempre y el bot terminaría
cargando a alguien por una derrota que no existió.

Va en `liga_ajustes`, con PK `(semana, puuid)`. **Por semana y no como columna de
`summoners`** porque una penalización es de una semana puntual: así la siguiente arranca
limpia sola, sin depender de que alguien se acuerde de borrarla. `motivo` es `not null` y
se muestra al lado del nombre —"−2 · cambió de cuenta"—, con el color de alerta y no en
itálica apagada como el resto de las aclaraciones de la fila: es el único dato del puntaje
que no salió de una partida, y un número movido por fuera de la Grieta que no dice por qué
es lo que hace que alguien desconfíe de toda la tabla.

**El ajuste entra también en la curva, y en los siete días.** `porDia` se corre entero en
paralelo. Si el gráfico dibujara el puntaje sin ajustar, la línea terminaría dos puntos
arriba del número que tiene al lado — la misma contradicción que el código ya evita entre
`puntosDeSecuencia` y la curva. Y se corre parejo en vez de meterle un escalón a un día
porque la penalización no pasó un martes: vale para toda la semana.

**Lo que el ajuste NO toca**: victorias, derrotas, los mínimos (10 semanales y 3 el último
día) y `sinJugar`. Al que lo penalizaron sin haber jugado le queda "−2" y "todavía no
jugó" al mismo tiempo, que suena raro pero es exactamente lo que pasó.

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

## El bot de Discord

**HTTP Interactions, no gateway.** Un bot "de verdad" suele ser un proceso corriendo
con una conexión abierta, y eso en Vercel no existe. El modo de interacciones HTTP es
otra cosa: se le da una URL, Discord hace POST cuando alguien tipea, y el bot es un
route handler más. Es lo que hace que la idea entre en el plan Hobby.

**Todos los comandos contestan diferido (tipo 5), incluidos los que salen de
Supabase.** El análisis original decía que para lo que sale de la base alcanzaba con
contestar derecho adentro de los 3 segundos de Discord. Alcanza para la consulta; lo
que no entra seguro es la consulta **más levantar la función desde cero**, que es el
caso normal en un canal donde nadie tipea un comando hace una hora. Diferir cuesta una
llamada HTTP más y sube el techo de 3 segundos a 15 minutos. El trabajo va en
`after()` y después edita el "pensando…" — el mismo patrón de `/api/cron/refresh`.

**El autocompletado es la excepción y NO se puede diferir**: Discord quiere las
opciones en el momento o no muestra nada. Por eso es una sola consulta a una tabla de
catorce filas, y si falla devuelve la lista vacía en vez de un error.

**Cada tipo de interacción tiene que contestar con SU tipo de respuesta.** Mandarle un
mensaje (tipo 4) a un autocompletado lo rechaza Discord y el que está tipeando ve un
error rojo en vez de una lista vacía. Apareció al probar el camino de "falta la
variable de Supabase", que contestaba tipo 4 para todo.

**Cada respuesta del bot lleva el "actualizado hace X" al pie.** En la web ese cartel
está al lado del dato y se entiende solo; en un canal el mensaje queda ahí para
siempre y a los diez minutos ya no se sabe si es de ahora o de anoche. No es
decoración: es lo que evita que alguien discuta una tabla vieja.

**El pie de "no cobra nadie" sale SOLO el último día.** Uno de los mínimos es jugar 3
el domingo, así que de lunes a sábado no lo cumple nadie y la línea saldría los seis
días diciendo algo que no es una noticia — hasta que el domingo, cuando sí lo es, ya
nadie la lee.

**Que un comando conteste NO prueba que los anuncios funcionen.** Son dos caminos
distintos y se confunden fácil: la respuesta a una interacción viaja por el token de esa
interacción y anda sin importar los permisos del canal, mientras que un anuncio va por
`POST /channels/{id}/messages`, que necesita que `DISCORD_CHANNEL_ID` sea el correcto y
que el bot pueda escribir en ESE canal. Y como el anuncio cae al webhook cuando falla,
el mensaje sale igual: el síntoma es que no hay síntoma. Para eso está
`POST /api/discord/probar`, que sin body pregunta quién es el bot y qué canal ve —sin
escribirle a nadie— y con `{mandar:true}` manda, reacciona y borra. Ese sí **no** cae al
webhook a propósito: un fallback en el diagnóstico contestaría que todo anda sin haber
probado lo que se quería probar.

**Los anuncios salen por el token del bot y caen al webhook si no está.** Los dos
caminos existen a propósito y no hay que "limpiar" uno: el día que se rote el token,
el parte diario de esa noche no se puede perder. Lo que el webhook no puede hacer —y
era el motivo de que las votaciones necesitaran una mano humana— es **reaccionar a su
propio mensaje o editarlo**: no tiene identidad. Con el bot, el 👍 del aviso de
arranque queda puesto solo.

**`sendDiscordNotification` devuelve un booleano.** Era `Promise<void>` y
`/api/liga/diario` ya hacía `const ok = await sendDiscordNotification(...)`: el
`mandado` de esa respuesta venía `undefined` y en el log del scheduler un parte
mandado se veía igual que uno perdido. El webhook ahora se llama con `?wait=true`,
que es lo que hace que Discord conteste el mensaje creado en vez de un 204 vacío — sin
eso el booleano no podría significar nada.

**Las definiciones de los comandos viven en un JSON**, no en el `.ts`.
`scripts/registrar-comandos.mjs` es JavaScript suelto y no puede importar TypeScript;
con el JSON los dos leen lo mismo y no hay forma de registrar un comando con una
descripción y responderlo con otra. Y se registran con **PUT y no POST**: PUT
reemplaza la lista entera, así que un comando que se saca del JSON desaparece del
menú. Con POST quedaría registrado para siempre.

**El registro de comandos tiene dos puertas, y la que se usa es la del navegador.**
`scripts/registrar-comandos.mjs` fue lo primero, y asume una consola con Node — que en
este proyecto no siempre hay: acá se trabaja desde la consola del navegador, que es la
misma forma en que se corre `/api/repair`. Por eso existe además
`POST /api/discord/registrar`, que hace lo mismo del lado del servidor y de paso evita
que el token del bot tenga que estar en la máquina de nadie. El script queda porque
sigue sirviendo para el que sí tiene Node, y los dos leen el mismo JSON.

**Registrar los comandos no es parte del deploy.** El código de los comandos se
despliega con la app como cualquier ruta; lo que registra el script es el menú que
Discord muestra al tipear "/". Son dos cosas distintas, y esa es la confusión típica:
si agregás un comando y no corrés el script, funciona pero no aparece en la lista.

## La ventana del torneo es un dato, no una deducción

**La liga no tenía fechas: las deducía.** `inicioDeSemana(ahora)` calculaba el lunes y
`finDeSemana` le sumaba siete días. Eso alcanzó mientras un torneo fuera siempre una
semana de lunes a domingo, y dejó de alcanzar el día que hubo que agregarle un lunes
porque había gente que no podía jugar el domingo.

**Y el "7" no era un número suelto.** Estaba clavado en `diasCorridos`
(`Math.min(7, …)`), en `etiquetasDeDias` (un array de largo 7), en `mensajeDelDia`
(`if (dias >= 7) return null`) y —el peor— en `LigaSemanal.tsx`, en una guarda
`d.dias.length === 7` que hacía desaparecer el panel entero de la pantalla. O sea que
con un parche que solo moviera la hora de cierre, el día que se agregaba era justo el
día en que el bot se callaba y la barra de la semana no se dibujaba. Por eso hubo que
hacerlo bien y no alcanzaba con un atajo.

**Sin la tabla `liga_torneos`, todo sigue exactamente igual.** `torneoDerivado` arma el
lunes a domingo de siempre con los mínimos de siempre, así que el código se puede
desplegar antes de correr la migración. Verificado: la tabla de la liga da fila por fila
lo mismo antes y después del cambio.

**El cierre es EXCLUSIVO y es la confusión número uno.** Para que un torneo termine el
domingo a la noche, `cierra_at` es el lunes a las 00:00. Por eso la aclaración está al
lado del campo en el panel y no en un tooltip.

**`ultimo_desde` se guarda y NO se deduce del cierre.** Podría calcularse como "las
últimas 24 horas", que es lo que se venía haciendo, pero entonces extender un torneo en
curso movería el último día solo — y le cambiaría la regla a alguien que ya organizó su
semana para cumplir el mínimo el domingo. Guardándolo, esa decisión se toma a mano.

**Dos torneos no se pueden pisar.** `torneoDe` tendría que elegir, y elegir mal significa
calcular la tabla con la ventana equivocada sin que nada avise. La API lo rechaza con un
409 antes de guardar.

**Un torneo ya cerrado no se edita.** Su foto está en `liga_semanas` y se anunció un
ganador; mover las fechas después dejaría la pantalla contando una cosa y el anuncio
otra. Un resultado ya anunciado es un hecho (ver `resumen` en `supabase/schema.sql`).

**El día de cierre NO se escribe a mano en la pantalla.** `LigaEstado` decía "Cierra el
domingo" y "Se define el domingo" como texto fijo, y con el torneo extendido al lunes
pasó a ser mentira sin que nada avisara — el tipo de bug que solo se ve mirando. Ahora
sale de `diaDeCierre`/`diasDelCierre`, del lado del server porque el huso es argentino.

**Y el mínimo del final puede cubrir más de un día.** Al extender el torneo al lunes
dejando `ultimo_desde` en el domingo, la ventana del mínimo pasó a cubrir DOS días: las
3 partidas se pueden hacer el domingo o el lunes. Es deliberado —nadie pierde lo que
venía planeando y el que no puede el domingo lo resuelve el lunes— así que la pantalla
dice "el domingo o el lunes", con "o" y no con "y": son días alternativos, no dos días en
los que hay que aparecer en los dos.

## El verde y el rojo NUNCA pueden ser la única pista

**Medido, no razonado.** El validador de la skill `dataviz`, corrido contra el fondo real
(`#050504`), da entre `--good` (#34C97C) y `--critical` (#F0555F) un **ΔE de 7,1 en
deuteranopía**: para alguien con el daltonismo más común esos dos colores se parecen. Cae
en la banda 6–8, que la skill admite **solo con codificación secundaria**.

En la grilla del día por día esa codificación es el **signo**: `puntajeTexto` escribe
"+1,75" y "−1,25" siempre. Por eso el tinte de fondo proporcional es legal — el color
ayuda a encontrar el día grande de un vistazo, pero el que no distingue verde de rojo lee
el signo igual. **Si alguna vez se saca el signo de una celda, el tinte tiene que salir
con él.**

El validador además marca un FAIL de banda de luminosidad para el verde (L 0,741 contra
un techo de 0,67 en modo oscuro). No se tocó: `--good` se usa en una quincena de lugares
de la app y cambiarlo es otro trabajo, con su propia revisión. El contraste contra el
fondo pasa, que es lo que importa para leerlo.

**Los dos tintes de la grilla son de tipos distintos, y eso no es decoración.** En
"Puntos" es DIVERGENTE —dos tonos y el negro como punto neutro— porque el dato tiene
polaridad: sumó o restó. En "Puesto" es SECUENCIAL —un solo tono, el dorado, más fuerte
cuanto mejor el puesto— porque ahí no hay polaridad sino magnitud. Mezclarlos (rojo para
el último) diría que salir octavo es "malo" en el mismo sentido en que restar puntos lo
es, y no es lo mismo.

**Y el tinte lleva un piso.** Escalado puro contra el pico de la grilla, un día de +0,5
contra un pico de +11 da 0,01 de opacidad — negro, igual que el día en que no jugó. El
piso de 0,05 los separa, que es justo lo que la grilla distingue.

## Los hitos salen medidos, no a ojo

**Un récord personal sin mínimo de historial es spam.** Medido contra las 1058 partidas
guardadas, "rompió su máximo de kills, daño o CS" salta en **114** — una de cada nueve —
porque al principio de un historial casi todo es un récord. Con treinta partidas previas
bajan a 22, y exigiendo además romperlo por un 10% (y dos kills más, en kills) quedan
**12**. Los que sobreviven son noticia de verdad: 14 kills contra 11, 59.281 de daño
contra 50.911. Los que se caen eran "21 kills, antes 20".

**Y de una partida sale UN solo mensaje.** Una partida con penta es casi seguro también
una partida sin morir y un récord de kills; sin la precedencia de `hitoDe`, el canal
recibiría tres mensajes contando lo mismo. Por la misma razón el hito le gana a la
carrileada: `checkHitosAndNotify` devuelve el match_id que publicó y
`checkCarryAndNotify` lo saltea.

**El penta tiene texto fijo y no plantilla rotativa.** No pasó nunca en la historia del
grupo, así que cuando pase tiene que salir siempre el mismo y ser inconfundible.

**Lo que se descartó, y por qué, para que nadie lo reintente:** un mensaje de "duelo"
entre dos del grupo enfrentados. Hay 185 partidas con dos de ellos adentro y **cero en
equipos contrarios** — siempre juegan juntos. No hay feature ahí.

## El promedio del tilt se compara contra DERROTAS

**El aviso de tilt comparaba peras con manzanas, y el grupo lo cazó antes que el código.**
El bot publicó *"muere 6,5 veces por partida contra 3,8 de su promedio"* de alguien cuyo
promedio real en derrotas era **7,07**: estaba muriendo MENOS de lo habitual y el mensaje
decía lo contrario.

El motivo: la base promediaba victorias y derrotas juntas, pero una racha es toda
derrotas. Y en una derrota se muere muchísimo más — medido en este grupo, **7,1 contra
4,6, un 54% más**. Así que la comparación salía inflada SIEMPRE, para cualquiera.

Ahora la base son las **derrotas anteriores** a la racha. Medido sobre las rachas activas
del momento, el cambio pasó de cuatro avisos a uno: Sagitaryus (8,0 contra 6,59 = 1,21)
es el único que estaba tilteado de verdad; marlboro (0,91), Simiestro (0,90) y vas a
perder (1,19) eran falsos positivos.

**Y había un segundo bug que lo tapaba.** El cron traía 20 partidas y la base se armaba
con lo que sobraba DESPUÉS de la racha: con diez derrotas al hilo quedaban diez partidas,
y con dieciséis no quedaba ninguna y el aviso se apagaba solo — justo cuando más
dramático era. `BASE_VENTANA` decía 20 pero nunca podía juntar 20. Ahora el cron trae 60.

**El texto dice "cuando pierde" y no "de su promedio".** El número solo no alcanza: "su
promedio" a secas se lee como el promedio de todo, que es justo la confusión que causó
esto.

## Carrear no se mide igual en cada línea

**Los umbrales de `lib/carry.ts` se midieron, no se eligieron.** Contra las 1047
partidas guardadas (17/9), el percentil 90 del % de daño al equipo es 30,4 en mid, 30,1
en bot, 30,3 en top y **22,5 en la jungla**. Con un corte plano en 30 calificaba UNA
partida de jungla en toda la historia y ninguna de support: el aviso habría existido
solo para tres de las cinco líneas. La jungla no aporta menos — su daño se reparte entre
campeones y monstruos y `dmg_share` solo cuenta el hecho a campeones.

**El support necesita tres caminos, no uno.** Su mediana de daño es 11% contra 22% de un
mid, así que por daño no gana nunca; lo que lidera es la participación en kills (56,8, la
más alta). Pero adentro del rol hay tres estilos que no comparten una sola métrica:
el enchanter se mide por curación y escudos (p90 ~19.600), el de enganche por
asistencias, y el **tanque por `damage_mitigated`** — la mediana de los tanques del grupo
es 36.819 contra 8.917 de los enchanters, cuatro veces. Con un solo camino, el Thresh
5/3/19 y el Rell 1/5/28 quedaban afuera.

**Y el tanque necesita además un tope de muertes más flojo.** Pedirle daño aguantado CON
el tope de 4 muertes del resto da CERO casos: el que absorbe 70.000 muere seis veces, ese
es el laburo (las partidas de Alistar con mucho daño aguantado tienen 8, 6 y 11 muertes).
El tope sube a 7 para ese camino, y lo que impide que entre el que se regala es el propio
daño aguantado: morir seis veces sin haber absorbido nada no califica.

**Los skillshots NO sirven de gatillo, y se probó.** Contra las 234 partidas de support,
cualquier umbral razonable combinado con las otras condiciones da cero casos: el sup que
clava muchos skillshots no es el mismo que tiene alta participación y pocas muertes, son
estilos distintos. Y encima dependen del campeón — un Alistar tiene 0 siempre, porque sus
habilidades son dirigidas o áreas alrededor suyo. Quedaron como DATO adentro del mensaje,
que es donde lucen. No volver a ponerlos como condición.

**El aviso mira solo lo recién insertado Y lo recién jugado — hacen falta las dos.**
Pasarle los match_id que ese ciclo acaba de insertar es lo que impide republicar el
historial cada quince minutos (misma regla que la cargada). Pero "recién insertada" no
es "recién jugada": un invocador que se agrega hoy entra con sus últimas 20 partidas de
una, y un cron que estuvo caído medio día vuelve e inserta todo junto. Por eso va además
la ventana de 3 horas sobre `played_at`, la misma que ya usaba la cargada de flex.

**Ni `/api/backfill` ni `/api/repair` disparan avisos, y tiene que seguir siendo así.**
Ninguno de los dos llama a las funciones de notificación: pasan por `fetchAndStoreMatch`
y `buildMatchRow` directo. Importa porque quedan cientos de filas por reparar, y un
repair que avisara publicaría de golpe cada carrileada y cada desastre del historial.

**Sale en el 2,5% de las partidas, contra 4,3% de la cargada, y es a propósito.** Es el
mismo argumento del parte diario que se calla los domingos: un bot que felicita todos los
días es un bot que el canal aprende a saltear, y después no lo lee ni cuando pasó algo.

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

**El bot de Discord NO usa la cerradura de la app: usa la firma Ed25519 de Discord.**
Son dos cosas distintas y mezclarlas sería el bug. `exigirSesion` prueba que del otro
lado hay alguien del grupo con la contraseña; la firma prueba que el pedido lo mandó
Discord. La segunda alcanza para los cuatro comandos porque **todos son de lectura**.
El día que el bot escriba algo ya no alcanza, y no es un detalle: en un canal de
Discord puede tipear cualquiera del server, así que una firma válida puede venir
igualmente de alguien de afuera. Ahí va además una lista de `discord_id` permitidos —
nunca la contraseña del grupo, que expuesta en un canal deja de ser una contraseña.

**Y sin `DISCORD_PUBLIC_KEY` no entra ningún comando**, mismo criterio que
`APP_PASSWORD`: que falte la cerradura es exactamente el caso en el que no hay que
dejar pasar a nadie.

**El 401 de la firma inválida es obligatorio.** Discord prueba el endpoint mandando
una firma mal a propósito y **no deja guardar la URL** si eso contesta cualquier otra
cosa. Un `200` educado ahí es lo que hace que la configuración falle sin explicar por
qué.

**El cuerpo se verifica CRUDO.** Lo firmado es `timestamp + cuerpo tal cual llegó`.
Parsearlo a JSON y volver a serializarlo mueve un espacio y la firma no valida nunca:
`req.text()` primero, `JSON.parse` después. Nunca `req.json()`.

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

## El duo con gente de afuera: por qué es una tabla y no un ajuste

**Riot no dice quién fue en duo.** Match-V5 no trae `partyId`, ni premade, ni nada
equivalente — se revisó el payload y el tipo. La pregunta "¿con quién jugó?" no tiene
respuesta directa, así que el duo se deduce de la repetición: un compañero random te
toca una vez, un duo aparece en quince partidas del mismo lado. Para poder verlo se
guardan los cuatro puuids del equipo propio en `matches.aliados`, que salen del payload
que `buildMatchRow` ya tiene en la mano —cero llamadas extra— y que antes se tiraban.

Como `repairMatchRow` arma la fila con esa misma función, la misma línea llena las
partidas nuevas y repara las viejas. No hizo falta código de backfill.

**El ajuste a mano nace vencido, la tabla no.** Se calculó un `liga_ajustes` de −4 por
cuatro partidas y antes de poder correrlo ya eran cinco, porque el tipo seguía jugando.
Un número se queda viejo; un puuid no. Por eso `liga_vetados`: se carga una vez y toda
partida donde aparezca esa cuenta deja de contar sola, esa y las que vengan.

**Anula la partida ENTERA, no solo la victoria.** Si con la cuenta vetada perdió,
tampoco le resta: para la liga esa partida no pasó. Es más fuerte que `ally_afk`, que
descarta solo las derrotas. Va enganchado al mismo mecanismo (`anulada`) para que la
partida se siga VIENDO en el historial con el cartel "no contó" — una partida que pasó
y no aparece en ningún lado parece un bug.

**La regla que se pide no siempre es la que se quiere: hay que medirla.** El pedido
original fue "que solo sumen puntos si juegan con la tabla". Medido, eso borra la liga:
un jugador tenía 17 partidas y NINGUNA con alguien de la tabla, otro 2 de 16, otro 4 de
39 — casi nadie llegaba al mínimo de 10. Y el que motivó el reclamo era el tercero que
más acompañado jugaba. La regla que sirve es la inversa: "el duo con gente de afuera no
cuenta", y el solo queue sigue valiendo.

**Un campo de diagnóstico vale lo que cuesta.** Después de crear la tabla y cargar el
puuid, la pantalla seguía mostrando el puntaje viejo, y desde afuera no se podía
distinguir "el deploy no salió" de "la lógica está mal" — dos causas que se arreglan en
lugares distintos. `/api/liga` devuelve `vetados: <n>`: el campo no existe en la versión
anterior, así que su sola presencia dice qué código está sirviendo. Resultó ser lo
primero, y sin el campo se habrían buscado bugs inexistentes durante media hora.

## El LP se mueve cuando la partida TERMINA, no cuando empieza

`lpPorPartida` repartía el LP entre las fotos usando `playedAt`, que es
`gameCreation` — el arranque. Pero el LP se acredita al final. Con fotos cada 15
minutos y partidas de 25 a 40, **casi todas cruzan una foto**, así que la atribución
caía sistemáticamente un tramo antes: la foto que "cerraba" el tramo había sido sacada
con la partida todavía en curso y su LP no incluía el resultado.

Se vio de dos formas. En pantalla, como un "+19 LP entre 2" donde tenía que haber un
número propio: dos partidas metidas en un tramo porque una no era de ahí. Y buscando
derrotas mitigadas, donde tres de cinco quedaban sin atribución por el mismo corrimiento.
Ahora el tramo se elige con `playedAt + duracionS`.

Sin duración se usa el arranque, como antes: una partida vieja a la que le falta el dato
queda como estaba en vez de desaparecer del cálculo.

## La derrota mitigada no se deduce, se mira

La liga dice "no cobrar lo que Riot no cobra", pero hasta acá eso lo resolvía `ally_afk`,
que DEDUCE el abandono del timeline. Riot mitiga por criterios propios y más amplios, así
que la deducción se perdía casos: medido sobre un torneo, **cinco derrotas mitigadas
puntuaron −0,75 igual**, en tres jugadores distintos. Y una de ellas cambiaba el podio.

Ahora se mira el veredicto de Riot: una derrota con atribución propia que movió 0 LP no
cuenta. Dos condiciones, las dos necesarias:

- **Atribución PROPIA** (`sinLp === null`). Si cayó junta con otras entre dos fotos no se
  sabe cuánto movió ella, y adivinar sería peor que no hacer nada.
- **`desdeLp > 0`.** Este es el que no es obvio: en el piso de la división una derrota
  tampoco baja LP —no se puede ir abajo de 0 sin descender— y se ve **idéntica** a una
  mitigada mirando solo el delta. De 8 casos que daba el delta solo, **3 eran el piso**.
  Sin este filtro, tres jugadores se habrían comido un perdón que no les tocaba.

El cierre aplica el MISMO criterio que `/api/liga`, por lo mismo que los remakes: si el
cierre contara partidas que la tabla en vivo no cuenta, el bot anunciaría un campeón que
nadie vio ganar.

## La cabecera de la liga: una superficie, no tres

Eran tres focos para una sola lectura: las fichas de puntaje en un bloque, una nota suelta
con los mínimos, y la tarjeta de estado abajo. El ojo tenía que juntarlos para contestar
una pregunta que es una sola —cómo se puntúa y en qué punto va la semana—, y esa es la
definición de una pantalla fragmentada.

Ahora las reglas entran **adentro** de la tarjeta, como franja superior. La tarjeta tiene
tres bandas: reglas, tiempo/premio, días.

- **Las reglas se pasan como `ReactNode`, no se mudaron.** Usan helpers que viven en
  `LigaSemanal` (`coma`, `ordinal`, `StreakIcon`); moverlas hubiera arrastrado todo eso.
  Y queda el bloque suelto como respaldo para cuando la tarjeta no se dibuja: la ventana
  de caché del CDN puede traer una respuesta sin `dias`, y el puntaje es la regla más
  importante de la liga — no puede desaparecer porque falte un dato de otra cosa.
- **La fecha bajó a agruparse con la cuenta regresiva.** Era el título de la tarjeta, a
  cuarenta píxeles del reloj que habla del mismo tema. Ahora van juntos y en orden de
  peso: fecha (contexto), horas que faltan (protagonista), día de cierre (metadata).
- **El párrafo de clasificados se contó en vez de listarse.** Decía "fulano, mengano y 5
  más ya tienen las 10 de la semana. Después hay que aparecer el lunes y jugar 3" — dos
  renglones para algo que se entiende con un número, y los nombres ya están en la tabla
  de abajo. Ahora: "7 de 8 ya tienen sus 10 · faltan 3 el lunes".
- **Los días dejaron de ser botones.** Sin fondo ni borde: son un progreso temporal, y con
  caja se leían como una fila de campos de formulario.

**"El premio" NO se renombró, y el pedido de renombrarlo era razonable pero parcial.** Se
propuso "DEFINICIÓN" o "CIERRE FINAL" mirando el estado que estaba en pantalla ("Se define
el lunes"). Pero el bloque tiene CUATRO estados: `Lo cobra Fulano`, `Fulano todavía no
cobra`, `Todavía no lo tiene nadie` y `Se define el lunes`. El rótulo contesta "quién se
lleva el premio"; "se define el lunes" es la respuesta de hoy, no el tema. Con
"DEFINICIÓN → Lo cobra marlboro" se lee peor en tres de los cuatro.

**Y una trampa que apareció TRES veces en el mismo día**: reglas CSS duplicadas en
`globals.css`, donde la segunda gana por orden y tocar la primera no hace nada.
`.tab-btn.is-active`, `.liga-reglas-nota` y `.estado-premio`. En un archivo de cuatro mil
líneas, antes de escribir una regla conviene `grep -c "^\.clase{"`. Las tres se
encontraron midiendo en el DOM, no leyendo.


## La carrera: la jerarquía estaba en el número equivocado

El pedido era "que se pueda seguir a un jugador". La interacción para eso ya estaba
entera —hover y click desde la línea, el nombre del pasillo y el chip de abajo, los tres
resaltando lo mismo— y sin embargo no se podía seguir a nadie. El problema era un solo
valor: **las líneas de fondo estaban en `stroke-opacity: 0.6`**. A ese nivel compiten con
la elegida, así que elegir casi no cambiaba nada y el sistema de resaltado que ya existía
no se notaba. Ahora 0.24.

**No se apagan del todo, y es el punto.** A 0.05 el gráfico sería el de una persona sola;
lo que lo hace una CARRERA es ver contra quién iba y cuándo lo pasaron. Quedan de
contexto, no de competencia.

Y de ahí salió un ajuste que no se hubiera visto de otra forma: **el brillo de la línea
en foco bajó de 2.4 a 1.5**. Ese filtro estaba para separarla de un fondo que competía, y
ese fondo dejó de competir — mantenerlo era pedirle dos veces el mismo trabajo a la
jerarquía, y de cerca se leía como un halo.

**El tooltip va por DÍA, no por punto.** En una carrera la pregunta es "¿cómo venía la
cosa el miércoles?", no "¿cuánto tenía este acá". Con un tooltip por punto hay que
acertarle a un círculo de 3px de la línea correcta entre siete; con la columna del día
alcanza con la altura horizontal y contesta por todos de una, ordenados por lo acumulado
A ESE DÍA —no por la posición final, que es lo que haría inútil mirar el miércoles—. El
`delta` sale de los mismos números ya dibujados: no se calcula ni se pide nada nuevo.

**Lo que ya estaba y NO se tocó, para que nadie lo "arregle" de nuevo:** la curva es
monótona cúbica (pasa por cada punto, no inventa picos), los colores salen del PUUID y no
del puesto (si salieran del puesto, el día que dos se pasan intercambiarían de color), las
guías del final de cada línea al nombre ya resuelven el amontonamiento de los empatados, y
el relleno va solo abajo de la línea en foco porque con siete es un manchón.

**El hover sobre la línea para SELECCIONAR sigue descartado** (ver el header del
componente): con siete líneas el resaltado saltaba de una a otra al cruzar el gráfico. El
hover aclara; el click fija. Lo que se agregó no contradice eso — el travesaño del día no
cambia quién está en foco.

## La app abre en Inicio, y la navegación son pestañas, no rutas

**No hay rutas por sección y no se agregaron.** `app/page.tsx` es una sola página
cliente con seis pestañas en estado de React; `/` es la única ruta de la app. El plan
de evolución habla de "rutas" (`/` abre Home, Ranking conserva la suya), y eso acá se
cumple con la pestaña por defecto: la app arranca en Inicio y ninguna dirección cambió.

Partir esto en rutas de verdad sería reescribir el flujo de datos entero, no mover
archivos: `/api/ladder` se pide UNA vez y de ahí salen Ranking, Estadísticas y Cara a
cara sin pedir nada más (ver ARQUITECTURA → El flujo de datos). Con una ruta por
sección, cambiar de sección vuelve a montar todo y cada una tendría que traerse el
ladder por su cuenta — cinco veces el mismo JSON pesado, que es exactamente lo que
tiró la base en septiembre.

Lo que sí se pierde y hay que saberlo: **no se puede compartir un enlace a una
sección**. Si alguna vez hace falta, la forma barata es el hash (`#liga`) leído al
montar, no el App Router.

## Inicio no repite el estado que ya dice la barra de arriba

La barra dice cuántos invocadores hay, la región, cuántos están en partida y cuándo
se actualizó — en TODAS las pantallas. El plan pedía un bloque "Hoy en el grupo" con
esos mismos cuatro datos, y ponerlos otra vez treinta píxeles más abajo y más grandes
no es un resumen: es la misma línea dos veces.

Lo que Inicio dice en su lugar es lo que **ninguna otra pantalla dice**: qué pasó HOY
—partidas, V/D, cuántos jugaron— que es la pregunta con la que uno entra. Los cuatro
datos de la barra quedan abajo, en 12px, como contexto de esa frase.

Sale de `resumenDeHoy` en `lib/actividad.ts`, por días CALENDARIO argentinos y no por
bloques de 24 horas: es la misma cuenta que reparte las partidas por día en la liga,
así que las dos pantallas no se pueden contradecir.

## "Qué se movió" se calla antes que inventar

No hay tabla de eventos y no se va a inventar una. El feed de Inicio sale de restar
dos FOTOS de LP reales (`lp_snapshots`), y cuando las fotos no alcanzan, no dice nada.

El caso concreto está en el header de `lib/actividad.ts`: `lpHistory` son las
**últimas 20 fotos**, no las de las últimas N horas. Quien jugó veinte veces en una
tarde tiene su foto más vieja a tres horas de distancia, y ahí "en las últimas 24
horas subió 40 LP" sería mentira por defecto — subió eso *y lo de antes, que ya no
está en la ventana*. Por eso `desde()` exige una foto ANTERIOR al corte y devuelve
null si no la hay.

Dos reglas más del mismo módulo:

- **Se compara con `rankScore`, nunca con el LP crudo.** El LP se resetea a un número
  bajo en cada ascenso, así que restar LP pelado convierte una promoción —el mejor
  momento de la semana— en una caída de 70.
- **Un cambio de rango se cuenta siempre, aunque el neto sea de un punto.** Ascender
  es lo que el grupo festeja y pasa justo cuando el LP vuelve a cero, o sea con el
  delta más flaco. Por eso no pasa por el mínimo de `LP_MINIMO`.

## El 1fr volvió a pasar, ahora en Inicio (tres veces seguidas)

La lista de la liga, el acumulado del día y después dos bloques de Inicio: un
`1fr` en el nombre empuja el número contra el filo derecho y deja ochocientos
píxeles de nada en el medio.

La primera respuesta fue un tope de ancho en `.inicio` (840px), y estaba mal
diagnosticada: tapaba el síntoma en una columna angosta y dejaba media pantalla
vacía a la derecha. **El void no se arregla angostando la página: se arregla
dándole a cada bloque el ancho que su contenido pide.** Hoy lo hace la grilla
—la liga y el ladder en una columna de ~660px, los movimientos en una de
~420—, y ningún bloque tiene tope propio.

Si aparece un bloque nuevo con "algo a la izquierda y un número a la derecha",
la pregunta no es qué `max-width` ponerle: es en qué columna va.

## La franja del día NO es el título de la página

"20 partidas hoy" en 34px, con la fecha y el jugador en vivo contra el borde
derecho. Parecía el `<h1>` de una web llamada *20 partidas hoy*, y la franja se
leía como tres cosas sueltas en vez de una.

El error era conceptual, no de tamaño: **eso es una MÉTRICA —el contexto del
día— y no el título de nada.** El nivel 1 de Inicio es la frase de la liga, que
es lo que está en juego; esta franja es con qué se la lee.

Ahora son dos renglones y ~46px de alto: el rótulo con la fecha arriba, y abajo
una sola frase —"49 partidas · 32V · 17D · 7 de 7 jugaron"— con el estado vivo
cerrándola. La jerarquía vive DENTRO de la frase (20px la cifra, 13 el récord,
12 la metadata) en vez de estar repartida entre un titular gigante y una línea
de metadata.

Y se fue la divisoria de borde a borde que tenía debajo. La card de la liga
empieza treinta píxeles más abajo y su propio borde ya separa: **una línea de
1140px para despegar dos renglones de texto era un corte más fuerte que lo que
estaba cortando.**

En celular la cifra se lleva su propio renglón. Entra en una sola línea con los
números de hoy, pero con tres dígitos de partidas y "14 de 14" el corte cae en
el medio de un grupo; partirlo a propósito es más robusto que dejar que lo
parta el ancho.

## El feed tiene un hilo, y se tiene que ver

"Qué se movió" eran cinco renglones de texto y se leía como otra tabla. Ahora
lleva un hilo vertical de 1px que corre a lo largo de todos los eventos: eso es
lo que lo convierte en ACTIVIDAD, una cosa atrás de la otra en el tiempo.

Arranca y termina adentro del primer y el último evento para no sobresalir por
las puntas como una barra, y el botón de cada fila empieza doce píxeles a la
derecha para que el fondo del hover no se lo coma.

**Va en `--border-firm` (13%) y no en `--border-soft` (6%).** Al 6% sobre el
fondo real —#050504— el hilo directamente no se veía; se descubrió mirando la
captura, no el valor. Es la misma regla que ya estaba anotada para el anillo de
foco: lo que no se percibe no es sutil, es que no está.

Y el aire: más ENTRE eventos (11px), menos DENTRO (1px entre el nombre y su
cambio). Antes estaban parejos y la lista se leía como diez renglones en vez de
cinco cosas que pasaron.

## Las dos columnas de Inicio arrancan en la misma línea

El título de "Qué se movió" se alinea con el RÓTULO de la liga, no con el borde
de arriba de la card: el desplazamiento es el padding de la card más su borde
(18px). Los dos textos arrancan en la misma horizontal y las dos columnas se
leen como una composición, en vez de dos bloques puestos al lado.

## "N invocadores trackeados." no va en Inicio

Es exactamente lo que dice la barra de arriba —"N invocadores"— en todas las
pantallas, y solo al final de una página se lee como una nota técnica.

Se saca **solo en Inicio**. En las otras pestañas se queda, porque ahí el
"Cargando ladder…" que comparte ese mismo renglón todavía es la única señal de
que algo está viniendo: no tienen esqueleto propio.

## La composición de Inicio: una grilla, no cuatro secciones apiladas

La primera versión apilaba título, card, título, lista, título, lista. El
contenido estaba bien elegido; la composición era el problema. En un monitor de
1180px eso es una columna angosta con media pantalla vacía a la derecha, y se
lee como un formulario. **Cuatro bloques del mismo peso uno abajo del otro no
tienen jerarquía: tienen orden.**

Ahora son tres zonas con una grilla de áreas:

```
.inicio-intro        <- el día. Sin superficie.
+-- LIGA --------+ +- QUÉ SE MOVIÓ -+
+----------------+ |                |
  LADDER           |    (sigue)     |
                   +----------------+
```

Los movimientos ocupan **las dos filas** de la derecha, y eso es lo que la hace
asimétrica en vez de un grid de cuatro cajas. Resuelve dos cosas de una: el
ladder son tres renglones y dejaba medio metro de aire abajo, y los movimientos
son cinco líneas cortas que no tienen por qué compartir el alto de nadie.

Y de paso baja la card de la liga de 1140px a ~660. **La proporción de una
superficie la decide cuánto contenido tiene, no cuánta pantalla hay**: con el
ancho entero, la frase de la tensión y los dos punteros nadaban adentro.

Una sola superficie en toda la pantalla, y es la liga. No es porque brille más
—no tiene degradado, ni glow, ni sombra grande, solo el filete dorado— sino
porque es la ÚNICA: es lo único temporal, con cuenta regresiva y premio, y esa
tensión es la razón de volver a entrar. Lo demás se separa con tipografía y
aire.

## La liga cuenta la diferencia, no dos puntajes

"marlboro +11,75 / compren bitcoin +10,25" son dos números. **"La punta está a
1,5 puntos" es una competencia**: dice si esto ya está definido o si el domingo
se da vuelta.

Sale de restar los dos primeros de la tabla —ordenada de nuevo acá aunque la
API ya la mande ordenada, porque si algún día cambia el orden de allá esta
frase pasaría a ser falsa sin que nadie se entere—. Con empate dice "La punta
está empatada", y el singular/plural de "punto" también sale del número.

El reloj es la segunda zona de la card y no una línea chiquita arriba a la
derecha: en una competencia que cierra, **el tiempo que queda es
co-protagonista de la diferencia de puntos**. Los dos juntos son la tensión;
cualquiera de los dos solo, no.

## Una consulta de contenedor la contesta el contenedor para sus HIJOS

El interior de la card de la liga se parte en dos por `@container` y no por
ancho de ventana: la card cambia de ancho con la grilla que la contiene, así
que la que sabe cuánto mide es ella. Mismo patrón que `.match-detail`.

La trampa, y costó una medición: **un elemento no puede estilarse a sí mismo
desde su propia consulta de contenedor.** Con `container-type` en `.liga-spot` y
la regla apuntando a `.liga-spot`, no aplicaba nunca — medido, la card llegaba a
1140px y seguía apilada. Por eso existe `.liga-spot-cuerpo`: la card es el
contenedor y el cuerpo es el hijo que se reacomoda.

## En "Qué se movió", el nombre y el cambio son UNA unidad

Estaban partidos: el nombre a la izquierda y "Ascendió a Esmeralda 1" contra el
filo derecho, con "desde Esmeralda 2" abajo del nombre. Había que cruzar la
pantalla para armar una frase que es una sola cosa.

Ahora van uno arriba del otro y pegados, con la flecha al costado:

```
^  Sagitaryus
   Esmeralda 2 -> Esmeralda 1
```

**La flecha reemplaza al verbo.** Con la flecha adelante, "Esmeralda 2 →
Esmeralda 1" ya no necesita el "Ascendió", y de paso el glifo es lo único con
color de la fila: se ve para dónde fue antes de leer una palabra. Por eso
`Movimiento` de `lib/actividad.ts` tiene un campo `cambio` y no un verbo más un
destino.

## "En partida ahora" es una línea de estado, no un módulo

Tenía sección propia con título y lista, en el medio de Inicio. Dos problemas:
cuando hay alguien jugando es lo más urgente de la pantalla y estaba tercero, y
cuando no hay nadie —que es casi siempre— desaparecía y dejaba un salto en el
medio de la composición.

Ahora vive en la cabecera del día, al lado de la fecha, como chips con la cara
del campeón. Arriba cuando importa, y cuando no hay nadie se va sin mover nada
de lugar porque no era una fila de la grilla.

## El ladder perdió su banda de encabezado de columnas

`.ladder-head` —seis rótulos en mayúsculas de 10px: `# · Invocador · Rango · Winrate ·
Últimos 20`— era lo que hacía que el ladder se leyera como una PLANILLA. Rotulaba
cosas que se reconocen solas: una cara con un nombre, un emblema de rango, un
porcentaje, una curva.

El dato que decide: **en el celular estaba escondida desde siempre** (`display:none`),
o sea que la pantalla donde más se usa la app venía funcionando sin ella hace meses. La
lista de la liga ya había hecho el mismo camino.

Lo único que el rótulo aportaba era el "Últimos 20" de la curva, y eso lo dice ahora la
propia columna con su "▲ 72 LP" debajo.

## En la celda de rango manda el LP, no el nombre del tier

Estaba al revés: "Esmeralda 3" en 13,5px y en negrita, los LP en 11px y gris apagado.
Al lado de un emblema de Esmeralda 3, que es lo único que ese emblema hace.

El emblema dice el tier. El número dice en qué parte de esa división estás, que es lo
que no se puede leer en ningún otro lado y lo que se mira para saber quién va ganando.
Ahora el LP es el número de la celda (15px, `font-stat`, blanco) y el nombre del rango
es el rótulo de abajo, en 11,5px y con el color del tier.

## La salida a la liga bajó el volumen, pero NO volvió a ser texto gris

`.vista-ir` era una pastilla con degradado dorado, borde de acento y un aro en el
hover, al lado del `<h2>` del ladder. Se leía como un botón con un título al costado, y
no como un título con una salida al costado.

Ahora es plana: fondo `--accent-wash-soft`, borde de un escalón, 12px. **Lo que no se
toca es que siga siendo un botón** —fondo, borde, la copa y el movimiento de la
flecha—: ya se probó dejarla como texto gris suelto y no se leía como algo que se toca.
Bajarle el volumen no es volver a eso.

Y ahora tiene compañía: Inicio abre con el adelanto de la competencia, así que esta
dejó de ser la única puerta a la liga.

## El detalle de la liga se despliega por día, con hoy abierto

El historial de alguien que jugó toda la semana son cuarenta partidas. Cuarenta
renglones abiertos de una en un celular no son transparencia: son media hora de scroll
para encontrar la de anoche.

Ahora cada día abre y cierra, y por defecto **queda abierto el más nuevo** —el que se
viene a mirar— con los anteriores a un toque. El estado se resetea al abrir la fila de
otro jugador: "qué días miré" es de ESE jugador, y arrastrarlo abriría el martes de
alguien que nunca se tocó.

Cerrado, el encabezado del día es todo lo que se ve de ese día, así que lleva las
cuatro cosas que contestan "¿cómo me fue el jueves?": el día, el récord (V/D), lo que
movió y en cuánto quedó. El récord cuenta **todas** las partidas jugadas, anuladas
incluidas, porque es lo que se ve en la lista de abajo — si el día muestra cuatro ✕ y
el encabezado dice "3D", el que abrió el detalle para auditar se encuentra con que la
app no sabe contar. Lo que las anuladas no mueven es el `delta`, que va al lado y es
otro número.

Debajo de 430px el acumulado se esconde: los cinco elementos no entran, y el acumulado
de la semana ya está arriba, en la fila del jugador.

**Y el encabezado es ahora un botón, así que entró a la auditoría de área táctil.**
Medido a 390px daba 24px de alto. Tiene su `padding-block` en el bloque
`@media (pointer:coarse)`, igual que los otros controles chicos.

## La marca del bonus de racha

Una victoria de la liga puede valer 1 o 1,25 y del ✓ de la izquierda no se deduce cuál:
el bonus arranca en la cuarta al hilo y ese estado no se ve en la fila. Sin marca, dos
renglones idénticos —misma ✓, mismo campeón— muestran números distintos y parece un
error de la app.

Es una llamita dorada de 9px antes del número, sin texto. La fila ya tiene ✓, campeón,
KDA, duración, puntos y LP: un sexto elemento con palabras la rompe.

**Se compara contra la tabla de puntos que manda la API (`d.puntaje.victoria`), no
contra un 1 escrito en el componente.** El día que cambie el valor de la victoria, esto
sigue diciendo la verdad. Sin esa tabla —una pestaña vieja contra la API nueva— no se
dibuja nada, que es mejor que marcar mal.

## `/api/liga` se pide una vez por pestaña, no una por componente

Desde que Inicio muestra el adelanto de la competencia son dos componentes en dos
secciones distintas pidiendo la misma respuesta, y `/api/liga` no es liviana: trae
TODAS las partidas de la semana de cada uno con su LP y su KDA.

El CDN ya la cachea 240 segundos, así que el segundo pedido no llegaba a la base ni al
pool de Supabase —que es lo que importa—, pero seguía siendo una descarga entera de más
por cambiar de pestaña, y el adelanto parpadeaba cargando algo que ya estaba en memoria
dos pantallas más allá.

`components/useLiga.ts` es un caché de módulo con oyentes, **no un contexto de React**:
no hay proveedor que envolver (LigaSemanal se dibuja tres niveles adentro de
LadderTable) y lo único que se comparte es el resultado de un fetch. `recargar(true)`
sigue salteando el CDN, que es lo que hace falta después de anotar o desanotar a
alguien.

## Medir con Playwright: el `pointer:coarse` y el frame viejo

Dos trampas que costaron una vuelta cada una en la sesión del plan de evolución.

**El hot reload devuelve frames viejos.** Un `.liga-dia-head` medía 24px justo después
de editar el CSS y 34px en una corrida limpia, con la misma regla. Ya estaba anotado y
volvió a pasar: si un número no da lo que el CSS dice, **volvé a correr la medición
antes de "arreglar" nada**.

**Y `hasTouch:true` no siempre emula `pointer:coarse`.** En un contexto recién creado
sí; en el mismo script, después de haber abierto y cerrado uno de escritorio, no —
`matchMedia("(pointer:coarse)").matches` daba false y las reglas del bloque táctil no
aplicaban. Para medir un área táctil, **un script aparte con ese contexto como el
primero del navegador**.
