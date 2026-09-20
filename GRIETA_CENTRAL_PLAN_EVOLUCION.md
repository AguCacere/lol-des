# Grieta Central --- Plan de evolución del producto

> Documento de ejecución para Claude Code.\
> Objetivo: evolucionar Grieta Central desde una colección de pantallas
> de estadísticas hacia **el lugar del grupo**: un producto donde entrar
> para ver qué está pasando, competir, analizarse y mejorar.

------------------------------------------------------------------------

## 0. Regla principal para trabajar sobre este plan

Este documento **NO es un pedido para reescribir toda la aplicación de
una vez**.

Claude Code debe:

1.  inspeccionar primero el repositorio, rutas, componentes, queries,
    modelos y datos disponibles;
2.  reutilizar lógica y componentes existentes siempre que sea
    razonable;
3.  implementar el plan **por fases y en orden**;
4.  completar y validar una fase antes de avanzar a la siguiente;
5.  preservar cálculos, autenticación, datos y comportamiento que ya
    funcionan;
6.  evitar hardcodear jugadores, puntos, rangos, LP, partidas o estados;
7.  mantener responsive/mobile como requisito de primera clase;
8.  no resolver problemas de diseño agregando cards, pills, borders o
    efectos indiscriminadamente;
9.  modificar JSX/estructura cuando la composición actual sea el
    problema;
10. dejar el código mejor organizado que antes.

### Antes de tocar código

Crear una auditoría corta del estado actual e identificar:

-   rutas;
-   layout/header/navbar;
-   fuente de datos;
-   Ladder;
-   Liga semanal;
-   Estadísticas;
-   Cara a cara;
-   Clash;
-   Equipo;
-   detalle de partidas;
-   componentes compartidos;
-   queries/API calls;
-   persistencia local/remota;
-   información que puede obtenerse realmente de Riot/datos existentes;
-   deuda técnica que bloquee las fases siguientes.

No inventar información que el proyecto no tenga.

------------------------------------------------------------------------

# 1. Visión de producto

Grieta Central debe dejar de sentirse como:

> "una página con rankings y estadísticas"

y convertirse en:

> **"el lugar del grupo."**

La aplicación debe cubrir cuatro necesidades principales:

  Necesidad                          Producto
  ---------------------------------- -----------------------
  Ver qué está pasando               **Inicio**
  Compararse / ver posiciones        **Ranking**
  Competir                           **Liga de la semana**
  Entender al grupo                  **Estadísticas**
  Aprender de las propias partidas   **Mejora**
  Compararse con otro jugador        **Cara a cara**
  Jugar como grupo                   **Clash / Equipo**

Cada pantalla debe responder una pregunta distinta. Evitar repetir la
misma información completa en varias secciones.

------------------------------------------------------------------------

# 2. Arquitectura objetivo

Navegación principal:

**Inicio · Ranking · Estadísticas · Mejora · Cara a cara · Clash ·
Equipo**

La **Liga de la semana** debe seguir teniendo identidad propia y un
acceso destacado desde Inicio y Ranking, pero no necesita competir
visualmente como un tab más si su naturaleza es temporal/competitiva.

## Responsabilidad de cada sección

### Inicio

**Pregunta:** ¿Qué está pasando en el grupo ahora?

Resumen dinámico. No debe duplicar páginas completas.

### Ranking

**Pregunta:** ¿Cómo estamos posicionados?

Ladder completo, rango, LP, evolución y detalle individual.

### Liga de la semana

**Pregunta:** ¿Quién está ganando la competencia de esta semana y cómo
llegó ahí?

Puntos de liga, carrera, reglas, clasificación y partidas computadas.

### Estadísticas

**Pregunta:** ¿Qué historias y patrones existen dentro del grupo?

Récords, destacados, forma reciente, campeones, dúos y tendencias.

### Mejora

**Pregunta:** ¿Qué debería trabajar yo en mis próximas partidas?

Diagnóstico → patrones → objetivo → seguimiento → progreso.

### Cara a cara

**Pregunta:** ¿Cómo se comparan dos integrantes?

Mantener su propósito específico. No convertirlo en otra página genérica
de estadísticas.

