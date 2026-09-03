/**
 * Nombre lindo de un campeón a partir del id de Riot.
 *
 * Todo lo que guardamos y mostramos usa el id de Data Dragon —
 * `matches.champion`, `champion_mastery.champion`, el campeón de la partida
 * en vivo — porque es lo que las URLs del CDN necesitan para el arte (ver
 * championIconUrl). El problema es que ese id no siempre es el nombre: para
 * unos veinte campeones difiere, y ahí la pantalla decía "Kaisa",
 * "MonkeyKing" o "DrMundo".
 *
 * Se resuelve en el cliente y no trayendo el mapa de Data Dragon en cada
 * respuesta de la API: son ~170 entradas que no cambian entre patches y que
 * no vale la pena mandar por la red en cada carga del ladder para arreglar
 * un puñado de nombres.
 *
 * La división es a propósito: IRREGULARES abajo tiene SOLO lo que no se
 * puede derivar (apóstrofos, puntos, y Wukong, que directamente no se parece
 * a su id). Todo lo demás — los ids que son dos palabras pegadas — sale solo
 * del split de camelCase, así que un campeón nuevo tipo "SomeNewChamp" se va
 * a ver bien sin tocar nada. Si sale uno con apóstrofo, hasta que se agregue
 * acá se muestra su id crudo, que es exactamente lo que pasaba antes: el
 * peor caso es el estado actual, nunca algo roto.
 */
const IRREGULARES: Record<string, string> = {
  Belveth: "Bel'Veth",
  Chogath: "Cho'Gath",
  DrMundo: "Dr. Mundo",
  FiddleSticks: "Fiddlesticks",
  Kaisa: "Kai'Sa",
  Khazix: "Kha'Zix",
  KogMaw: "Kog'Maw",
  KSante: "K'Sante",
  Leblanc: "LeBlanc",
  MonkeyKing: "Wukong",
  Nunu: "Nunu & Willump",
  RekSai: "Rek'Sai",
  Renata: "Renata Glasc",
  Velkoz: "Vel'Koz",
};

/**
 * "JarvanIV" → "Jarvan IV", "MissFortune" → "Miss Fortune". Mete un espacio
 * antes de cada mayúscula precedida por minúscula; los grupos de mayúsculas
 * seguidas (el "IV" de Jarvan) quedan enteros.
 */
function separarCamelCase(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** El nombre como lo escribe Riot, a partir del id que guardamos nosotros. */
export function championLabel(championId: string): string {
  return IRREGULARES[championId] ?? separarCamelCase(championId);
}
