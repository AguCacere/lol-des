# Próximo torneo

La liga que viene, que **no es la de ahora con más semanas**: cambia el formato, cambia el
bot y aparece una mecánica nueva. Esto es el pedido en crudo más lo que cada cosa toca, para
que el que lo implemente no descubra el costo a mitad de camino.

Nada de acá está construido. Lo que ya está acordado para la liga **actual** —el tope de
cinco por día, el piso de −3, el duo solo con los del tablero— vive en `PENDIENTES.md` y es
otra cosa: son ajustes al formato de hoy.

Escrito el 16 de septiembre de 2026.

## El pedido

1. **Dura dos semanas**, no una.
2. **Bot de Discord nuevo**, interactivo.
3. **No se permite duo.**
4. **Los "te cojo"**: cada uno arranca con uno y se lo puede tirar a otro participante.
   Estilo blue shell del Mario Kart. Efectos pensados: robar un punto, banear un campeón
   para siempre, tres partidas sin tus mains. Falta definir cómo se ganan más y cómo se
   tiran desde el bot.
5. **Rebranding y rework de la página** para que soporte todo eso.
6. **Mejoras en la base**: darle acceso a Claude para que audite tablas y columnas.
7. **Optimizar el cron** para que los datos de cada 15 minutos sean los mejores posibles.

## Lo que conviene meter en ESTE torneo, y lo que no

Son siete cosas a la vez, y hace tres días todavía no estaba hablado si iba a haber una
tercera semana. Si arranca todo junto, el torneo empieza tarde o empieza roto. La lista de
arriba es el destino; esto es lo que entra en el primer viaje.

**Va:**

- **Bot v1** (los cuatro comandos de lectura) y la columna `discord_id`.
- **Un solo efecto: robar un punto.** Casi no cuesta —`liga_ajustes` ya está hecho, es una
  fila en negativo y otra en positivo— pero obliga a armar el circuito entero: alguien
  tipea en Discord, el bot escribe en Supabase, la app lo muestra. Con ese camino andando,
  los otros dos efectos son **agregar casos, no inventar nada**.
- **Dos semanas, como dos semanas que se suman.** Reusa el motor entero y de regalo el que
  arranca mal tiene un lunes para volver a empezar, que es el problema de siempre.
- **La regla del no-duo**, por honor. Escribirla y listo.

**Queda para el siguiente:** el baneo de campeón, lo de los mains, el rebranding y el rework
de la página.

El motivo no es de tiempo, es de información: **puede que la mecánica no divierta.** Puede
que se roben un punto dos veces y se aburran. Mejor enterarse habiendo gastado una tarde que
tres semanas — y si engancha, se construye el resto sabiendo que vale la pena.

**Y hay una decisión que no es técnica y que define si el sistema sirve o rompe: cómo se
ganan los "te cojo".** Esa la tiene que resolver el grupo antes de que se escriba una línea.
Si los gana el que va ganando, el puntero se escapa más y el invento hace exactamente lo
contrario de lo que se buscaba.

## Lo que toca cada cosa

### Dos semanas en vez de una

Es más profundo de lo que parece: **la semana está metida en el hueso del cálculo**, no es
un parámetro. `inicioDeSemana` y `claveDeSemana` asumen lunes a domingo; `liga_semanas` tiene
el lunes como PK; `diasCorridos` y `etiquetasDeDias` asumen siete días; `porDia` es un arreglo
de siete posiciones que alimenta la carrera y la grilla del día por día; y el cierre lo
dispara el cron de refresco cuando detecta que la semana terminó.

Además hay que redefinir los **mínimos**: hoy son 10 partidas en la semana y 3 el último día.
En catorce días, ¿son 20 y 3? ¿Siguen siendo 10? ¿El "último día" es el domingo de la segunda
semana? Y si se suma el tope de cinco por día, la cuenta cambia otra vez.

Decisión previa: **¿una sola tabla de catorce días, o dos semanas que se suman?** Lo segundo
es bastante más barato —el motor de una semana ya existe y anda— y de paso te da un corte a
mitad de torneo, que para una competencia larga es bueno: el que arrancó mal tiene un lugar
donde volver a empezar.

### El bot nuevo

Está todo el análisis en `PENDIENTES.md` → "El bot de Discord interactivo": HTTP Interactions
en vez de gateway (así no hace falta un proceso corriendo), la firma Ed25519, la regla de los
3 segundos, la columna `discord_id` y los cuatro comandos de lectura de la v1.

**Ojo con el orden**: ahí está escrito que la v1 no escribe nada, porque exponer la cerradura
de la app en un canal donde cualquiera tipea es pedirla. Pero los "te cojo" **son** escrituras
desde Discord. O sea que la mecánica necesita una v2 del bot con escrituras, y esa v2 necesita
la lista de `discord_id` permitidos. Es una dependencia real, no un detalle.

### No se permite duo

Contradice lo que quedó acordado para la liga actual (`PENDIENTES.md`: duo solo con los del
tablero, y anulando solo las victorias). Para el torneo manda esta, que es más estricta —
pero hay que decirlo explícito o van a convivir dos reglas.

El problema de siempre, y no se arregla con más código: **Riot no expone quién era premade en
soloq.** No hay dato de party. Solo se puede inferir por repetición —"este puuid apareció
cinco veces en tu equipo"—, y para eso primero hay que guardar los puuids de los compañeros,
que hoy ni se leen. En un torneo de dos semanas con premio, conviene decidir de entrada si
alcanza con el honor o si se paga la detección.

### Los "te cojo"

