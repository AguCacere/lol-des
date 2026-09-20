# Auditoría del estado actual — plan de evolución

> **Es una FOTO del 20 de septiembre de 2026, no un documento vivo.**
> Existe porque `GRIETA_CENTRAL_PLAN_EVOLUCION.md` §0 la pide antes de tocar código, y
> queda como registro de qué se encontró y qué decidió cada fase. **No lo actualices**:
> cuando algo de acá cambie, lo que vale es `ARQUITECTURA.md` (cómo está hecho),
> `DECISIONES.md` (por qué) y `PENDIENTES.md` (qué falta). Un documento que miente es
> peor que no tenerlo, y este envejece a propósito.

## Lo que se encontró

| Área | Estado al arrancar |
|---|---|
| **Rutas** | Una sola: `/`. No hay rutas por sección — son pestañas en estado de React. 23 route handlers en `app/api/*`. |
| **Header** | Ya rehecho en una sesión anterior: grilla de tres zonas, logo GC, buscador principal, candado al costado. Cumplía §3.1 entero. |
| **Navbar** | Ya rehecho: tabs subrayados, sin cápsula. Cumplía §3.2 menos "agregar Inicio". |
| **Tokens** | Sólidos y documentados en `:root`: superficies, bordes, texto, dorado, verde/rojo, radios, tipografías. No hay escala de spacing, y retrofitear 4.800 líneas de CSS a una no se hizo (ver abajo). |
| **Fuente de datos** | `/api/ladder` una vez → de ahí salen Ranking, Estadísticas y Cara a cara sin pedir nada más. Clash y Equipo, perezosos. La liga pedía `/api/liga` por su cuenta. |
| **Ladder** | Completo en datos. Se leía como planilla: banda de encabezado de columnas, y el nombre del tier pesando más que los LP. |
| **Liga** | Reglas ya compactas, estado ya agrupado, carrera ya con interacción y panel del día (sesión anterior). Faltaba el desplegable por día del detalle. |
| **Estadísticas** | Tres bloques (`TopWinrate`, `ChampionWinrateLeaderboard`, `DuoSynergy`). Sin filtro temporal. El de campeones con mínimo de 50 partidas. |
| **Cara a cara / Clash / Equipo** | Funcionando, sin tocar en estas fases. |
| **Detalle de partida** | `MatchDetail` + `MatchTimeline`, ya en dos columnas. |
| **Persistencia** | Supabase: `summoners`, `matches`, `lp_snapshots`, `champion_mastery`, `coach_reports`, `liga_ajustes`, `liga_semanas`, `liga_vetados`, vista `ladder`. |

## Lo que los datos SÍ permiten, y lo que no

Se verificó antes de prometer nada:

- **Sí**: partidas de hoy y su V/D (`Player.matches`), movimiento de LP y cambios de
  rango de las últimas 24 h (`lp_snapshots` → `Player.lpHistory`), rachas
  (`currentStreak`), top del ladder, el estado y la tabla de la liga.
- **No, o con asterisco**: `lpHistory` son las **últimas 20 fotos**, no una ventana de
  tiempo. Por eso `lib/actividad.ts` exige una foto anterior al corte antes de afirmar
  cuánto se movió alguien en 24 horas, y si no la hay se calla. Es la diferencia entre
  un feed y un feed que miente.
- **No se tocó** nada que necesite datos que no están guardados. No hay tabla de
  eventos y no se inventó una.

## Deuda técnica que apareció (y qué se hizo)

1. **El `1fr` que empuja el número contra el filo.** Tercera aparición. Se resolvió con
   ancho de lectura en `.inicio`; el patrón está en `DECISIONES.md` para no volver a
   descubrirlo.
2. **Dos componentes pidiendo `/api/liga`.** Resuelto con `components/useLiga.ts`.
3. **Sin escala de spacing en los tokens.** Se dejó así **a propósito**: meter una
   escala nueva y migrar 4.800 líneas de CSS a mano es un cambio de riesgo alto que no
   arregla nada visible, y el plan dice explícitamente que no se resuelven problemas de
   diseño con refactors indiscriminados. Los valores de cada bloque están donde se
   leen, con su porqué al lado, que es como está escrito el resto del archivo.
4. **Reglas CSS duplicadas al mismo nivel.** Ya había mordido tres veces en una sesión
   anterior. Se auditó de nuevo con
   `grep -nE '^\.[a-z0-9_.-]+\s*\{' app/globals.css` agrupando por selector: las ocho
   que aparecen dos veces son **aditivas y deliberadas** (la animación separada de la
   estructura, el responsive aparte), ninguna se pisa. Queda el comando anotado.
5. **`LiveTray` flota sobre el contenido.** Es de antes y vale para toda la app, no
   solo para Inicio. Con el ancho de lectura dejó de taparle nada a Inicio. No se tocó.

## Lo que cada fase cambió

- **Fase 1** — `Inicio` en `TabNav` y en la paleta ⌘K. Header y navbar ya cumplían.
- **Fase 2** — `components/Inicio.tsx`, `lib/actividad.ts`, `components/useLiga.ts`; la
  app abre en Inicio.
- **Fase 3** — fuera la banda de encabezado del ladder; el LP manda sobre el nombre del
  tier; dos filtros que se explican solos en vez de cuatro elementos; la salida a la
  liga baja el volumen.
- **Fase 4** — el detalle de la liga se despliega por día, con el día nuevo abierto, el
  récord V/D en el encabezado y la marca del bonus de racha en las partidas que
  valieron 1,25.

El porqué de cada una está en `DECISIONES.md`.