### Clash / Equipo

**Pregunta:** ¿Cómo funcionamos juntos?

Datos y herramientas relacionadas con composición/grupo cuando existan
datos fiables.

------------------------------------------------------------------------

# 3. FASE 1 --- Sistema visual y navegación

**Prioridad: P0**

Antes de construir nuevas features, consolidar el lenguaje visual ya
definido.

## 3.1 Header

Mantener:

-   logo existente de Grieta Central;
-   nombre;
-   cantidad de invocadores;
-   región;
-   estado "en partida";
-   última actualización;
-   buscador Riot ID;
-   candado/admin.

Objetivo:

-   compacto;
-   cohesionado;
-   producto, no dashboard;
-   buscador como acción principal;
-   admin secundario;
-   responsive real.

No generar otro logo. Usar el asset del repositorio.

## 3.2 Navbar

Eliminar sensación de segmented control genérico.

Preferencia:

-   navegación ligera;
-   tab activo con texto dorado + indicador inferior;
-   hover/focus discretos;
-   sin píldora amarilla gigante;
-   scroll horizontal controlado en mobile si fuese necesario.

Agregar **Inicio** y, cuando exista la fase correspondiente, **Mejora**.

## 3.3 Tokens/componentes compartidos

Revisar y consolidar:

-   spacing;
-   radios;
-   bordes;
-   backgrounds;
-   tipografía;
-   verde positivo;
-   rojo negativo;
-   dorado de identidad/competición;
-   muted text;
-   focus states;
-   tamaños táctiles;
-   skeletons;
-   transitions.

Evitar estilos aislados diferentes para cada pantalla.

### Definition of Done Fase 1

-   [ ] Header consistente desktop/mobile.
-   [ ] Navbar consistente desktop/mobile.
-   [ ] Inicio incorporado a navegación.
-   [ ] No se rompe admin.
-   [ ] No se rompe buscador.
-   [ ] No se rompe ninguna ruta existente.
-   [ ] No hay overflow horizontal accidental.
-   [ ] Componentes/tokens compartidos donde corresponda.

------------------------------------------------------------------------

# 4. FASE 2 --- Crear un Home real

**Prioridad: P0**

Actualmente la aplicación abre directamente en el Ladder. Cambiar esto.

## 4.1 Objetivo

Al entrar, el usuario debe responder en \~3 segundos:

-   ¿hay alguien jugando?
-   ¿cómo viene la Liga?
-   ¿quién lidera el Ladder?
-   ¿qué cambió recientemente?

El Home debe ser un **hub editorial**, no un dashboard de ocho cards
iguales.

## 4.2 Estructura

Orden sugerido:

1.  **Hoy en el grupo**
2.  **Liga de la semana**
3.  **Ladder del grupo**
4.  **En partida ahora**
5.  **Actividad reciente**, únicamente si los datos son fiables

### Hoy en el grupo

Resumen compacto:

-   cantidad de invocadores;
-   región;
-   cantidad en partida;
-   contexto temporal útil.

No repetir un hero gigante con "Grieta Central".

### Teaser Liga de la semana

Mostrar solo:

-   estado;
-   top 2;
-   diferencia entre ellos;
-   tiempo restante;
-   CTA "Ver carrera" / equivalente.

Usar datos reales.

Si terminó, adaptar el módulo al resultado final.

### Preview Ladder

Mostrar Top 3:

-   posición;
-   avatar;
-   nombre;
-   rango;
-   LP.

No mostrar gráficos/winrate/historial completos.

CTA: **Ver ranking**.

### En partida ahora

Solo aparece si hay integrantes jugando.

Mostrar datos existentes y fiables.

Si nadie juega, ocultar la sección. No dejar una card vacía.

### Actividad reciente

Solo implementar si existe una fuente correcta para calcular movimientos
recientes.

Ejemplos:

-   +92 LP;
-   cambio de rango;
-   nueva mejor racha;
-   movimiento significativo.

No fabricar un feed si el backend/dataset no permite reconstruirlo bien.

## 4.3 Mobile

Diseñar primero para \~390 px.

Flujo vertical. Nada de grids desktop comprimidos.

