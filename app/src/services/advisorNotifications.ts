import { z } from "zod";
import { config } from "../config.js";
import { sql } from "../db/client.js";
import { sendAdvisorText } from "../wa/client.js";
import { emitLiveEvent } from "./liveEvents.js";

/**
 * Todos los avisos que existen, como lista y no como unión suelta: el tipo sale
 * de aquí, así que una prueba puede recorrerlos uno por uno y comprobar que
 * ninguno se quedó sin cabecera ni sin decisión de a quién le llega. Un evento
 * nuevo que se olvide en esos mapas rompe el test, no la producción.
 */
export const EVENTOS_AVISO = [
  "human_requested",
  "quote_created",
  "customer_ready_to_buy",
  "negative_sentiment",
  "customer_opt_out",
  "repetitive_conversation",
  "send_error",
  // Guardián de salida (5-ago): el envío se bloqueó y alguien debe saberlo.
  "guard_bot_atascado",
  "guard_idea_repetida",
  "guard_pide_foto",
  "guard_mensaje_duplicado",
  "guard_saludo_repetido",
  // Corrector de precios (15-ago): una cifra del borrador contradecía la
  // cotización y se corrigió antes de enviarse. Prioridad media — nunca llega
  // por WhatsApp; existe aquí para que el tipo quede declarado con su cabecera.
  "guard_precio_ajustado",
  "guard_stock_recordado",
  // Watchdog (6-ago): el bot quedó apagado y los clientes siguieron escribiendo.
  "bot_apagado_con_clientes",
  // Visitas (7-ago): una fecha que nadie mira no sirve de nada.
  "visita_comprometida",
  "visita_manana",
  // El día mismo (14-ago): la víspera sirve para preparar, hoy para atender.
  "visita_hoy",
  // Escalamientos sin visita (8-ago): el cliente de Yantzaza pidió despacho, el
  // bot le dijo "lo revisamos con un asesor" y ningún asesor se enteró nunca.
  "envio_fuera_de_cobertura",
  "caso_sin_resolver",
  // Ventana de 24 h a punto de cerrarse (14-ago): para Manuel era ruido, para el
  // asesor de local es su trabajo. Ver `recibeEvento`.
  "ventana_por_cerrar",
] as const;

export type AdvisorEventType = (typeof EVENTOS_AVISO)[number];

/**
 * El nivel de un asesor es el id de uno de los niveles configurados en Ajustes.
 *
 * Hasta el 24-oct eran dos fijos —`admin` («Todo») y `asesor` («Solo local»)—
 * y Manuel pidió nombres claros y poder crear más. Los dos ids viejos siguen
 * existiendo como Nivel 1 y Nivel 2: nadie que ya estaba dado de alta pierde un
 * aviso. Un id que no existe se trata como el PRIMER nivel: equivocarse hacia
 * «recibe de más» se nota y se corrige; hacia «no recibe nada», no.
 */
export type RolAsesor = string;

/** Forma válida de un id de nivel (lo que se guarda en `advisors.rol`). */
export const ID_NIVEL = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * Categorías de aviso: solo para agrupar en el panel. Desde el 24-oct cada
 * nivel elige aviso por aviso (Manuel: «que haya una opción para todos los
 * tipos de avisos»); la categoría ordena la lista y permite marcar un grupo
 * entero de un clic. Cada evento pertenece a exactamente una categoría — el
 * test recorre la lista y no deja que un evento nuevo se quede sin casilla.
 */
export const CATEGORIAS_AVISO = ["ventas", "visitas", "ventana", "cliente", "bot", "tecnico"] as const;
export type CategoriaAviso = (typeof CATEGORIAS_AVISO)[number];

export const CATEGORIA_DE_EVENTO: Record<AdvisorEventType, CategoriaAviso> = {
  quote_created: "ventas",
  customer_ready_to_buy: "ventas",
  visita_comprometida: "visitas",
  visita_manana: "visitas",
  visita_hoy: "visitas",
  ventana_por_cerrar: "ventana",
  human_requested: "cliente",
  negative_sentiment: "cliente",
  customer_opt_out: "cliente",
  repetitive_conversation: "bot",
  guard_bot_atascado: "bot",
  guard_idea_repetida: "bot",
  guard_pide_foto: "bot",
  guard_mensaje_duplicado: "bot",
  guard_saludo_repetido: "bot",
  guard_precio_ajustado: "bot",
  guard_stock_recordado: "bot",
  caso_sin_resolver: "bot",
  envio_fuera_de_cobertura: "bot",
  bot_apagado_con_clientes: "bot",
  send_error: "tecnico",
};

