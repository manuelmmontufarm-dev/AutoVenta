/**
 * LO QUE EL CLIENTE MANDA Y EL BOT NO CONTESTA, PERO EL PANEL SÍ TIENE QUE MOSTRAR.
 *
 * De dónde sale (25-nov-2026, Competimotor, conv 1321): el asesor retomó un
 * chat desde su WhatsApp y en el panel no se veía nada más del cliente. Al
 * buscar por qué, apareció que una reacción (👍), un mensaje que Meta entrega
 * como `unsupported` (encuesta, mensaje temporal, editado…), un pedido del
 * catálogo o un aviso de sistema se descartaban con un `break`: sin fila en
 * `messages`, sin línea en el log. Imposible saber después si el cliente
 * escribió algo o no.
 *
 * La regla nueva: TODO lo que entra deja una fila. Estos mensajes siguen sin
 * despertar al bot (contestarle «mándeme la medida» a un 👍 es ruido), pero
 * quedan guardados como texto entre corchetes, igual que un audio o una foto,
 * para que el asesor los lea en la app.
 *
 * Aquí vive solo la lectura del payload (pura). Guardar es de `index.ts`.
 */

export type ClaseDeMudo = "reaccion" | "no_soportado" | "pedido" | "sistema" | "formulario" | "boton_vacio";

export interface EntranteMudo {
  clase: ClaseDeMudo;
  /** Lo que se guarda en `messages.content` y ve el asesor. */
  texto: string;
  /**
   * ¿Cuenta como «el cliente escribió»? Una reacción no: no debe mover el
   * reloj de la ventana de 24 h ni el de los seguimientos.
   */
  cuentaComoActividad: boolean;
  /** Detalle crudo para `metadata` (emoji, id del mensaje reaccionado, error de Meta). */
  detalle: Record<string, unknown>;
}

type Suelto = Record<string, unknown>;
const obj = (v: unknown): Suelto => (v && typeof v === "object" ? (v as Suelto) : {});
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Devuelve cómo guardar un mensaje que no entra al pipeline, o null si el
 * mensaje SÍ tiene camino propio (texto, foto, audio, botón con respuesta…).
 */
export function entranteMudo(message: unknown): EntranteMudo | null {
  const m = obj(message);
  const tipo = str(m.type);

  if (tipo === "reaction") {
    const r = obj(m.reaction);
    const emoji = str(r.emoji);
    return {
      clase: "reaccion",
      texto: emoji ? `[El cliente reaccionó con ${emoji} a un mensaje]` : "[El cliente quitó su reacción a un mensaje]",
      cuentaComoActividad: false,
      detalle: { emoji: emoji || null, aMensaje: str(r.message_id) || null },
    };
  }

  if (tipo === "unsupported" || tipo === "unknown") {
    const error = obj((Array.isArray(m.errors) ? m.errors : [])[0]);
    const motivo = str(error.title) || str(error.message);
    return {
      clase: "no_soportado",
      texto:
        "[El cliente mandó un mensaje que WhatsApp no entrega al sistema (encuesta, mensaje temporal, "
        + "mensaje editado o similar). Solo se puede ver en el WhatsApp del celular del negocio.]",
      cuentaComoActividad: true,
      detalle: { waType: tipo, ...(motivo ? { motivo } : {}), ...(error.code ? { codigo: error.code } : {}) },
    };
  }

  if (tipo === "order") {
    const o = obj(m.order);
    const items = Array.isArray(o.product_items) ? o.product_items.length : 0;
    const nota = str(o.text);
    return {
      clase: "pedido",
      texto:
        `[El cliente mandó un pedido desde el catálogo de WhatsApp${items ? ` (${items} producto${items === 1 ? "" : "s"})` : ""}. `
        + `Véalo en el WhatsApp del celular del negocio.]${nota ? `\n${nota}` : ""}`,
      cuentaComoActividad: true,
      detalle: { productos: items },
    };
  }

  if (tipo === "system") {
    const cuerpo = str(obj(m.system).body);
    return {
      clase: "sistema",
      texto: `[Aviso de WhatsApp${cuerpo ? `: ${cuerpo}` : " sobre este contacto (por ejemplo, cambió de número)"}]`,
      cuentaComoActividad: false,
      detalle: { waType: tipo },
    };
  }

  if (tipo === "interactive") {
    const inter = obj(m.interactive);
    if ("button_reply" in inter || "list_reply" in inter) return null;
    return {
      clase: "formulario",
      texto:
        "[El cliente respondió un formulario o mensaje interactivo de WhatsApp que el sistema no lee. "
        + "Véalo en el WhatsApp del celular del negocio.]",
      cuentaComoActividad: true,
      detalle: { waType: tipo, subtipo: str(inter.type) || null },
    };
  }

  if (tipo === "button") {
    const b = obj(m.button);
    if (str(b.text) || str(b.payload)) return null;
    return {
      clase: "boton_vacio",
      texto: "[El cliente tocó un botón de una plantilla, pero WhatsApp no dijo cuál.]",
      cuentaComoActividad: true,
      detalle: { waType: tipo },
    };
  }

  return null;
}

/**
 * Último recurso: el texto con el que se guarda un mensaje cuyo procesamiento
 * falló todas las veces que Meta lo reintentó. Antes de esto se dejaba de pedir
 * reintento y el mensaje desaparecía con una línea en el log como única huella.
 */
export function textoDeRescate(message: unknown): string {
  const m = obj(message);
  const tipo = str(m.type);
  if (tipo === "text") {
    const cuerpo = str(obj(m.text).body);
    if (cuerpo) return cuerpo;
  }
  const mudo = entranteMudo(message);
  if (mudo) return mudo.texto;
  const pie = str(obj(m[tipo]).caption);
  const que: Record<string, string> = {
    image: "una foto", audio: "un audio", video: "un video", document: "un archivo",
    sticker: "un sticker", location: "su ubicación", contacts: "un contacto",
  };
  return `[El cliente mandó ${que[tipo] ?? "un mensaje"} y el sistema no lo pudo procesar. `
    + `Véalo en el WhatsApp del celular del negocio.]${pie ? `\n${pie}` : ""}`;
}

/** El mensaje y su remitente dentro de UNA novedad ya separada del lote; null si no trae mensaje. */
export function mensajeDeLaNovedad(parte: unknown): { message: Suelto; from: string; name?: string } | null {
  const entry = obj((Array.isArray(obj(parte).entry) ? (obj(parte).entry as unknown[]) : [])[0]);
  const change = obj((Array.isArray(entry.changes) ? entry.changes : [])[0]);
  if (change.field !== "messages") return null;
  const value = obj(change.value);
  const message = obj((Array.isArray(value.messages) ? value.messages : [])[0]);
  if (!str(message.id)) return null;
  const contacto = obj((Array.isArray(value.contacts) ? value.contacts : [])[0]);
  const from = str(contacto.wa_id) || str(message.from);
  if (!from) return null;
  const name = str(obj(contacto.profile).name) || undefined;
  return { message, from, ...(name ? { name } : {}) };
}