### Definition of Done Fase 2

-   [ ] `/` abre Home.
-   [ ] Ranking conserva su ruta.
-   [ ] Liga conserva su ruta.
-   [ ] Home usa datos reales.
-   [ ] No hay contenido hardcodeado.
-   [ ] No duplica páginas completas.
-   [ ] Estados vacíos están resueltos.
-   [ ] Skeleton/loading sin layout shift fuerte.
-   [ ] Excelente en \~390 px.
-   [ ] Desktop no se limita a estirar mobile.

------------------------------------------------------------------------

# 5. FASE 3 --- Evolucionar Ranking / Ladder

**Prioridad: P0**

El Ladder sigue siendo la vista detallada del ranking.

## 5.1 Cards/filas de jugadores

Mantener datos importantes:

-   posición;
-   avatar;
-   nombre;
-   Riot tag;
-   campeón/contexto existente;
-   rango;
-   LP;
-   winrate;
-   V/D;
-   racha;
-   evolución;
-   LP netos.

Objetivo:

-   menos sensación de formulario;
-   jerarquía clara;
-   score/rango primero;
-   información secundaria con menor contraste;
-   mobile denso pero legible.

## 5.2 Sparkline

Mejorar:

-   menos glow;
-   endpoint discreto;
-   línea limpia;
-   positivo/negativo semántico;
-   interacción si aporta valor.

## 5.3 Filtros

Mantener "Línea" y "Ordenar por", pero integrarlos mejor.

Evitar que dominen la página.

## 5.4 Acceso a Liga

Mantener CTA de Liga, pero no hacerlo competir con el título del Ladder.

### Definition of Done Fase 3

-   [ ] Ranking legible en mobile.
-   [ ] Jerarquía consistente.
-   [ ] Filtros siguen funcionando.
-   [ ] Sparklines no generan ruido.
-   [ ] Click/expansión del jugador funciona.
-   [ ] Datos y cálculos sin cambios involuntarios.

------------------------------------------------------------------------

# 6. FASE 4 --- Liga de la semana como experiencia competitiva

**Prioridad: P0**

La Liga debe sentirse como una competición, no como una tabla.

## 6.1 Reglas

Compactar:

-   Victoria `+1`
-   Derrota `-0,75`
-   4.ª consecutiva `+1,25`
-   10 partidas semanales
-   3 obligatorias el último día
-   LP no puntúa

Evitar párrafos largos.

## 6.2 Estado semanal

Agrupar:

-   rango de fechas;
-   tiempo restante;
-   cierre;
-   progreso/requisitos;
-   jugadores que ya cumplieron.

"Faltan X horas" debe ser el dato temporal principal cuando corresponda.

## 6.3 Clasificación

La métrica protagonista es **puntos netos de Liga**.

Mostrar claramente:

-   posición;
-   jugador;
-   score;
-   récord relevante;
-   aporte de hoy;
-   progreso de requisitos.

LP es referencia secundaria.

## 6.4 La carrera

Mantener gráfico de evolución diaria.

Mejorar interacción:

-   hover línea;
-   hover label;
-   click para fijar jugador;
-   demás líneas al 20--30% de opacidad;
-   labels finales como mini clasificación;
-   resolver empates/superposiciones;
-   grid tenue;
-   línea cero algo más visible;
-   tooltip compacto;
-   no suavizar de forma que invente valores intermedios.

## 6.5 Detalle del jugador en Liga

Objetivo:

> explicar cómo construyó su score.

Agrupar partidas por día.

Cada día:

-   puntos del día;
-   score acumulado final;
-   cantidad de partidas;
-   V/D del día.

Día actual abierto por defecto. Días anteriores colapsables.

Cada partida:

-   V/D;
-   campeón;
-   KDA;
-   duración;
-   puntos de Liga;
-   LP secundario;
-   indicador sutil si valió +1,25 por racha.

No mostrar 50 partidas abiertas obligatoriamente en mobile.

### Definition of Done Fase 4