/** Nombre de cada categoría en el panel. */
export const NOMBRE_DE_CATEGORIA: Record<CategoriaAviso, string> = {
  ventas: "Ventas",
  visitas: "Visitas",
  ventana: "Ventana de 24 h",
  cliente: "Cliente",
  bot: "El bot necesita ayuda",
  tecnico: "Fallas técnicas",
};

/**
 * Cómo se llama cada aviso en el panel, en el idioma de quien lo marca. Un
 * evento nuevo sin nombre aquí rompe el test antes de llegar a producción.
 */
export const NOMBRE_DE_EVENTO: Record<AdvisorEventType, string> = {
  quote_created: "Nueva cotización",
  customer_ready_to_buy: "El cliente quiere comprar",
  visita_comprometida: "Confirmó cuándo viene",
  visita_manana: "Viene mañana",
  visita_hoy: "Viene hoy",
  ventana_por_cerrar: "Se va a cerrar la ventana de 24 h para escribirle",
  human_requested: "Pide hablar con un asesor",
  negative_sentiment: "Cliente molesto",
  customer_opt_out: "Pidió que no le escriban más",
  repetitive_conversation: "Conversación que se repite",
  guard_bot_atascado: "El bot se trabó",
  guard_idea_repetida: "El bot estaba en bucle",
  guard_pide_foto: "El bot pidió una foto que no hacía falta",
  guard_mensaje_duplicado: "Mensaje duplicado bloqueado",
  guard_saludo_repetido: "Saludo repetido bloqueado",
  guard_precio_ajustado: "Precio corregido antes de enviar",
  guard_stock_recordado: "Aviso de stock agregado",
  caso_sin_resolver: "Caso que el bot no pudo resolver",
  envio_fuera_de_cobertura: "Pidió envío fuera de cobertura",
  bot_apagado_con_clientes: "Bot apagado con clientes esperando",
  send_error: "Error al enviar un mensaje de WhatsApp",
};

/**
 * Avisos que no son de una conversación: salen a todo un nivel de una vez. Antes
 * iban fijos a `admin`; ahora también se eligen por nivel, como los demás.
 */
export const AVISOS_GENERALES = ["reporte_diario", "bot_prendido_apagado"] as const;
export type AvisoGeneral = (typeof AVISOS_GENERALES)[number];
export const NOMBRE_DE_AVISO_GENERAL: Record<AvisoGeneral, string> = {
  reporte_diario: "Reporte diario de las 20:00",
  bot_prendido_apagado: "Alguien prendió o apagó el bot",
};

/** Un nivel de aviso: su nombre, qué avisos de chat recibe y qué avisos generales. */
export interface NivelAviso {
  id: string;
  nombre: string;
  eventos: AdvisorEventType[];
  generales: AvisoGeneral[];
}

const eventosDe = (cats: readonly CategoriaAviso[]) =>
  EVENTOS_AVISO.filter((e) => cats.includes(CATEGORIA_DE_EVENTO[e]));

/**
 * El punto de partida (y el respaldo si la base calla). Sale de la reunión con
 * Andrés del 19-ago:
 *  · la ventana de 24 h no la recibe NADIE por defecto — eran demasiados avisos.
 *  · el Nivel 2 (el del local) recibe ventas y visitas: lo que acciona en mostrador.
 *  · el reporte diario va solo al Nivel 1 (pedido de la reunión del 14-ago).
 */
export const NIVELES_DEFECTO: NivelAviso[] = [
  { id: "admin", nombre: "Nivel 1", eventos: eventosDe(["ventas", "visitas", "cliente", "bot", "tecnico"]), generales: [...AVISOS_GENERALES] },
  { id: "asesor", nombre: "Nivel 2", eventos: eventosDe(["ventas", "visitas"]), generales: [] },
];