**Es la parte más interesante y la que más falta definir.** Y tiene un argumento fuerte a
favor que conviene dejar escrito: es la respuesta divertida al problema de la brecha de
puntos. Las blue shells son rubber-banding, igual que darle menos puntos al puntero — pero
no se sienten como un castigo, porque es algo que el de atrás **usa**, no algo que le pasa al
de adelante por ir ganando. Si los que están abajo los ganan más seguido, la tabla se cierra
sola y encima da tema de conversación.

**Lo que hay que decidir antes de escribir una línea:**

- **Cómo se ganan.** Es lo que define si el sistema sirve o rompe. Si los gana el que va
  ganando, el puntero se escapa más. La idea del Mario Kart es al revés: el de atrás saca los
  mejores. Candidatos: uno por día al que cierra último, uno por ganar el día, uno por racha,
  uno al azar al ganar una partida.
- **Si se pueden acumular o guardar**, y si se pueden tirar dos al mismo.
- **Qué pasa si el que lo recibe no lo cumple.** Un efecto que no se puede verificar no es una
  regla, es una sugerencia.
- **Si se pueden devolver o esquivar.**

**Cuánto cuesta cada efecto**, que es muy distinto entre sí:

| Efecto | Costo |
|---|---|
| **Robar un punto** | Casi nada: **ya está construido**. Es una fila de `liga_ajustes` en negativo para el afectado y otra en positivo para el que lo tiró, con el motivo escrito. Aparece solo en la tabla, con la chapita al lado del nombre. |
| **Banear un campeón** | Barato de verificar: `matches` ya guarda `champion` por partida. Se mira después de jugada. |
| **Tres partidas sin tus mains** | Verificable igual, pero hay que definir **qué es un main** —¿los tres más jugados del torneo? ¿de la temporada?— y congelarlo cuando se tira el efecto, o el afectado lo esquiva dejando de jugarlos. |

La idea general: los tres efectos se **verifican después**, no se impiden antes. La app no
puede meterse en el cliente de LoL. Entonces la sanción es lo que hay que definir: si jugaste
el campeón baneado, esa partida no cuenta, o resta, o pierde el punto — hay que elegir una.

**Las tablas que pide**, a grandes rasgos: una de inventario (quién tiene cuántos y de qué
tipo) y una de efectos tirados (quién a quién, cuándo, qué efecto, hasta cuándo, y si se
cumplió). Con eso el bot escribe, la app lee y el desglose puede mostrar por qué un puntaje
se movió.

**El camino completo que pide esto**: alguien tipea en Discord → el bot verifica la firma →
resuelve el `discord_id` a un puuid → escribe en Supabase → la app lo lee en el próximo
render. Las tres piezas ya existen por separado; lo que no existe es la primera y la que las
une.

### Rebranding y rework de la página

Lo más caro en horas y lo más fácil de recortar. Lo que el resto **sí** necesita en pantalla:
un lugar donde ver tu inventario de "te cojo", quién te tiró qué y qué tenés activo ahora, y
el historial de lo que se tiró en el torneo — que va a ser la mitad de la gracia.

El resto del rebranding (nombre, paleta, identidad) es aparte y no bloquea nada.

### Mejoras en la base

Vale la pena: nunca se auditó el esquema. Con acceso de **lectura** alcanza para lo que sirve
de verdad — ver índices que faltan, columnas que no lee nadie, tipos mal elegidos, tablas que
crecieron sin control.

Dos avisos:

- **Lectura primero.** Escritura directa contra la base de producción desde un chat es
  poderoso y no tiene deshacer. Las migraciones conviene que sigan siendo SQL que revisás y
  corrés vos, que es como se trabajó hasta ahora y funcionó.
- El acceso de Claude a Supabase estuvo disponible en la última sesión pero no se llegó a
  usar. Si se habilita, la auditoría es un rato de trabajo, no un proyecto.

### Optimizar el cron

El análisis está en `PENDIENTES.md` → "Lo del cron". Resumen: los dos slots de Vercel Hobby
están ocupados, el techo real lo pone el rate limit de Riot (100 requests cada 2 minutos) y
bajar de 15 minutos hay que **medirlo**, no asumirlo. La salida mejor que subir la frecuencia
es refrescar a pedido —cuando alguien pregunta por un jugador— en vez de quemar llamadas las
24 horas por las dudas.

Con un torneo de dos semanas y "te cojo" en juego, la frescura pasa a importar más: si alguien
te roba un punto, querés verlo ya.

## Orden sugerido

Las dependencias son reales y si se arranca por el lado equivocado se labura dos veces:

1. **Bot v1** (lectura) y la columna `discord_id`. Es la base de todo lo demás y sirve sola
   desde el día uno.
2. **Las tablas de los "te cojo" y el efecto de robar un punto.** Es el que casi no cuesta
   —`liga_ajustes` ya existe— así que sirve para probar el circuito Discord → base → app
   entero con un solo efecto.
3. **Bot v2** con escrituras, ya con la lista de `discord_id` permitidos.
4. **Los otros dos efectos** y su verificación.
5. **El formato de dos semanas**, que es el cambio más invasivo del cálculo.
6. **La pantalla** de inventario e historial.
7. **El rebranding**, al final, cuando lo demás ande.

La auditoría de la base y lo del cron son transversales: entran cuando haya un rato, no
bloquean nada.

## Lo que hay que decidir antes de empezar

- ¿Dos semanas como una tabla sola, o dos semanas que se suman?
- ¿Cuáles son los mínimos en catorce días?
- ¿Cómo se ganan los "te cojo"? (lo que decide si cierran la tabla o la abren más)
- ¿Qué pasa si alguien no cumple un efecto?
- ¿El "no duo" es por honor o se paga la detección?