-   [ ] Reglas compactas.
-   [ ] Estado semanal cohesionado.
-   [ ] Puntos de Liga son protagonistas.
-   [ ] Gráfico interactivo y legible.
-   [ ] Detalle agrupado por día.
-   [ ] Días colapsables.
-   [ ] Todos los cálculos originales preservados.
-   [ ] Mobile no requiere scroll absurdo para entender el estado.

------------------------------------------------------------------------

# 7. FASE 5 --- Rehacer Estadísticas: de "data genérica" a radiografía del grupo

**Prioridad: P1**

La pantalla actual tiene valor, pero demasiados rankings estáticos.

## 7.1 Filtro temporal

Cuando los datos lo permitan:

**7 días · 30 días · Temporada**

No simular períodos que no puedan reconstruirse correctamente.

## 7.2 Destacados

Crear una sección compacta con métricas fiables, por ejemplo:

-   mejor winrate;
-   mejor racha;
-   más partidas;
-   mayor subida de LP en período;
-   mayor caída;
-   mayor actividad.

No es obligatorio implementar todas si faltan datos.

## 7.3 Forma reciente

Agregar "Quién está on fire" usando ventana reciente real.

Ejemplo:

-   últimas 10 partidas;
-   V/D;
-   WR.

Debe cambiar con frecuencia y aportar actualidad.

## 7.4 Winrate general

Mantener ranking de winrate, pero mejorar densidad y lectura.

No exagerar precisión cuando hay muestras pequeñas.

Mostrar cantidad de partidas junto al porcentaje.

## 7.5 Especialistas por campeón

Eliminar el gran empty state basado en "mínimo 50" si deja la sección
inútil.

Definir un umbral razonable a partir de la cantidad real de datos (por
ejemplo 15/20), documentado en código/config.

Mostrar:

-   jugador;
-   campeón;
-   WR;
-   partidas.

Separar si conviene:

-   **Especialistas**
-   **Campeones más jugados**

## 7.6 Sinergia de dúo

Mantener selector de invocador, pero evolucionar la métrica.

Mostrar:

-   compañero;
-   partidas juntos;
-   V/D;
-   WR.

Agregar cuando sea estadísticamente/descriptivamente posible:

**Juntos vs separados**

Ejemplo:

-   WR juntos;
-   WR del jugador sin ese compañero;
-   diferencia en puntos porcentuales.

Presentarlo como asociación descriptiva. No afirmar causalidad.

Evitar destacar un "100% WR" sin hacer visible que fueron solo 2--3
partidas.

## 7.7 Récords de Grieta Central

Crear Hall of Fame si los datos históricos lo permiten:

-   mayor racha;
-   mayor subida de LP en un día;
-   mayor caída;
-   más partidas en un día;
-   pico de rango;
-   dúo con más partidas;
-   mejor registro campeón/jugador con mínimo de muestra.

No inventar históricos si no fueron almacenados.

### Definition of Done Fase 5

-   [ ] Estadísticas cuenta historias del grupo.
-   [ ] Muestras visibles junto a porcentajes.
-   [ ] No hay secciones grandes permanentemente vacías.
-   [ ] Dúos muestran contexto de muestra.
-   [ ] Forma reciente utiliza datos reales.
-   [ ] Récords solo existen si pueden calcularse correctamente.
-   [ ] Mobile mantiene buena densidad.

------------------------------------------------------------------------

# 8. FASE 6 --- Crear "Mejora": sistema de aprendizaje personal

**Prioridad: P1 / diferenciador principal**

Esta es la evolución más importante a nivel producto.

La app ya puede explicar qué ocurrió en una partida. Ahora debe ayudar a
transformar esa información en aprendizaje.

## 8.1 Principio

Pipeline:

**Partida → diagnóstico → patrón → objetivo → próximas partidas →
evaluación → progreso**

No empezar con un chatbot genérico.

Primero construir métricas y reglas determinísticas.

## 8.2 Diagnóstico por partida

En el detalle actual reemplazar la devolución genérica por tres capas:

### Lo que decidió / marcó la partida

Una observación basada estrictamente en datos.

Ejemplo:

> La diferencia de oro pasó de -213 @10 a -1.491 @20.

No afirmar "perdiste por X" si los datos no demuestran causalidad.

### Lo que hiciste bien