const NivelSchema = z.object({
  id: z.string().regex(ID_NIVEL, "Id de nivel inválido"),
  nombre: z.string().trim().min(1, "El nivel necesita un nombre").max(40),
  eventos: z.array(z.enum(EVENTOS_AVISO)).default([]),
  generales: z.array(z.enum(AVISOS_GENERALES)).default([]),
});
const NivelesSchema = z.array(NivelSchema).min(1, "Tiene que quedar al menos un nivel").max(12)
  .refine((ns) => new Set(ns.map((n) => n.id)).size === ns.length, "Dos niveles con el mismo id");

/** La matriz vieja (categorías por `admin`/`asesor`), para leer lo que Andrés ya había marcado. */
const MatrizViejaSchema = z.object({
  admin: z.array(z.enum(CATEGORIAS_AVISO)).default([]),
  asesor: z.array(z.enum(CATEGORIAS_AVISO)).default([]),
});

/** Convierte la matriz por categorías del 19-ago en niveles, sin perder lo marcado. */
export function nivelesDesdeMatrizVieja(vieja: unknown): NivelAviso[] | null {
  const parsed = MatrizViejaSchema.safeParse(vieja);
  if (!parsed.success) return null;
  return [
    { id: "admin", nombre: "Nivel 1", eventos: eventosDe(parsed.data.admin), generales: [...AVISOS_GENERALES] },
    { id: "asesor", nombre: "Nivel 2", eventos: eventosDe(parsed.data.asesor), generales: [] },
  ];
}

const NIVELES_TTL_MS = 30_000;
let nivelesCache: { value: NivelAviso[]; at: number } | null = null;

/** Los niveles vigentes. Con cache corto: se consulta en cada aviso del worker. */
export async function getNivelesAviso(): Promise<NivelAviso[]> {
  if (nivelesCache && Date.now() - nivelesCache.at < NIVELES_TTL_MS) return nivelesCache.value;
  let value: NivelAviso[] = NIVELES_DEFECTO;
  try {
    const filas = await sql<{ key: string; value: unknown }[]>`
      select key, value from settings where key in ('aviso_niveles', 'aviso_matrix')
    `;
    const nuevos = filas.find((f) => f.key === "aviso_niveles");
    const viejos = filas.find((f) => f.key === "aviso_matrix");
    const parsed = nuevos ? NivelesSchema.safeParse(nuevos.value) : null;
    if (parsed?.success) value = parsed.data;
    else if (viejos) value = nivelesDesdeMatrizVieja(viejos.value) ?? NIVELES_DEFECTO;
  } catch (error) {
    console.error("⚠️ No se pudieron leer los niveles de aviso:", error instanceof Error ? error.message : error);
  }
  nivelesCache = { value, at: Date.now() };
  return value;
}

/**
 * Guarda los niveles. No deja borrar un nivel que todavía tiene asesores: se
 * quedarían recibiendo como Nivel 1 sin que nadie lo decidiera.
 */
