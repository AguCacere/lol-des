/**
 * Explainer text for metrics that can read as ambiguous out of context.
 * Each one answers: qué es, cómo se calcula, por qué importa — shown via
 * InfoTip next to the metric wherever it appears (perfil, comparación, detalle
 * de partida), so the copy stays in one place instead of duplicated per component.
 */
export const METRIC_INFO = {
  killParticipation:
    "Porcentaje de las kills de tu equipo en las que participaste (tus kills + asistencias, sobre las kills totales del equipo en esa partida). Mide qué tan involucrado estás en las peleas de grupo.",
  objShare:
    "Tu parte del daño que el equipo le hizo a objetivos (torres, dragones, barón, heraldo), sobre el daño a objetivos total del equipo. Es una aproximación — Riot no expone directamente qué objetivos tomó cada jugador, solo el daño que le hizo a cada uno.",
  dmgShare:
    "Tu parte del daño a campeones sobre el total que hizo tu equipo en esa partida. Indica cuánto peso ofensivo tenés en las peleas, más allá de tu KDA.",
  visionScore:
    "Puntaje que arma Riot combinando wards puestos, wards enemigos destruidos y tiempo de control de wards — no es un conteo directo de wards. Mide tu control de visión del mapa.",
  csPerMin:
    "Minions y monstruos de jungla eliminados por minuto de partida. Es el proxy estándar de qué tan bien farmeás — más CS/min generalmente significa más oro y experiencia.",
  goldPerMin:
    "Oro total ganado dividido por la duración de la partida en minutos. Refleja tu economía general: farmeo, kills, asistencias y objetivos, todo junto.",
  peakLp:
    "El rango más alto que vimos en el historial que guardamos nosotros, no el pico histórico real de la cuenta — la API de Riot no expone rango histórico, solo el actual. Si la cuenta llegó más alto antes de que la agreguemos al grupo, no hay forma de recuperar ese dato.",
  goldDiffLane:
    "Tu oro total menos el del rival con tu mismo carril (mismo teamPosition) a ese minuto exacto, según el timeline de la partida — no es contra todo el equipo rival. En un lane swap puede identificar mal al rival; si no hay nadie con tu misma posición del otro equipo, no se muestra.",
} as const;
