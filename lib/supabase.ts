import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client (service role — bypasses RLS, never expose this
 * key to the browser). Use inside Route Handlers / Server Components only.
 */
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing. Copy .env.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from your Supabase project settings."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Reintenta una consulta a Supabase cuando falla por algo TRANSITORIO.
 *
 * Existe por una noche entera de refrescos perdidos: el cron corría cada 15
 * minutos, contestaba 200 y no actualizaba a nadie. El log decía "cron refresh
 * failed: Gateway Timeout" — un 504 del gateway de Supabase en la PRIMERA
 * consulta de `refreshAllSummoners`, trece filas nada más. Como esa consulta
 * tiraba, el ciclo entero se perdía antes de tocar a ningún invocador, y como
 * los errores por invocador sí están atrapados, la única señal era esa línea
 * de log. Catorce invocadores marcados "sin actualizar" por un select que se
 * podía haber vuelto a intentar.
 *
 * Solo reintenta lo transitorio —timeouts, gateway, red cortada—. Un error de
 * permisos, una tabla que no existe o una columna mal escrita fallan igual en
 * el segundo intento: reintentarlos es perder tiempo y tapar un bug.
 *
 * Tres intentos y esperas cortas a propósito: esto corre cada 15 minutos
 * contra una base chica, y la idea es sobrevivir un hipo de dos segundos, no
 * insistirle a una base que está caída.
 */
export async function conReintento<T>(
  etiqueta: string,
  consulta: () => PromiseLike<{ data: T; error: { message: string } | null }>,
  intentos = 3,
): Promise<{ data: T; error: { message: string } | null }> {
  let ultimo: { data: T; error: { message: string } | null } = await consulta();
  for (let i = 1; i < intentos && esTransitorio(ultimo.error); i++) {
    // 800ms y 2,4s. Sumado al primer intento, el peor caso son ~3 segundos
    // antes de darse por vencido, que entra de sobra en el ciclo de 15 min.
    await new Promise((r) => setTimeout(r, 800 * 3 ** (i - 1)));
    console.warn(`${etiqueta}: reintento ${i + 1} de ${intentos} después de "${ultimo.error?.message}"`);
    ultimo = await consulta();
  }
  return ultimo;
}

/** Si el error huele a hipo de red o de gateway y no a un bug nuestro. */
function esTransitorio(error: { message: string } | null): boolean {
  if (!error) return false;
  return /timeout|gateway|fetch failed|network|socket|econn|terminated|503|504/i.test(error.message);
}