export async function saveNivelesAviso(input: unknown): Promise<NivelAviso[]> {
  const value = NivelesSchema.parse(input);
  const ids = value.map((n) => n.id);
  const huerfanos = await sql<{ nombre: string; rol: string }[]>`
    select nombre, rol from advisors where not (rol = any(${ids}::text[]))
  `;
  if (huerfanos.length) {
    throw new Error(`No se puede borrar un nivel con gente asignada: ${huerfanos.map((h) => h.nombre).join(", ")}. Cámbialos de nivel primero.`);
  }
  await sql`
    insert into settings (key, value) values ('aviso_niveles', ${sql.json(value)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  nivelesCache = { value, at: Date.now() };
  return value;
}

/** Solo para pruebas: fuerza a releer los niveles de la base. */
export function olvidarNivelesAviso(): void {
  nivelesCache = null;
}

/** El nivel de un asesor; si su id ya no existe, el primero (recibe de más, no de menos). */
export function nivelDe(rol: RolAsesor, niveles: NivelAviso[] = NIVELES_DEFECTO): NivelAviso {
  return niveles.find((n) => n.id === rol) ?? niveles[0];
}

/**
 * Regla de enrutamiento, pura para poder probarla evento por evento: un nivel
 * recibe un evento si lo tiene marcado.
 */
export function recibeEvento(
  rol: RolAsesor,
  evento: AdvisorEventType,
  niveles: NivelAviso[] = NIVELES_DEFECTO,
): boolean {
  return nivelDe(rol, niveles).eventos.includes(evento);
}

/** Si al nivel le llega un aviso general (reporte diario, bot prendido/apagado). */
export function recibeGeneral(rol: RolAsesor, aviso: AvisoGeneral, niveles: NivelAviso[] = NIVELES_DEFECTO): boolean {
  return nivelDe(rol, niveles).generales.includes(aviso);
}

/**
 * Cabecera por tipo de aviso.
 *
 * Antes todos empezaban con `🚨` y en el celular se veían idénticos: el asesor
 * tenía que abrir el mensaje para saber si era una venta o una traza del bot.
 * La primera línea es ahora la que decide si lo lee ahora o después.
 *
 * `bot_apagado_con_clientes` y `customer_opt_out` llevan cabecera propia aunque
 * la tabla del sprint los agrupara: un apagón con clientes esperando no es «el
 * bot necesita ayuda», y un opt-out no es un cliente molesto — es una orden de
 * no volver a escribirle, y confundirlas cuesta una multa de Meta.
 */
const CABECERAS: Record<AdvisorEventType, string> = {
  // Venta
  quote_created: "💰 *NUEVA COTIZACIÓN*",
  customer_ready_to_buy: "💰 *QUIERE COMPRAR*",
  // Visita
  visita_comprometida: "📅 *CONFIRMÓ VISITA*",
  visita_manana: "⏰ *VIENE MAÑANA*",
  visita_hoy: "🎯 *VIENE HOY*",
  // Ventana
  ventana_por_cerrar: "⏳ *VENTANA POR CERRAR*",
  // Cliente
  human_requested: "🙋 *PIDE ASESOR*",
  negative_sentiment: "😠 *CLIENTE MOLESTO*",
  customer_opt_out: "🚫 *PIDIÓ QUE NO LE ESCRIBAN MÁS*",
  // Bot
  repetitive_conversation: "🤖 *EL BOT NECESITA AYUDA*",
  guard_bot_atascado: "🤖 *EL BOT NECESITA AYUDA*",
  guard_idea_repetida: "🔁 *EL BOT ESTABA EN BUCLE*",
  guard_pide_foto: "🤖 *EL BOT NECESITA AYUDA*",
  guard_mensaje_duplicado: "🤖 *EL BOT NECESITA AYUDA*",
  guard_saludo_repetido: "🤖 *EL BOT NECESITA AYUDA*",
  guard_precio_ajustado: "🤖 *EL BOT NECESITA AYUDA*",
  guard_stock_recordado: "🤖 *EL BOT NECESITA AYUDA*",
  caso_sin_resolver: "🤖 *EL BOT NECESITA AYUDA*",
  envio_fuera_de_cobertura: "🤖 *EL BOT NECESITA AYUDA*",
  bot_apagado_con_clientes: "🔴 *BOT APAGADO CON CLIENTES ESPERANDO*",
  // Técnico
  send_error: "⚙️ *FALLA TÉCNICA*",
};

export function cabeceraDeEvento(evento: AdvisorEventType): string {
  return CABECERAS[evento] ?? "🚨 *AVISO DEL BOT*";
}

export interface AdvisorNotificationInput {
  conversationId: number;
  cycle: number;
  eventType: AdvisorEventType;
  dedupeKey: string;
  title: string;
  reason: string;
  action: string;
  details?: string[];
}

/**
 * El mensaje que ve el asesor en el celular.
 *
 * Orden pensado para leerse sin abrir nada: qué clase de aviso es, qué pasó, el
 * dato que decide (medida, monto, local) y recién después de quién se trata. Los
 * detalles van en una sola línea separados por «·» porque en WhatsApp cada línea
 * suelta empuja el link fuera de la vista previa de la notificación.
 */
export function buildAdvisorMessage(input: AdvisorNotificationInput & {
  customer: string;
  phone: string;
}): string {
  const link = `${config.hub.publicUrl}/#/ticket/${input.conversationId}`;
  const detalles = (input.details ?? []).filter(Boolean).join(" · ");
  return [
    cabeceraDeEvento(input.eventType),
    input.title,
    detalles,
    `👤 ${input.customer}`,
    `📱 ${input.phone}`,
    `💬 ${input.reason}`,
    `👉 ${input.action}`,
    `🔗 ${link}`,
  ].filter(Boolean).join("\n");
}