Una fortaleza contextual respecto de su propia baseline.

### Para la próxima

Una acción medible.

Ejemplo:

> Llegar al minuto 10 con diferencia de oro ≥ -300.

## 8.3 Objetivos

Permitir guardar un objetivo.

Características:

-   uno principal activo a la vez;
-   métrica concreta;
-   umbral;
-   ventana de evaluación;
-   progreso.

Ejemplo:

**Early estable**\
Llegar @10 con diferencia ≥ -300 oro\
`4/5 partidas`

## 8.4 Evaluación automática

Después de cada partida elegible:

-   cumplido / no cumplido;
-   valor obtenido;
-   comparación con objetivo;
-   actualización del progreso.

Ejemplo:

> Objetivo cumplido ✓\
> Diferencia @10: +84\
> Objetivo: ≥ -300

## 8.5 Patrones

No sacar conclusiones fuertes por una partida.

Detectar patrones sobre ventanas configurables, por ejemplo 5/10/20
partidas.

Ejemplos potenciales, solo si hay datos:

-   diferencia de oro @10/@15;
-   CS/min;
-   muertes por tramo;
-   visión/min;
-   KDA;
-   participación;
-   objetivos;
-   desempeño por rol/campeón/matchup.

Mostrar frecuencia y muestra.

Ejemplo:

> En 5 de tus últimas 7 partidas llegaste al minuto 15 con diferencia de
> oro negativa.

## 8.6 Progreso

Mostrar evolución contra uno mismo.

Ejemplo:

**Dif. oro @10** `-421 → -287 → -190 → +34`

No convertir todo en "bueno/malo". Mostrar tendencia y contexto.

## 8.7 Matchup learning

Cuando exista muestra suficiente:

-   historial con ese matchup;
-   V/D;
-   diferencia de oro temprana;
-   CS/min;
-   mejor partida propia;
-   comparación con experiencias anteriores.

Comparar principalmente al jugador contra su propio historial.

## 8.8 Nueva pantalla Mejora

Estructura sugerida:

1.  **Tu foco actual**
2.  **Progreso**
3.  **Patrones detectados**
4.  **Fortalezas**
5.  **Matchups / áreas recurrentes**
6.  **Historial de objetivos**

Evitar 20 recomendaciones simultáneas.

## 8.9 IA --- fase posterior

Solo después de tener el motor determinístico.

La IA puede explicar:

-   "¿Por qué me está costando este matchup?"
-   "¿Estoy mejorando?"
-   "¿Qué cambió en mis últimas 10?"

Debe recibir métricas reales y contexto calculado.

Nunca debe inventar eventos no disponibles.

### Definition of Done Fase 6

-   [ ] Diagnóstico basado en datos.
-   [ ] Fortalezas visibles.
-   [ ] Recomendación medible.
-   [ ] Objetivo guardable.
-   [ ] Evaluación automática.
-   [ ] Patrones usan varias partidas.
-   [ ] Muestra visible.
-   [ ] Progreso contra uno mismo.
-   [ ] No hay causalidad inventada.
-   [ ] "Mejora" existe como destino propio.
-   [ ] IA no es requisito para que el sistema sea útil.

------------------------------------------------------------------------

# 9. FASE 7 --- Cara a cara, Clash y Equipo

**Prioridad: P2**

No expandir por expandir. Primero auditar qué datos reales existen.

## Cara a cara

Debe enfocarse en comparación directa:

-   rango/LP;
-   forma reciente;
-   WR;
-   roles/campeones;
-   enfrentamientos o períodos comparables cuando existan;
-   diferencias claras sin declarar un "ganador general".

## Clash

Mantener únicamente funciones útiles para preparar/revisar Clash si los
datos existen.

Posibles áreas:

-   historial;
-   composición;
-   campeones frecuentes;
-   roles;
-   resultados.

## Equipo

Orientar a "cómo jugamos juntos".

Puede reutilizar datos de dúos/sinergia sin duplicar Estadísticas.

### Definition of Done Fase 7

-   [ ] Cada sección tiene propósito propio.
-   [ ] No duplica páginas.
-   [ ] No se agregan métricas sin utilidad.
-   [ ] Estados vacíos son compactos.
-   [ ] Mobile revisado.

