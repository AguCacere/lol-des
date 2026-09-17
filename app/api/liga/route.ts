import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { exigirSesion } from "@/lib/auth";
import { getLatestVersion, profileIconUrl } from "@/lib/ddragon";
import { tablaDeLaSemana, puntosDeSecuencia, puntosPorDia, PUNTOS_VICTORIA, PUNTOS_DERROTA, PUNTOS_EN_RACHA, RACHA_DESDE, lpPorPartida, type AjusteLiga, type Participante, type RecordSemanal, type Snapshot } from "@/lib/liga";
import { claveDeTorneo, diaCorriente, diaDeCierre, diasDelCierre, duracionEnDias, empezoElUltimoDia, esTorneoDeLiga, etiquetasDeDias, LIGA_INICIO, torneoDe } from "@/lib/torneo";
import { DURACION_MINIMA_S, RANKED_SOLO_QUEUE_ID } from "@/lib/refresh";
import { roleFromTeamPosition } from "@/lib/mapping";

/**
 * GET  /api/liga  — la tabla de la semana en curso. Lectura libre: mirar quién
 *                   va ganando no le hace daño a nadie.
 * POST /api/liga  — { puuid, participa } anota o desanota a alguien. Pide la
 *                   contraseña: quién compite por el premio no lo decide
 *                   cualquiera que tenga el link.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json(
    { error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  // Las tres consultas que arman la tabla TIRAN el error en vez de tragárselo.
  // Antes solo se sacaba `data`: cuando Supabase fallaba —un 504 del pool
  // lleno, que en esta base ya pasó— venía undefined y la liga se dibujaba con
  // todos en "no jugó". Un 200 que miente sobre el marcador es peor que una
  // pantalla rota, porque nadie se entera de que hubo un problema.
  const { data: todos, error: eTodos } = await supabase
      .from("summoners")
      .select("puuid, game_name, tag_line, profile_icon_id, participa_liga, liga_desde, last_refreshed_at")
      .order("game_name");
  if (eTodos) {
    console.error("liga: no se pudo leer summoners —", eTodos.message);
    return NextResponse.json({ error: `No se pudo leer quiénes compiten: ${eTodos.message}` }, { status: 502 });
  }

  // La ventana ya no se deduce del calendario: sale de `liga_torneos` si hay
  // fila, y si no del lunes a domingo de siempre (ver lib/torneo.ts). Todo lo
  // que se mide va contra esta ventana.
  const torneo = await torneoDe(supabase);
  const desdeVentana = torneo.arranca;
  const fin = torneo.cierra;

  const anotados = (todos ?? []).filter((s) => s.participa_liga);

  // Cuándo se escribieron por última vez los datos que esta respuesta usa.
  //
  // El TopBar ya muestra un "actualizado hace X", pero ese sale de
  // /api/ladder, que es OTRA respuesta con OTRA entrada de caché. Las dos se
  // cachean 240s por su cuenta y vencen cuando se les canta, así que el cartel
  // de arriba puede decir "recién" mientras esta tabla es la de hace cuatro
  // minutos. Un reloj que mide otra cosa es peor que no tener reloj: la liga
  // necesita el suyo, atado al cuerpo que se está leyendo.
  //
  // El MÁS RECIENTE de los anotados, igual criterio que el ladder y por la
  // misma razón: last_refreshed_at se escribe al final de refreshOne, así que
  // uno que falla no la actualiza nunca y con el mínimo su fecha vieja se
  // llevaba puesto el cartel de todos (ver app/api/ladder/route.ts). Quién
  // está trabado ya lo avisa el TopBar aparte.
  const refrescos = anotados.map((s) => s.last_refreshed_at).filter((t): t is string => t != null);
  const actualizado = refrescos.length > 0 ? refrescos.reduce((max, t) => (t > max ? t : max)) : null;
  // Una sola consulta de versión para todos, y si Data Dragon no contesta la
  // tabla sale igual sin avatares — no vale romper la liga por un ícono.
  const version = await getLatestVersion().catch(() => null);
  const participantes: Participante[] = anotados.map((s) => ({
      puuid: s.puuid,
      name: s.game_name,
      tag: s.tag_line,
      profileIconUrl: version && s.profile_icon_id != null ? profileIconUrl(version, s.profile_icon_id) : null,
      desde: s.liga_desde ? new Date(s.liga_desde) : null,
  }));

  // Si la semana en curso es anterior al arranque, no se muestra nada: el LP
  // que ya está guardado es de antes de la liga y contarlo sería empezar el
  // campeonato con marcadores puestos.
  const arrancada = esTorneoDeLiga(torneo);
  // Distinto de `arrancada`: esa dice que la semana CUENTA para la liga (le
  // alcanza con terminar después del pistoletazo). Esta dice que el
  // pistoletazo YA SONÓ. Entre las dos hay un hueco —la primera semana
  // arrancó un lunes 23:30— en el que la tabla se dibujaba como una liga en
  // curso llena de ceros, sin nada que dijera que todavía no había empezado.
  const arrancoYa = Date.now() >= desdeVentana.getTime();

  let tabla: Awaited<ReturnType<typeof tablaDeLaSemana>> = [];
  if (arrancada && participantes.length > 0) {
      // Se pide desde una semana ANTES del lunes: la fila base de cada uno es su
      // última foto previa al arranque, y esa cae fuera de la ventana.
      const desdeAntes = new Date(desdeVentana.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const puuids = anotados.map((s) => s.puuid);
      const { data: snaps, error: eSnaps } = await supabase
        .from("lp_snapshots")
        .select("puuid, tier, division, lp, wins, losses, captured_at")
        .in("puuid", puuids)
        .eq("queue_type", "RANKED_SOLO_5x5")
        .gte("captured_at", desdeAntes)
        .lt("captured_at", fin.toISOString())
        .order("captured_at");

      // Las victorias y las derrotas se cuentan de las partidas REALES de la
      // ventana. Los contadores de lp_snapshots son acumulados de la season y
      // restarlos da bien solo si las dos puntas son válidas — ver la nota en
      // tablaDeLaSemana.
      const { data: partidas, error: ePartidas } = await supabase
        .from("matches")
        // kills/deaths/assists entran SOLO para el historial que se abre al
        // tocar una fila. No tocan el puntaje ni el orden de la tabla: la liga
        // se decide por resultado, no por cómo jugaste. Están acá porque abrir
        // la fila y ver "gané con Seraphine" sin saber si fue un 12/2 o un
        // 1/9 deja la mitad de la historia afuera.
        .select("match_id, puuid, win, played_at, champion, team_position, kills, deaths, assists, game_duration_s, ally_afk")
        .in("puuid", puuids)
        .eq("queue_id", RANKED_SOLO_QUEUE_ID)
        // Sin los remakes. Riot no los cuenta —ni LP, ni victoria, ni derrota—
        // y la liga sí los estaba contando: un punto o −0,75 por una partida de
        // cuatro minutos que nunca se jugó. Ver DURACION_MINIMA_S.
        .gte("game_duration_s", DURACION_MINIMA_S)
        // Las derrotas con un aliado ido NO se filtran acá, al revés que los
        // remakes, aunque tampoco puntúen. Se traen y se apartan más abajo
        // (`cuentan`), porque el desglose tiene que poder MOSTRARLAS sin
        // contarlas: un remake no se jugó y no extraña a nadie, pero una
        // derrota que pasó y no aparece en ningún lado parece un bug.
        // Además `lpPorPartida` las necesita para repartir bien el LP: si
        // faltara una partida del tramo, le atribuiría a otra lo que movieron
        // las dos.
        .gte("played_at", desdeVentana.toISOString())
        .lt("played_at", fin.toISOString());
      // Las dos de arriba se chequean juntas acá: sin fotos el marcador queda
      // sin LP y sin partidas queda sin puntaje, y en los dos casos la tabla
      // sale entera mal.
      const fallo = eSnaps ?? ePartidas;
      if (fallo) {
        console.error("liga: no se pudo leer la semana —", fallo.message);
        return NextResponse.json({ error: `No se pudo leer la semana: ${fallo.message}` }, { status: 502 });
      }
      // Se filtra por el arranque de CADA uno y no solo por el de la semana: el
      // que se anotó el miércoles no puede llevarse las partidas del lunes.
      const arranqueDe = new Map(participantes.map((p) => [p.puuid, Math.max(desdeVentana.getTime(), p.desde?.getTime() ?? 0)]));
      // Se juntan las partidas de cada uno antes de contar, en vez de sumar al
      // vuelo: la racha necesita el ORDEN y la consulta no lo garantiza.
      const suyasPorPuuid = new Map<string, { match_id: string; win: boolean; played_at: string; champion: string | null; team_position: string | null; kills: number; deaths: number; assists: number; game_duration_s: number; anulada: boolean }[]>();
      for (const m of partidas ?? []) {
        if (Date.parse(m.played_at) < (arranqueDe.get(m.puuid) ?? 0)) continue;
        const arr = suyasPorPuuid.get(m.puuid) ?? [];
        // Una derrota con un aliado ido queda anulada; la victoria con uno
        // menos no, que ganar con cuatro tiene más mérito, no menos.
        arr.push({ match_id: m.match_id, win: m.win, played_at: m.played_at, champion: m.champion, team_position: m.team_position, kills: m.kills, deaths: m.deaths, assists: m.assists, game_duration_s: m.game_duration_s, anulada: !m.win && m.ally_afk === true });
        suyasPorPuuid.set(m.puuid, arr);
      }
      // Las fotos de cada uno, para poder atribuirle el LP a cada partida.
      const fotosPorPuuid = new Map<string, Snapshot[]>();
      for (const f of (snaps ?? []) as Snapshot[]) {
        const arr = fotosPorPuuid.get(f.puuid) ?? [];
        arr.push(f);
        fotosPorPuuid.set(f.puuid, arr);
      }
      /** El valor que más se repite. En un empate gana el primero, que da igual. */
      const masRepetido = <T,>(valores: (T | null)[]): T | null => {
        const cuenta = new Map<T, number>();
        for (const v of valores) if (v != null) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
        let mejor: T | null = null;
        let max = 0;
        for (const [v, n] of cuenta) if (n > max) { mejor = v; max = n; }
        return mejor;
      };
      // El arranque del último día, para contar cuántas jugó ahí. Ver
      // MINIMO_ULTIMO_DIA: sin las tres del domingo no cobra.
      const arrancaUltimoDia = torneo.ultimoDesde.getTime();
      const recordPorPuuid = new Map<string, RecordSemanal>();
      for (const [puuid, suyas] of suyasPorPuuid) {
        // `suyas` son TODAS las de la semana y es lo único que ve el desglose;
        // `cuentan` son las que puntúan. Todo lo que decide la liga sale de
        // `cuentan` —el puntaje, la racha, el campeón de la semana, el mínimo
        // del último día y la curva—, así que una partida anulada no mueve
        // nada: solo se ve.
        suyas.sort((a, b) => Date.parse(b.played_at) - Date.parse(a.played_at));
        const cuentan = suyas.filter((m) => !m.anulada);
        const victorias = cuentan.filter((m) => m.win).length;
        const ultimoDia = cuentan.filter((m) => Date.parse(m.played_at) >= arrancaUltimoDia).length;
        // De la más nueva hacia atrás, contando mientras el resultado no
        // cambie. Puede no quedar ninguna: el que jugó una sola y se le fue un
        // compañero no tiene racha, igual que el que no jugó.
        const ultimo = cuentan.length > 0 ? cuentan[0].win : null;
        let cantidad = 0;
        for (const m of cuentan) {
          if (m.win !== ultimo) break;
          cantidad++;
        }
        // De la más vieja a la más nueva, que es como se juega y como hay que
        // recorrerla para contar las rachas.
        const enOrden = [...cuentan].reverse().map((m) => m.win);
        // Cuánto valió cada partida, en el mismo orden. Se calcula acá y no en
        // pantalla porque depende de las partidas ANTERIORES —la racha—, y el
        // detalle solo muestra las últimas cinco.
        const valeCadaUna = puntosDeSecuencia(enOrden).cadaUna;
        // Indexado por match_id y no por posición: la lista de abajo lleva las
        // anuladas intercaladas, así que las dos ya no se pueden recorrer en
        // paralelo. Antes era `valeCadaUna[suyas.length - 1 - i]` y con una
        // sola anulada en el medio todo lo anterior quedaba corrido un lugar.
        const valePorMatch = new Map<string, number>();
        [...cuentan].reverse().forEach((m, i) => valePorMatch.set(m.match_id, valeCadaUna[i]));
        // Con qué jugó la semana. No es "su campeón" ni "su rol" en general:
        // es lo que eligió ESTA semana, que en una liga de siete días es el
        // dato que explica el número de al lado.
        recordPorPuuid.set(puuid, {
          victorias,
          derrotas: cuentan.length - victorias,
          ultimoDia,
          racha: ultimo == null ? null : { resultado: ultimo ? "W" : "L", cantidad },
          champion: masRepetido(cuentan.map((m) => m.champion)),
          linea: roleFromTeamPosition(masRepetido(cuentan.map((m) => m.team_position))),
          // `suyas` quedó ordenada de la más NUEVA a la más vieja por la racha;
          // la curva la necesita al revés, como pasó de verdad.
          secuencia: enOrden,
          // El acumulado día por día, para la carrera de arriba de la tabla. Se
          // calcula acá porque es el único lugar donde están los `played_at`:
          // `secuencia` ya perdió el cuándo y se quedó solo con el resultado.
          // La cuadrícula es de días CALENDARIO argentinos, que es lo que
          // resuelve diaCorriente adentro. Ver lib/torneo.ts.
          porDia: puntosPorDia(
            cuentan.map((m) => ({ win: m.win, playedAt: m.played_at })),
            torneo,
          ),
          // TODAS las de la semana, con lo que movió cada una. Es lo que se abre
          // al tocar la fila.
          //
          // Eran las últimas cinco y por eso no servía para lo que se abre a
          // hacer: la pantalla dice "+7,25" y con cinco partidas de una semana
          // de cuarenta no hay forma de auditar de dónde salió ese número. La
          // liga se juega por plata entre gente que ya desconfía del cálculo —
          // por eso existe este detalle— así que recortarlo es recortar
          // justamente la prueba.
          //
          // No cuesta ninguna consulta más: estas partidas YA se trajeron todas
          // para armar la tabla, el slice solo achicaba la respuesta. Lo que
          // cuesta es payload, y la cuenta cierra: seis personas por una semana
          // brava de cuarenta partidas son unos 240 objetos, que comprimidos no
          // llegan a diez kilobytes, una vez cada cuatro minutos por la caché
          // del CDN.
          ultimas: lpPorPartida(
            fotosPorPuuid.get(puuid) ?? [],
            suyas.map((m) => ({
              matchId: m.match_id,
              champion: m.champion,
              win: m.win,
              // Cero, no null: null es "no sabemos" y acá sí sabemos — no
              // valió nada. La bandera de al lado es la que explica por qué.
              puntos: m.anulada ? 0 : (valePorMatch.get(m.match_id) ?? 0),
              anulada: m.anulada ? true : undefined,
              playedAt: m.played_at,
              kills: m.kills,
              deaths: m.deaths,
              assists: m.assists,
              duracionS: m.game_duration_s,
              lp: null,
              sinLp: null,
              lpTramo: null,
              juntas: 0,
            })),
          ),
        });
      }

      // Los ajustes a mano de esta semana (una penalización que votó el grupo,
      // por ejemplo). Consulta aparte y sin cortar en caso de error: es una
      // tabla que casi siempre está vacía, y si no se puede leer la liga tiene
      // que salir igual con el puntaje de las partidas — un ajuste que falta se
      // nota, una pantalla en blanco no se puede leer.
      const { data: ajustesRows, error: eAjustes } = await supabase
        .from("liga_ajustes")
        .select("puuid, puntos, motivo")
        .eq("semana", claveDeTorneo(torneo));
      if (eAjustes) console.error("liga: no se pudieron leer los ajustes —", eAjustes.message);
      // `puntos` es numeric y PostgREST lo manda como string: sin el Number,
      // "−2" + 3 da "−23" en vez de 1.
      const ajustes = new Map<string, AjusteLiga>(
        (ajustesRows ?? []).map((a) => [a.puuid as string, { puntos: Number(a.puntos), motivo: a.motivo as string }]),
      );

      tabla = tablaDeLaSemana(participantes, (snaps ?? []) as Snapshot[], desdeVentana, fin, recordPorPuuid, ajustes, {
        total: torneo.minimoTotal,
        ultimo: torneo.minimoUltimo,
      });
  }

  // La vitrina de campeones.
  //
  // Va con `select("*")` y no con la lista de columnas a propósito: `puntos` es
  // una columna nueva y las migraciones de esta base se corren a mano. Con la
  // lista explícita, un deploy antes de que la migración corra hace fallar el
  // select entero y la vitrina DESAPARECE de la pantalla sin decir por qué. Con
  // `*` vienen las columnas que existan y el que falte se lee como null. La
  // tabla tiene siete columnas chicas y el limit es 8: no hay nada que ahorrar.
  const { data: historial } = await supabase
      .from("liga_semanas")
      .select("*")
      .order("semana", { ascending: false })
      .limit(8);
  // El ganador se enriquece acá y no en el cliente: la foto sale de `todos`,
  // que ya está en memoria, y el nombre se separa del tag porque en una vitrina
  // el "#Arg" no aporta nada y se come el ancho.
  const porPuuid = new Map((todos ?? []).map((s) => [s.puuid, s]));
  const vitrina = (historial ?? []).map((h) => {
    const s = h.ganador_puuid ? porPuuid.get(h.ganador_puuid) : null;
    const label: string | null = h.ganador_label ?? null;
    return {
      semana: h.semana as string,
      puuid: (h.ganador_puuid as string | null) ?? null,
      // El label guardado es el respaldo: sobrevive a que se borre el invocador.
      nombre: s?.game_name ?? (label ? label.split("#")[0] : null),
      iconUrl: version && s?.profile_icon_id != null ? profileIconUrl(version, s.profile_icon_id) : null,
      puntos: (h.puntos as number | null) ?? null,
      // El lp_neto se sigue guardando pero no se manda: el LP no se mide en
      // esta liga, así que en la vitrina era un número de una unidad que no
      // compite puesto ahí por no dejar el lugar vacío.
      jugadores: (h.jugadores as number | null) ?? 0,
    };
  });

  return NextResponse.json(
    {
      arrancada,
      arrancoYa,
      arrancaEl: LIGA_INICIO.toISOString(),
      semana: claveDeTorneo(torneo),
      desde: desdeVentana.toISOString(),
      hasta: fin.toISOString(),
      // Las condiciones para cobrar, y si el último día ya arrancó. Van en la
      // respuesta y no como constantes en el cliente para que cambiar el número
      // en lib/liga.ts alcance: si el bundle viejo tuviera su propia copia,
      // durante la ventana de caché la pantalla exigiría un mínimo distinto del
      // que aplica el cierre.
      minimoSemanal: torneo.minimoTotal,
      minimoUltimoDia: torneo.minimoUltimo,
      // La tabla de puntos, por la misma razón: la regla escrita en pantalla
      // tiene que salir de las mismas constantes que la calculan.
      puntaje: { victoria: PUNTOS_VICTORIA, derrota: PUNTOS_DERROTA, rachaDesde: RACHA_DESDE, enRacha: PUNTOS_EN_RACHA },
      ultimoDia: empezoElUltimoDia(torneo),
      // En qué día se define y qué días cubre el mínimo del final. Van del
      // server porque el huso es argentino, y van como dato porque la pantalla
      // los tenía ESCRITOS A MANO ("Cierra el domingo", "Se define el
      // domingo") y con un torneo que cierra un lunes eso era mentira.
      cierraDia: diaDeCierre(torneo),
      diasDelCierre: diasDelCierre(torneo),
      // Los días del torneo y cuántos van corridos. Van del server porque el
      // huso es argentino y el cliente está en el reloj del que mira. El
      // gráfico se queda con los corridos; la barra dibuja todos, con los que
      // faltan en gris. Ya NO son siempre siete: un torneo puede durar ocho.
      dias: etiquetasDeDias(torneo),
      diasCorridos: diaCorriente(torneo),
      duracion: duracionEnDias(torneo),
      // Para que la pantalla pueda decir de qué torneo habla y si es editable.
      torneo: { id: torneo.id, nombre: torneo.nombre, guardado: torneo.guardado },
      tabla,
      // Para que la tabla pueda pedirle el arte del campeón a Data Dragon.
      ddragonVersion: version,
      // Va como marca de tiempo y no como "hace X minutos" ya escrito: este
      // cuerpo lo puede servir el CDN cuatro minutos después de armarlo, y un
      // texto fijo mentiría justo en esos cuatro minutos. Con la marca, el
      // reloj del que mira hace la resta y el cartel ENVEJECE con la respuesta
      // cacheada, que es exactamente lo que se quiere que muestre.
      actualizado,
      // Todos los trackeados, para que el panel de administración pueda anotar y
      // desanotar sin pedir el ladder entero.
      plantel: (todos ?? []).map((s) => ({
        puuid: s.puuid,
        name: s.game_name,
        tag: s.tag_line,
        participa: Boolean(s.participa_liga),
      })),
      historial: vitrina,
    },
    {
      // La liga NO tenía caché y es la tabla de la pestaña por defecto: cinco
      // consultas a Supabase —invocadores, fotos de una semana, partidas de la
      // semana, historial y plantel— por CADA visita de CADA uno. Con doce
      // amigos mirando, eso solo ya llena el pool de conexiones y el cron se
      // queda sin ninguna (ver DECISIONES: la caída de septiembre fue
      // exactamente eso). Los datos cambian cuando escribe el cron, cada 15
      // minutos, así que 240 segundos no atrasa nada que se pueda notar.
      headers: { "Cache-Control": "public, s-maxage=240, stale-while-revalidate=600" },
    },
  );
}

export async function POST(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  let body: { puuid?: unknown; participa?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body inválido — mandá JSON." }, { status: 400 });
  }
  if (typeof body.puuid !== "string" || typeof body.participa !== "boolean") {
    return NextResponse.json({ error: "Faltan puuid y/o participa." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  // Se sella el momento de entrada. Al desanotar se borra, así que volver a
  // entrar arranca de cero y no recupera lo de la primera vuelta.
  const { error } = await supabase
    .from("summoners")
    .update({ participa_liga: body.participa, liga_desde: body.participa ? new Date().toISOString() : null })
    .eq("puuid", body.puuid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
