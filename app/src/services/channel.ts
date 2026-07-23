/**
 * Configuración del canal de WhatsApp resuelta en tiempo de ejecución.
 *
 * El token permanente de Meta caduca/rota y el dueño lo pega desde el panel
 * (Ajustes → Canal) sin redeploy. La DB (settings key 'channel_config') gana
 * sobre las variables de entorno; el entorno queda como respaldo.
 *
 * Seguridad: el token y el app secret NUNCA se devuelven en claro al hub
 * (ver getPublicChannelConfig). Solo se indica si están configurados.
 */
import { z } from "zod";
import { sql } from "../db/client.js";
import { config } from "../config.js";

export const ChannelConfigSchema = z.object({
  /** Token permanente (System User) para la Graph API. */
  token: z.string().max(1000).default(""),
  /** Phone Number ID del número del negocio. */
  phoneId: z.string().max(60).default(""),
  /** Verify token del webhook (lo eliges tú y lo pones también en Meta). */
  verifyToken: z.string().max(200).default(""),
  /** App Secret para validar la firma del webhook. */
  appSecret: z.string().max(200).default(""),
  /** Número del vendedor que recibe alertas (internacional sin +). */
  sellerPhone: z.string().max(30).default(""),
});

export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

function envFallback(): ChannelConfig {
  return {
    token: config.whatsapp.token,
    phoneId: config.whatsapp.phoneId,
    verifyToken: config.whatsapp.verifyToken,
    appSecret: config.whatsapp.appSecret,
    sellerPhone: config.whatsapp.sellerPhone,
  };
}

async function readStored(): Promise<Partial<ChannelConfig>> {
  const [row] = await sql<{ value: unknown }[]>`
    select value from settings where key = 'channel_config'
  `;
  const parsed = ChannelConfigSchema.partial().safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : {};
}

const CACHE_TTL_MS = 15_000;
let cache: { value: ChannelConfig; at: number } | null = null;

/** Config efectiva: la DB gana campo por campo si tiene valor; si no, el entorno. */
export async function getChannelConfig(): Promise<ChannelConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const env = envFallback();
  const stored = await readStored();
  const pick = (dbVal: string | undefined, envVal: string) =>
    dbVal && dbVal.trim() ? dbVal.trim() : envVal;
  const merged: ChannelConfig = {
    token: pick(stored.token, env.token),
    phoneId: pick(stored.phoneId, env.phoneId),
    verifyToken: pick(stored.verifyToken, env.verifyToken),
    appSecret: pick(stored.appSecret, env.appSecret),
    sellerPhone: pick(stored.sellerPhone, env.sellerPhone),
  };
  cache = { value: merged, at: Date.now() };
  return merged;
}

/**
 * Guarda solo los campos enviados con valor: dejar un campo en blanco mantiene
 * lo que ya estaba (no borra el token por guardar el resto del formulario).
 */
export async function saveChannelConfig(input: unknown): Promise<ChannelConfig> {
  const partial = ChannelConfigSchema.partial().parse(input ?? {});
  const stored = await readStored();
  const next: Record<string, string> = { ...stored } as Record<string, string>;
  for (const [key, val] of Object.entries(partial)) {
    if (typeof val === "string" && val.trim()) next[key] = val.trim();
  }
  await sql`
    insert into settings (key, value)
    values ('channel_config', ${sql.json(next as never)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  cache = null;
  return getChannelConfig();
}

export interface PublicChannelConfig {
  phoneId: string;
  sellerPhone: string;
  verifyToken: string;
  tokenSet: boolean;
  appSecretSet: boolean;
  /** De dónde sale el token efectivo: útil para diagnóstico en el panel. */
  tokenSource: "settings" | "env" | "none";
  ready: boolean;
}

/** Vista segura para el hub: nunca expone token ni appSecret en claro. */
export async function getPublicChannelConfig(): Promise<PublicChannelConfig> {
  const env = envFallback();
  const stored = await readStored();
  const resolved = await getChannelConfig();
  const tokenSource: PublicChannelConfig["tokenSource"] = stored.token?.trim()
    ? "settings"
    : env.token
      ? "env"
      : "none";
  return {
    phoneId: resolved.phoneId,
    sellerPhone: resolved.sellerPhone,
    verifyToken: resolved.verifyToken,
    tokenSet: Boolean(resolved.token),
    appSecretSet: Boolean(resolved.appSecret),
    tokenSource,
    ready: Boolean(resolved.token && resolved.phoneId),
  };
}