------------------------------------------------------------------------

# 10. Reglas de UX para TODO el proyecto

## No convertir todo en cards

Usar primero:

-   jerarquía tipográfica;
-   proximidad;
-   spacing;
-   divisores;
-   alineación.

Cards solo cuando una superficie tenga sentido.

## Densidad

Objetivo:

**compacto + respirable**

No:

-   enorme espacio muerto;
-   texto minúsculo;
-   cards gigantes con dos datos.

## Mobile first

Validar como mínimo alrededor de:

-   390 px mobile;
-   tablet;
-   desktop.

No hacer desktop y luego comprimirlo.

## Color

-   dorado: identidad, selección, competición;
-   verde: positivo/victoria cuando semánticamente corresponda;
-   rojo: negativo/derrota;
-   gris: metadata;
-   blanco: contenido principal.

No usar verde para "el mejor" si el color identifica otra entidad/serie.

## Movimiento

Permitido:

-   hover;
-   focus;
-   opacity;
-   pequeñas transiciones;
-   expand/collapse.

Evitar:

-   glow fuerte;
-   partículas;
-   animaciones infinitas;
-   escalados grandes;
-   parallax.

## Texto

Preferir:

**dato + contexto corto**

sobre párrafos explicativos.

## Empty states

Un empty state no debe ocupar media pantalla si simplemente faltan
datos.

Cuando sea posible:

-   bajar umbral de forma razonable;
-   mostrar alternativa;
-   ocultar módulo;
-   explicar brevemente qué falta.

------------------------------------------------------------------------

# 11. Reglas de datos y analítica

## Nunca inventar

No inventar:

-   causas de derrota;
-   eventos;
-   tiempos;
-   historial;
-   promedios;
-   records;
-   tendencias.

## Muestras

Todo porcentaje relevante debe tener contexto de muestra.

Ejemplo:

`62% · 34 partidas`

No destacar `100%` sin mostrar que fueron `3 partidas`.

## Baselines

Para Mejora, priorizar comparación:

**jugador vs su propio historial**

antes que benchmarks externos.

## Históricos

Si actualmente no se persisten snapshots suficientes para calcular:

-   LP por día;
-   récords históricos;
-   tendencias;
-   cambios de rango;

crear primero una estrategia de persistencia/migración antes de mostrar
métricas falsas.

------------------------------------------------------------------------

# 12. Arquitectura técnica sugerida

Claude Code debe adaptar esto al stack real después de inspeccionarlo.

## Separación conceptual

Evitar componentes monolíticos.

Posibles unidades:

-   `AppHeader`
-   `PrimaryNav`
-   `HomeOverview`
-   `WeeklyLeaguePreview`
-   `LadderPreview`
-   `LivePlayers`
-   `RecentActivity`
-   `PlayerRankRow`
-   `LeagueRaceChart`
-   `LeaguePlayerDetail`
-   `LeagueDayGroup`
-   `LeagueMatchRow`
-   `StatsHighlights`
-   `RecentForm`
-   `ChampionSpecialists`
-   `DuoSynergy`
-   `GroupRecords`
-   `ImprovementFocus`
-   `PatternInsight`
-   `GoalProgress`
-   `MatchDiagnosis`

No crear estos nombres ciegamente. Reutilizar la estructura existente si
ya resuelve el problema.

## Lógica vs presentación

Separar:

-   cálculos;
-   selectors/transformaciones;
-   fetching;
-   UI.

Los cálculos de Liga y Mejora deben ser testeables sin renderizar
componentes.

------------------------------------------------------------------------

# 13. Performance

Especialmente importante porque Home será la entrada.

-   evitar requests duplicados;
-   reutilizar datos cargados;
-   paralelizar fetches independientes cuando corresponda;
-   evitar waterfalls;
-   lazy load de detalles pesados;
-   no cargar 50 partidas expandidas si están colapsadas y pueden
    obtenerse después;
-   skeletons discretos;
-   minimizar layout shift.

------------------------------------------------------------------------

# 14. Testing y validación

Cada fase debe incluir:

## Funcional