/** Hora corta de Guayaquil: el asesor lee esto en el celular, no un ISO. */
function horaEcuador(fecha: Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "America/Guayaquil",
  }).format(fecha);
}

/** «8 h 12 min», «12 min», «menos de 1 min». Redondear a horas se queda corto. */
function duracion(desde: Date, hasta: Date): string {
  const minutos = Math.max(0, Math.floor((hasta.getTime() - desde.getTime()) / 60_000));
  if (minutos < 1) return "menos de 1 min";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!horas) return `${minutos} min`;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

/**
 * Texto del aviso cuando alguien mueve el interruptor global desde el panel.
 *
 * Pura a propósito: el mensaje es lo único que el asesor va a ver y tiene que
 * poder probarse con una hora fija, sin DB ni reloj. El 6-ago el bot pasó 8
 * horas apagado sin que nadie se enterara, así que el texto se lee de un
 * vistazo: qué pasó, qué implica y desde cuándo.
 */
export function mensajeCambioDeBot(input: {
  activo: boolean;
  motivo: string;
  apagadoAt: string | null;
  ahora?: Date;
}): string {
  const ahora = input.ahora ?? new Date();
  const motivo = input.motivo.trim();
  const lineas = input.activo
    ? [
        "🟢 *Bot ENCENDIDO*",
        "✅ Vuelve a contestar a los clientes y a mandar seguimientos.",
      ]
    : [
        "🔴 *Bot APAGADO*",
        "⚠️ Los clientes que escriban NO reciben respuesta hasta que alguien conteste a mano.",
      ];
  lineas.push(motivo ? `📝 Motivo: ${motivo}` : "📝 Sin motivo anotado");
  // Solo al encender: cuánto duró el apagón es el dato que faltó el 6-ago.
  if (input.activo && input.apagadoAt) {
    const desde = new Date(input.apagadoAt);
    if (!Number.isNaN(desde.getTime())) {
      lineas.push(`⏱️ Estuvo apagado ${duracion(desde, ahora)}`);
    }
  }
  lineas.push(`🕒 ${horaEcuador(ahora)}`);
  return lineas.join("\n");
}

/**
 * Aviso a TODOS los asesores sin conversación de por medio.
 *
 * `notifyAdvisor` no sirve para esto: exige un `conversationId` que exista, y
 * apagar el bot es un evento global. Tampoco se registra en
 * `advisor_notifications` ni en `bot_alerts` porque en ambas
 * `conversation_id` es `not null references conversations(id)`: no hay fila
 * legítima a la que colgar el evento e inventar una conversación falsa
 * ensuciaría el hub. Queda el `console.log` como rastro; si algún día hace
 * falta auditoría, toca una migración que permita eventos sin conversación.
 *
 * NUNCA lanza: quien la llama está apagando el bot, y un WhatsApp caído no
 * puede impedir un apagado de emergencia.
 */
export async function avisarAsesoresGlobal(texto: string): Promise<{
  enviados: number;
  error?: string;
}> {
  try {
    // Solo los niveles que lo tienen marcado (por defecto, el Nivel 1): encender
    // o apagar el bot es una decisión de quien dirige, no del mostrador.
    const destinatarios = await asesoresActivos({ general: "bot_prendido_apagado" });
    if (!destinatarios.length) {
      console.log("📣 Aviso global sin destino: no hay asesores activos configurados");
      return { enviados: 0, error: "No hay asesores activos configurados" };
    }
    let enviados = 0;
    let ultimoError: string | undefined;
    // Cada asesor se cobra aparte, como en notifyAdvisor: que a uno le falle no
    // puede dejar sin aviso a los demás.
    for (const destino of destinatarios) {
      try {
        await sendAdvisorText(texto, destino.telefono);
        enviados += 1;
      } catch (error) {
        ultimoError = error instanceof Error ? error.message : String(error);
        console.error(`⚠️ Aviso global no salió para ${destino.nombre}:`, ultimoError);
      }
    }
    console.log(`📣 Aviso global enviado a ${enviados}/${destinatarios.length} asesores`);
    return enviados ? { enviados } : { enviados, error: ultimoError };
  } catch (error) {
    const razon = error instanceof Error ? error.message : String(error);
    console.error("⚠️ Aviso global falló por completo:", razon);
    return { enviados: 0, error: razon };
  }
}

