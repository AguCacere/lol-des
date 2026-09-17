#!/usr/bin/env node
/**
 * Le registra a Discord los comandos del bot.
 *
 * Esto NO es parte del deploy: se corre a mano, y solo cuando cambia la lista
 * de `lib/discord-comandos.json` (un comando nuevo, una descripción, una
 * opción). El código de los comandos se despliega con la app como cualquier
 * ruta; lo que se registra acá es el menú que Discord le muestra a la gente
 * cuando tipea "/". Son dos cosas distintas y esa es la confusión típica: si
 * agregás un comando y no corrés esto, funciona pero no aparece en la lista.
 *
 *   node --env-file=.env.local scripts/registrar-comandos.mjs
 *
 * Con `DISCORD_GUILD_ID` los registra en ESE servidor y aparecen al instante.
 * Sin él los registra globales, que es lo mismo pero Discord tarda hasta una
 * hora en propagarlos. Para un server de amigos conviene siempre el guild: si
 * te equivocaste en una descripción, la corrección se ve enseguida.
 */
import { readFile } from "node:fs/promises";

const APP_ID = process.env.DISCORD_APP_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!APP_ID || !TOKEN) {
  console.error(
    "Faltan DISCORD_APP_ID y/o DISCORD_BOT_TOKEN.\n" +
      "Salen de discord.com/developers → tu aplicación: el id en General Information, el token en Bot.\n" +
      "Corré:  node --env-file=.env.local scripts/registrar-comandos.mjs",
  );
  process.exit(1);
}

const comandos = JSON.parse(await readFile(new URL("../lib/discord-comandos.json", import.meta.url), "utf8"));

// PUT y no POST: PUT reemplaza la lista ENTERA. Con POST, un comando que se
// saca del JSON queda registrado para siempre y sigue apareciendo en el menú
// aunque el código ya no lo conteste.
const url = GUILD_ID
  ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${APP_ID}/commands`;

const res = await fetch(url, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Authorization: `Bot ${TOKEN}` },
  body: JSON.stringify(comandos),
});

if (!res.ok) {
  console.error(`Discord rechazó el registro: ${res.status}`);
  console.error(await res.text());
  process.exit(1);
}

const registrados = await res.json();
console.log(
  `Listos ${registrados.length} comandos ${GUILD_ID ? `en el server ${GUILD_ID} (ya aparecen)` : "globales (hasta 1 hora en aparecer)"}:`,
);
for (const c of registrados) console.log(`  /${c.name} — ${c.description}`);