-   rutas;
-   filtros;
-   expansión;
-   búsqueda;
-   admin;
-   cálculos;
-   navegación;
-   estados vacíos;
-   loading/error.

## Responsive

Verificar manualmente al menos:

-   \~390 px;
-   tablet;
-   desktop.

## Datos

Para cada métrica nueva:

-   identificar fuente;
-   documentar fórmula;
-   manejar división por cero;
-   manejar muestras pequeñas;
-   manejar datos faltantes;
-   validar fechas/timezone.

## Regresión

No modificar fórmulas existentes sin una razón explícita y validada.

------------------------------------------------------------------------

# 15. Orden de ejecución recomendado

No intentar implementar todo en un único cambio.

### Sprint / PR 1

**Foundation** - auditoría; - header; - navbar; - rutas; -
tokens/componentes compartidos.

### Sprint / PR 2

**Home** - nueva ruta inicial; - Liga preview; - Top 3 Ladder; - live
players; - actividad si es viable.

### Sprint / PR 3

**Ranking** - polish mobile/desktop; - filtros; - cards/filas; -
sparklines.

### Sprint / PR 4

**Liga** - reglas/estado; - clasificación; - gráfico; - detalle por día.

### Sprint / PR 5

**Estadísticas** - destacados; - forma reciente; - especialistas; -
dúos; - records viables.

### Sprint / PR 6

**Motor de Mejora --- datos** - métricas; - baselines; - patrones; -
objetivos; - persistencia; - tests.

### Sprint / PR 7

**Mejora --- interfaz** - diagnóstico; - foco; - progreso; - patrones; -
matchup learning.

### Sprint / PR 8

**Cara a cara / Clash / Equipo** - consolidación; - evitar
duplicaciones; - estados vacíos.

### Sprint / PR 9

**Polish final** - performance; - accesibilidad; - responsive; -
consistencia; - cleanup.

------------------------------------------------------------------------

# 16. Qué NO hacer

No:

-   reescribir todo desde cero;
-   cambiar stack sin necesidad;
-   meter IA antes del motor de datos;
-   agregar gráficos porque sí;
-   llenar Home de KPIs;
-   convertir cada cosa en card;
-   usar neon/glow/gamer UI genérica;
-   copiar visualmente el cliente de Riot;
-   hardcodear ejemplos de este documento;
-   modificar fórmulas de Liga silenciosamente;
-   generar insights causales con datos correlacionales;
-   crear features que el dataset no puede sostener;
-   terminar una fase tras cambiar solo CSS superficial.

------------------------------------------------------------------------

# 17. Criterio de éxito final

La evolución debe sentirse así:

### Antes

**Entrar** → Ladder\
→ mirar números\
→ salir

### Después

**Entrar** → entender qué pasa en el grupo\
→ ver la competencia\
→ explorar posiciones y estadísticas\
→ abrir una partida\
→ entender qué ocurrió\
→ detectar un patrón\
→ elegir qué mejorar\
→ jugar de nuevo\
→ comprobar si mejoró

El loop de producto deseado es:

> **VER → COMPETIR → ENTENDER → MEJORAR → VOLVER**

------------------------------------------------------------------------

# 18. Instrucción de ejecución para Claude Code

Al recibir este documento:

1.  **NO implementar todo inmediatamente.**
2.  Auditar el repositorio.
3.  Crear un checklist técnico de la **Fase 1**.
4.  Indicar qué componentes/rutas/archivos serán modificados.
5.  Implementar Fase 1 completa.
6.  Ejecutar tests/lint/build disponibles.
7.  Revisar mobile y desktop.
8.  Informar:
    -   qué se cambió;
    -   qué se reutilizó;
    -   qué deuda/riesgo apareció;
    -   qué queda para la siguiente fase.
9.  Recién entonces continuar con Fase 2.
10. Repetir el mismo proceso para cada fase.

**No saltear fases silenciosamente.**

Si durante la auditoría se descubre que una feature posterior necesita
cambios de modelo de datos o persistencia, documentarlo primero y
preparar la base técnica en la fase correspondiente.

La prioridad es evolucionar el producto de forma controlada sin romper
lo que ya funciona.
