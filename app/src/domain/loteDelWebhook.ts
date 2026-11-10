/**
 * UN WEBHOOK DE META PUEDE TRAER VARIOS MENSAJES, Y SE LEÍA SOLO EL PRIMERO.
 *
 * `whatsapp-api-js` despacha `entry[0].changes[0].messages[0]` (o
 * `statuses[0]`) y tira el resto sin avisar. Meta junta varias novedades en un
 * mismo POST cuando llegan muchas a la vez o cuando reentrega lo que tenía en
 * cola — justo lo que pasa con una ola de anuncios (10-nov, 9:30–9:41: nueve
 * leads de anuncio en once minutos, ninguno contestado ni visible en el panel).
 * Los que no eran el primero del lote no llegaban a `messages`: sin fila, sin
 * evento en el panel, sin seguimiento y sin respuesta.
 *
 * Aquí el lote se parte en payloads de UNA novedad cada uno, con la misma forma
 * que Meta manda, para que la librería despache cada uno por su cuenta. El
 * contacto (`contacts`) que acompaña a cada mensaje se conserva: de ahí sale el
 * nombre del cliente.
 *
 * Puro: no toca la base ni la red.
 */

type Json = Record<string, unknown>;

const esObjeto = (v: unknown): v is Json => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * EL CONTACTO SIN `profile` TUMBABA EL WEBHOOK (10-nov, producción).
 *
 * La librería lee `contact?.profile.name`: si el contacto viene pero sin
 * `profile` —Meta lo manda así para algunos clientes, entre ellos leads de
 * anuncio— lanza `TypeError: Cannot read properties of undefined (reading
 * 'name')` ANTES de llegar a nuestro handler. Respondía 500, Meta reintentaba
 * el mismo payload y el mensaje nunca se guardaba: ni respuesta ni fila en el
 * panel. Un contacto sin perfil es un cliente sin nombre, no un error.
 */
function conPerfil(contacto: unknown): unknown {
  if (!esObjeto(contacto)) return contacto;
  return esObjeto(contacto.profile) ? contacto : { ...contacto, profile: {} };
}

/** Contacto del mensaje: el de su `wa_id`; si no se encuentra, el único que vino. */
function contactoDe(mensaje: Json, contactos: unknown[]): unknown[] {
  if (!contactos.length) return [];
  const desde = typeof mensaje.from === "string" ? mensaje.from : null;
  const propio = desde ? contactos.find((c) => esObjeto(c) && c.wa_id === desde) : undefined;
  if (propio) return [conPerfil(propio)];
  return contactos.length === 1 ? [conPerfil(contactos[0])] : [];
}

/**
 * Parte el payload en una lista de payloads con una sola novedad (un mensaje,
 * un status o un cambio de otro tipo). Un payload que no se reconoce vuelve tal
 * cual, para que la librería decida qué hacer con él.
 */
export function separarLote(payload: unknown): unknown[] {
  if (!esObjeto(payload) || !Array.isArray(payload.entry)) return [payload];
  const partes: unknown[] = [];
  for (const entry of payload.entry) {
    if (!esObjeto(entry)) continue;
    for (const change of lista(entry.changes)) {
      if (!esObjeto(change)) continue;
      const value = esObjeto(change.value) ? change.value : null;
      const envolver = (nuevoValue: Json): Json => ({
        ...payload,
        entry: [{ ...entry, changes: [{ ...change, value: nuevoValue }] }],
      });
      const mensajes = value ? lista(value.messages) : [];
      const statuses = value ? lista(value.statuses) : [];
      if (!value || (!mensajes.length && !statuses.length)) {
        partes.push(envolver(value ?? {}));
        continue;
      }
      const { messages: _m, statuses: _s, contacts, ...resto } = value;
      for (const m of mensajes) {
        if (!esObjeto(m)) continue;
        partes.push(envolver({ ...resto, contacts: contactoDe(m, lista(contacts)), messages: [m] }));
      }
      for (const s of statuses) {
        partes.push(envolver({ ...resto, statuses: [s] }));
      }
    }
  }
  return partes.length ? partes : [payload];
}

/**
 * Resumen de una novedad para el log: tipo y últimos 4 dígitos, nunca el
 * teléfono entero ni el texto del cliente.
 */
export function resumenDeNovedad(parte: unknown): string {
  const value = esObjeto(parte) && Array.isArray(parte.entry)
    ? (parte.entry[0] as Json | undefined)?.changes
    : undefined;
  const change = Array.isArray(value) && esObjeto(value[0]) ? value[0] : null;
  const v = change && esObjeto(change.value) ? change.value : null;
  const m = v && Array.isArray(v.messages) && esObjeto(v.messages[0]) ? v.messages[0] : null;
  const s = v && Array.isArray(v.statuses) && esObjeto(v.statuses[0]) ? v.statuses[0] : null;
  const fin = (x: unknown) => (typeof x === "string" ? `···${x.slice(-4)}` : "?");
  if (m) return `mensaje ${String(m.type ?? "?")} de ${fin(m.from)} (${String(m.id ?? "sin id")})`;
  if (s) return `status ${String(s.status ?? "?")} a ${fin(s.recipient_id)} (${String(s.id ?? "sin id")})`;
  return `cambio ${String(change?.field ?? "?")}`;
}

/** Id de la novedad (mensaje o status), para contar sus fallas. */
export function idDeNovedad(parte: unknown): string | null {
  const r = resumenDeNovedad(parte).match(/\(([^)]+)\)$/);
  return r && r[1] !== "sin id" ? r[1] : null;
}
