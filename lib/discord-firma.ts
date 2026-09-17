import { createPublicKey, verify } from "node:crypto";

/**
 * La puerta del bot: verificar que cada pedido lo mandó Discord y no cualquiera.
 *
 * Discord firma **cada** interacción con Ed25519 y manda la firma en
 * `X-Signature-Ed25519` y el timestamp en `X-Signature-Timestamp`. Lo que se
 * firma es `timestamp + cuerpo crudo`. Sin esta verificación el endpoint queda
 * abierto: cualquiera que sepa la URL puede hacerle POST y disparar una cargada
 * en el canal del grupo.
 *
 * No hace falta ninguna dependencia nueva: Node hace Ed25519 nativo desde la
 * v12. Lo único incómodo es que `crypto` quiere la clave pública en formato DER
 * y Discord la da en hexa cruda de 32 bytes — de ahí el prefijo de abajo.
 *
 * **El cuerpo tiene que ser el texto CRUDO**, tal cual llegó. Si se parsea a
 * JSON y se vuelve a serializar, cambia un espacio y la firma no valida nunca.
 * Por eso la ruta hace `await req.text()` y recién después `JSON.parse`.
 */

/**
 * El encabezado DER de una SubjectPublicKeyInfo Ed25519. Son los mismos doce
 * bytes siempre —el OID 1.3.101.112 y los largos— así que pegarle adelante los
 * 32 bytes de la clave da un DER válido sin traer una librería de ASN.1.
 */
const DER_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

/** Los 32 bytes de la clave son 64 caracteres hexa. */
const LARGO_CLAVE_HEX = 64;
/** Una firma Ed25519 son 64 bytes: 128 caracteres hexa. */
const LARGO_FIRMA_HEX = 128;

/**
 * `Buffer.from(x, "hex")` no falla con basura: corta en el primer carácter que
 * no es hexa y devuelve lo que pudo. Un "no es hexa" se convertiría en un
 * buffer corto y la verificación diría "firma inválida", que es la respuesta
 * correcta pero por el motivo equivocado. Mejor chequear el largo antes.
 */
function hexValido(s: string, largo: number): boolean {
  return s.length === largo && /^[0-9a-fA-F]+$/.test(s);
}

/**
 * Si el pedido lo firmó Discord de verdad.
 *
 * Devuelve false —y no tira— ante cualquier cosa rara: falta un header, la
 * clave no está configurada, la firma no es hexa. La ruta contesta 401 y
 * listo. Discord ADEMÁS exige ese 401: si el endpoint acepta una firma
 * inválida, no deja guardar la URL.
 *
 * No se mira la antigüedad del timestamp a propósito. Repetir un pedido viejo
 * solo puede volver a disparar un comando de lectura, y una ventana de
 * tolerancia agrega fallas por reloj corrido a cambio de nada. Si algún día el
 * bot escribe, esto se revisa.
 */
export function firmaValida(cuerpoCrudo: string, firma: string | null, timestamp: string | null): boolean {
  const clave = process.env.DISCORD_PUBLIC_KEY;
  // Sin clave configurada NO pasa nadie. Es el mismo criterio que APP_PASSWORD
  // en lib/auth.ts: que falte la cerradura es exactamente el caso en el que no
  // hay que dejar entrar a nadie.
  if (!clave || !firma || !timestamp) return false;
  if (!hexValido(clave, LARGO_CLAVE_HEX) || !hexValido(firma, LARGO_FIRMA_HEX)) return false;

  try {
    const publica = createPublicKey({
      key: Buffer.concat([DER_ED25519, Buffer.from(clave, "hex")]),
      format: "der",
      type: "spki",
    });
    // El `null` del primer argumento es "sin hash previo", que es como se firma
    // en Ed25519 (el hash va adentro del algoritmo).
    return verify(null, Buffer.from(timestamp + cuerpoCrudo), publica, Buffer.from(firma, "hex"));
  } catch (err) {
    console.error("No pude verificar la firma de Discord —", err instanceof Error ? err.message : err);
    return false;
  }
}