/**
 * Envía una sola vez por evento lógico. Si Meta falla, el error queda visible
 * en Alertas del bot y un segundo procesamiento puede reintentar hasta 3 veces.
 */
export interface Asesor {
  nombre: string;
  telefono: string;
  rol: RolAsesor;
}

/**
 * Asesores que reciben los avisos, en orden de prioridad.
 *
 * `filtro.evento` deja solo a quienes ese aviso les corresponde según su nivel;
 * `filtro.general` deja solo a los niveles que reciben ese aviso general.
 *
 * Si la tabla no se puede leer (por ejemplo antes de que corra la migración),
 * cae al asesor del entorno: un aviso que no sale es una venta que nadie
 * atiende, y ese respaldo ya funcionaba. Ese respaldo entra como `admin`, que es
 * el nivel que lo recibía todo antes de que existieran los roles.
 */
export async function asesoresActivos(
  filtro: { evento?: AdvisorEventType; general?: AvisoGeneral } = {},
): Promise<Asesor[]> {
  // Los niveles editables deciden qué recibe cada uno; si la base no contesta,
  // getNivelesAviso ya devolvió el defecto y el aviso sale igual.
  const niveles = filtro.evento || filtro.general ? await getNivelesAviso() : NIVELES_DEFECTO;
  const aplicar = (lista: Asesor[]) => lista.filter((a) =>
    (!filtro.general || recibeGeneral(a.rol, filtro.general, niveles)) &&
    (!filtro.evento || recibeEvento(a.rol, filtro.evento, niveles)));
  try {
    const filas = await sql<{ nombre: string; telefono: string; rol: string }[]>`
      select nombre, telefono, rol from advisors
      where active and telefono <> '' order by prioridad, id
    `;
    // Un rol desconocido en la base se trata como `admin`: es el valor por
    // defecto de la columna y equivocarse hacia «recibe de más» se nota y se
    // corrige; hacia «no recibe nada», no.
    if (filas.length) {
      return aplicar(filas.map((f) => ({
        nombre: f.nombre, telefono: f.telefono,
        rol: f.rol || "admin",
      })));
    }
  } catch (error) {
    console.error("⚠️ No se pudo leer la tabla de asesores:", error);
  }
  const respaldo = config.whatsapp.sellerPhone;
  if (!respaldo) return [];
  return aplicar([{ nombre: config.whatsapp.sellerName, telefono: respaldo, rol: "admin" }]);
}

export async function notifyAdvisor(input: AdvisorNotificationInput): Promise<{
  sent: boolean;
  skipped: boolean;
  error?: string;
}> {
  const [conversation] = await sql<{ name: string | null; phone: string }[]>`
    select name, phone from conversations where id=${input.conversationId}
  `;
  if (!conversation) return { sent: false, skipped: true, error: "Conversación no encontrada" };
  const message = buildAdvisorMessage({
    ...input,
    customer: conversation.name ?? conversation.phone,
    phone: conversation.phone,
  });

  // Un aviso por asesor a quien le toca ESTE evento. Antes salía a uno solo,
  // fijado por entorno; después a todos; ahora depende del rol.
  const destinatarios = await asesoresActivos({ evento: input.eventType });
  if (!destinatarios.length) {
    return { sent: false, skipped: true, error: "Ningún asesor activo recibe este tipo de aviso" };
  }
  const creadas = await sql<{ id: number; recipient_phone: string; recipient_name: string }[]>`
    insert into advisor_notifications (
      conversation_id, cycle, event_type, dedupe_key, recipient_name,
      recipient_phone, message, status
    )
    select
      ${input.conversationId}, ${input.cycle}, ${input.eventType}, ${input.dedupeKey},
      d.nombre, d.telefono, ${message}, 'queued'
    from (values ${sql(destinatarios.map((a) => [a.nombre, a.telefono]))}) as d(nombre, telefono)
    on conflict (dedupe_key, recipient_phone) do nothing
    returning id, recipient_phone, recipient_name
  `;
  let pendientes = creadas;
  if (!pendientes.length) {
    // Reintento de las que fallaron antes, una por asesor.
    pendientes = await sql<{ id: number; recipient_phone: string; recipient_name: string }[]>`
      update advisor_notifications set status='queued', updated_at=now()
      where dedupe_key=${input.dedupeKey} and status='failed' and attempt_count < 3
      returning id, recipient_phone, recipient_name
    `;
  }
  if (!pendientes.length) return { sent: false, skipped: true };

  // Cada asesor se cobra aparte: que a uno le falle no puede dejar sin aviso a
  // los demás. Basta con que salga uno para considerarlo entregado.
  let algunoSalio = false;
  let ultimoError: string | undefined;
  for (const destino of pendientes) {
  try {
    const providerId = await sendAdvisorText(message, destino.recipient_phone);
    await sql`
      update advisor_notifications set status='sent', attempt_count=attempt_count+1,
        provider_message_id=${providerId ?? null}, error=null, sent_at=now(), updated_at=now()
      where id=${destino.id}
    `;
    algunoSalio = true;
    continue;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    ultimoError = reason;
    await sql.begin(async (tx) => {
      await tx`
        update advisor_notifications set status='failed', attempt_count=attempt_count+1,
          error=${reason.slice(0, 1000)}, updated_at=now() where id=${destino.id}
      `;
      await tx`
        insert into bot_alerts (
          conversation_id, cycle, type, priority, summary, exact_reason,
          suggested_action, dedupe_key
        ) values (
          ${input.conversationId}, ${input.cycle}, 'advisor_notification_failed', 'high',
          'No se pudo avisar al asesor por WhatsApp', ${reason.slice(0, 500)},
          'Manuel debe abrir el ticket desde el Hub; verificar su ventana o una plantilla aprobada para alertas.',
          ${`${input.dedupeKey}:delivery_failed`}
        ) on conflict do nothing
      `;
    });
    emitLiveEvent("alert", input.conversationId, {
      icon: "⚠️",
      title: "Aviso al asesor bloqueado",
      body: `${conversation.name ?? conversation.phone} · revisa Alertas del bot`,
    });
    console.error(`⚠️ No se pudo notificar a ${destino.recipient_name}:`, reason);
  }
  }

  if (algunoSalio) {
    await sql`
      update bot_alerts set status='resolved', resolved_at=now()
      where dedupe_key=${`${input.dedupeKey}:delivery_failed`}
        and status in ('open','snoozed')
    `;
    emitLiveEvent("sync", input.conversationId);
    return { sent: true, skipped: false };
  }
  return { sent: false, skipped: false, error: ultimoError };
}

/** Recupera solicitudes humanas abiertas creadas antes de un reinicio/deploy. */
export async function notifyPendingHumanRequests(limit = 20): Promise<number> {
  const pending = await sql<{
    conversation_id: number;
    cycle: number;
    exact_reason: string;
  }[]>`
    select a.conversation_id, a.cycle, a.exact_reason
    from bot_alerts a
    join conversations c on c.id=a.conversation_id and c.current_cycle=a.cycle
    where a.type='human_requested' and a.status in ('open','snoozed')
      and c.status='open' and c.assigned_to='human'
      and not exists (
        select 1 from advisor_notifications n
        where n.dedupe_key=(a.conversation_id || ':' || a.cycle || ':human_requested')
          and n.status in ('queued','sent')
      )
    order by a.created_at asc
    limit ${limit}
  `;
  let sent = 0;
  for (const row of pending) {
    const delivery = await notifyAdvisor({
      conversationId: Number(row.conversation_id),
      cycle: row.cycle,
      eventType: "human_requested",
      dedupeKey: `${row.conversation_id}:${row.cycle}:human_requested`,
      title: "Cliente pidió hablar con un asesor",
      reason: `Mensaje del cliente: “${row.exact_reason.slice(0, 300)}”`,
      action: "Abrir el ticket y responder personalmente dentro de la ventana de 24 horas.",
    });
    if (delivery.sent) sent += 1;
  }
  return sent;
}
