/**
 * API de administración del hub en línea (/api/*): conversaciones reales,
 * envío manual, pausa del bot, configuración de IA y tester de WhatsApp.
 *
 * Seguridad: si existe ADMIN_KEY en el entorno, toda la API exige el header
 * x-admin-key (las páginas del hub piden la clave una vez y la recuerdan).
 * Sin ADMIN_KEY la API queda abierta — solo aceptable durante el piloto.
 */
import { TEMAS, TEMAS_LISTOS, nombreDelTema } from "../domain/temaDePieza.js";
import { COLORES_LISTOS } from "../domain/coloresDePieza.js";
import { promocionVigente } from "../domain/promocionDeTemporada.js";
import { randomBytes } from "node:crypto";
import express from "express";
import { tel9 } from "../services/fuentes/contifico.js";
import { asesorDelUsuario, miVentana } from "../services/ventanaDelAsesor.js";
import { anularRegistro, claveDeRegistros, claveDelEnlace, guardarFactura, leerMonto, listarVentasRegistradas, registrarVenta, validarEntrada, ventasACsv } from "../services/registroDeVentas.js";
import { z } from "zod";
import { sql } from "../db/client.js";
import { AnunciosActivosSchema } from "../domain/anunciosActivos.js";
import { anunciosVistos, getAnunciosActivos, saveAnunciosActivos } from "../services/anunciosActivos.js";
import { business, config } from "../config.js";
import { appendMessage, logQuote, pauseBot } from "../services/conversations.js";
import { achicarPieza, guardarPieza, piezaEnMemoria } from "../services/piezasDelChat.js";
import { guardarMedio, medioDelMensaje } from "../services/mediosDelChat.js";
import { forceSyncNow, interbotPricesState } from "../services/interbotPrices.js";
import { PLANTILLA_NAMES, MODO_NAMES,
  getAiConfig,
  getCouponConfig,
  getVentaRegistradaConfig,
  saveVentaRegistradaConfig,
  getGuardianConfig,
  getPiecesConfig,
  getStoreHours,
  saveCouponConfig,
  saveGuardianConfig,
  savePiecesConfig,
  saveStoreHours,
  listStagePrompts,
  publishStagePrompt,
  saveAiConfig,
  saveStagePromptDraft,
  getTemporadaConfig,
  saveTemporadaConfig,
  MODOS_TEMPORADA,
} from "../services/settings.js";
import { comoVistaPrevia } from "../services/temporadaDelTurno.js";
import { politica } from "../negocio/politica.js";
import { informeGuardian } from "../services/guardian.js";
import { canjearCupon, consultarCupon, resumenCupones } from "../services/coupons.js";
import { fotoDelTicket, historialDelTicket, quienEnElPanel, registrarAccion, registrarCambioDelPanel } from "../services/accionesDelPanel.js";
import {
  agregarFactura, confirmaGanado, confirmarVentaEnElPanel, listarPendientes, revisarCierreGanado, ventaCompleta, ventaDelTicket,
} from "../services/registroDeVentas.js";
import {
  catalogStatus,
  catalogInventoryMetrics,
  catalogMediaReport,
  ensureCatalogReady,
  findById,
  findByCode,
  searchByText,
  catalogoParaPromociones,
  syncCatalog,
} from "../services/catalog.js";
import { TIPOS_DE_PROMOCION, TIPOS_PARA_EL_PANEL, errorDeParametros, productoParaCantidad, textosDeRegalos, tipoParaElPanel, type FilaDePromocion, type TipoDePromocion } from "../domain/promociones.js";
import {
  PromocionInvalida, actualizarPromocion, archivarPromocion, crearPromocion, excelDePromocion, leerExcelDePromocion,
  leerPromocion, listarPromociones, paraElPanel, parametrosLimpios, vistaPreviaDe,
} from "../services/promociones.js";
import {
  buildQuote,
  renderComparisonPdf,
  renderQuotePdf,
  pngToQuotePdf,
} from "../services/quotePdf.js";
import {
  buildComparisonMessageDetallado,
  buildCustomerOptionsMessageDetallado,
  buildDistributorOptionsMessage,
  buildCustomerQuoteMessage,
  buildSingleQuoteMessageDetallado,
  type CatalogQuoteSelection,
  warrantyForBrand,
} from "../services/quoteMessages.js";
import {
  addConversationNote,
  markConversationRead,
  setConversationAssignee,
  setReviewLater,
  setStage,
  reopenConversation,
  deshacerVenta,
  logQuoteArtifact,
} from "../services/conversations.js";
import { getFinalStageArrivals, getHubFeed, getHubMessages, getHubMetrics, getHubTicket, listHubTickets } from "../services/hubData.js";
import { mesesConDatos } from "../services/periodoMensual.js";
import { getEchoHealth } from "../services/echoHealth.js";
import { resumenVentasConfirmadas } from "../services/ventasConfirmadas.js";
import { decidirParaCerrar, leerParaCerrar, type AccionParaCerrar } from "../services/paraCerrar.js";
import { comprobablesVacios, resumenComprobables } from "../services/metricasComprobables.js";
import { CargaRechazada, estadoCatalogoArchivo, estadoFacturasImportadas, hayCatalogoArchivo, guardarMapeoCatalogo, guardarMapeoFacturas, importarCatalogoYSincronizar, importarFacturasYSincronizar, leerMapeoCatalogo, leerMapeoFacturas } from "../services/fuentes/archivo.js";
import { marcarPagado, resumenBilling } from "../services/billing.js";
import { buildDailyReport } from "../services/dailyReport.js";
import { enviarReporteDiario } from "../services/dailyReportDelivery.js";
import { renderDailyReportHtml } from "../render/dailyReportHtml.js";
import { nombreArchivoReporte, renderDailyReportPdf } from "../render/dailyReportPdf.js";
import { nombreArchivoReporteSimple, renderReporteSimplePdf } from "../render/reporteSimplePdf.js";
import { buildReporteSimple } from "../services/reporteSimple.js";
import { emitLiveEvent, subscribeLiveEvents } from "../services/liveEvents.js";
import { isStage } from "../domain/pipeline.js";
import { authorizeConversationOutbound } from "../services/whatsappPolicy.js";
import {
  getFollowUpMetrics,
  getFollowUpSettings,
  listBotAlerts,
  listFollowUpBoard,
} from "../services/followUpAdmin.js";
import { cancelPendingFollowUps, createBotAlert, generateFollowUpJobCopyById, rescheduleActiveConversationPlans, scheduleConversationFollowUps } from "../services/followUps.js";
import {
  captureManualDiscount,
  createDiscountFromPrompt,
  discountOfferMessage,
  markDiscountOfferSent,
  markDiscountNoticeSent,
  pendingDiscountNoticeMessage,
} from "../services/discountOffers.js";
import { renderCompareImage, renderOptionsImage, renderQuoteImage, toRenderLine } from "../render/quoteImage.js";
import { authorizeAdvisorTemplatePlan, previewAdvisorTemplatePlan } from "../services/followUpCampaigns.js";
import { resumeBotIfUnanswered } from "../services/resumeBot.js";
import { getPhaseFlags, savePhaseFlags } from "../services/phases.js";
import {
  applicableBenefitTexts, createBenefit, deleteBenefit, listBenefits, updateBenefit,
} from "../services/benefits.js";
import {
  brandProfilesForRender, deleteBrandProfile, listBrandProfiles, saveBrandProfile,
} from "../services/brandProfiles.js";
import { PALETTE_NAMES, PALETTES, PRICE_FONT_NAMES } from "../render/depotDesign.js";
import { descuentoDeLaMuestra, renderPreviewPiece } from "../render/preview.js";
import { MODOS_PROMOCION } from "../domain/promocion.js";
import { negocioPublico } from "./negocioPublico.js";
import { atenderPendientes, reorganizarEtapas } from "../services/hubMaintenance.js";
import {
  getChannelConfig,
  getPublicChannelConfig,
  saveChannelConfig,
} from "../services/channel.js";
import { diagnoseChannel } from "../services/channelDiagnostics.js";
import { getBotPower, setBotPower } from "../services/botPower.js";
import {
  avisarAsesoresGlobal,
  CATEGORIAS_AVISO,
  CATEGORIA_DE_EVENTO,
  EVENTOS_AVISO,
  NOMBRE_DE_CATEGORIA,
  NOMBRE_DE_EVENTO,
  AVISOS_GENERALES,
  NOMBRE_DE_AVISO_GENERAL,
  catalogoDeAvisos,
  getNivelesAviso,
  mensajeCambioDeBot,
  saveNivelesAviso,
  asesoresActivos,
  cabeceraDeEvento,
  type AdvisorEventType,
} from "../services/advisorNotifications.js";
import {
  USUARIOS_DE_SOPORTE, avisarASoporte, esUsuarioDeSoporte, estadoDeSoporte,
} from "../services/avisosASoporte.js";
import { UMBRAL_POR_DEFECTO_USD, anotarSaldo, estadoDelSaldo, revisarSaldo } from "../services/saldoDeIA.js";
import {
  EVENTOS_POR_LA_APP, borrarSuscripcion, clavesPush, enviarPushAAsesores, guardarSuscripcion,
  historialDeAvisos, leerSuscripcion, telefonoDelUsuario,
} from "../services/avisosEnLaApp.js";
import { getAsesoresPorLocal, localesAsignables, saveAsesoresPorLocal } from "../services/asesoresPorLocal.js";
import {
  activarUsuarioHub,
  actualizarUsuarioHub,
  borrarUsuarioHub,
  cargarUsuariosHub,
  crearUsuarioHub,
  estadoClave,
  restablecerClaveHub,
  nuevaInvitacionHub,
  usuariosHub,
  type UsuarioHub,
} from "../services/hubUsers.js";
import { downloadMedia, sendApprovedTemplate, sendImage, sendPdf, reloadWa, listarPlantillasDeMeta } from "../wa/client.js";
import { negocio } from "../negocio/index.js";
import { nombreDelResponsable } from "./privacidad.js";
import { enviarAvisoDeLaManana, getAvisoManana, saveAvisoManana, ultimoResultadoAvisoManana } from "../services/avisoDeLaManana.js";
import { sincronizarPlantillas } from "../services/plantillasMeta.js";
import { registrarEnviado } from "../wa/outboundRegistry.js";
import {
  SESIONES_HABILITADAS,
  claveValidaPara,
  crearToken,
  esperaDeLogin,
  listarUsuarios,
  permisosDeUsuario,
  registrarLoginBueno,
  registrarLoginFallido,
  tokenDelHeader,
  usuarioPorId,
  verificarToken,
} from "./auth.js";

const GRAPH = "https://graph.facebook.com/v21.0";
const ADMIN_KEY = process.env.ADMIN_KEY ?? "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  code?: number;
  status: number;
}

const CatalogSelectionSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        quantity: z.number().int().min(1).max(8),
      }),
    )
    .min(1)
    .max(3),
  customerName: z.string().max(120).default("Cliente"),
  customerPhone: z.string().max(30).default(""),
});

const CompareSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(80) })).min(2).max(3),
  style: z.literal("comparison").default("comparison"),
  customerName: z.string().max(120).default("Cliente"),
});

const OptionsSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(80) })).min(1).max(60),
  style: z.enum(["customer", "distributor"]).default("customer"),
  customerName: z.string().max(120).default("Cliente"),
});

/**
 * Como `OptionsSchema`, pero para la pieza visual: la pieza agrupa por marca y
 * dibuja como mucho 3 tarjetas por marca, así que aceptar 60 solo significaría
 * renderizar de más para tirar el resto. `medidaPedida` es lo que el usuario
 * buscó en el Cotizador — con ella cada tarjeta lleva su sello.
 */
const OptionsImageSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(80) })).min(1).max(24),
  medidaPedida: z.string().max(40).optional(),
});

const QuoteSchema = z.object({
  item: z.object({
    id: z.string().min(1).max(80),
    quantity: z.number().int().min(1).max(8),
  }),
  customerName: z.string().max(120).default("Cliente"),
  customerPhone: z.string().max(30).default(""),
});

/** Lo que ve el asesor cuando escribe y la ventana de 24 h ya se cerró (Manuel, 22-nov-2026). */
const VENTANA_CERRADA = "No se pudo mandar el mensaje porque se cerró la ventana de 24 h. Puede mandarle la plantilla para retomar la venta.";
/** La plantilla aprobada que sí sale con la ventana cerrada (en cada WABA, mismo nombre). */
const PLANTILLA_RETOMAR = "retomar_venta_v1";

/** `data:image/jpeg;base64,…` → los bytes; null si no es eso (foto adjunta desde el chat del panel). */
function miniaturaABuffer(valor: unknown): Buffer | null {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(valor ?? ""));
  return m ? Buffer.from(m[1], "base64") : null;
}

/**
 * Envío directo por la Graph API (en vez de whatsapp-api-js) para poder
 * traducir los errores típicos de Meta a mensajes accionables en el panel.
 */
async function sendTextDetailed(to: string, body: string): Promise<SendResult> {
  const channel = await getChannelConfig();
  if (!channel.token || !channel.phoneId) {
    return {
      ok: false,
      error: "Canal de WhatsApp sin configurar: pon el token y el Phone ID en Ajustes → Canal.",
      status: 502,
    };
  }
  const r = await fetch(`${GRAPH}/${channel.phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channel.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  const data = (await r.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number };
  };

  if (r.ok) {
    // Igual que en graphSend: el eco de este envío vuelve por el webhook y no
    // debe leerse como "un asesor escribió desde WhatsApp".
    registrarEnviado(data.messages?.[0]?.id);
    return { ok: true, id: data.messages?.[0]?.id, status: 200 };
  }

  const err = data.error ?? {};
  let hint = err.message || "Error de Meta";
  // Ventana de 24h cerrada: el cliente tiene que escribir primero.
  if (err.code === 131047 || /re-?engagement|24 hour/i.test(err.message ?? "")) {
    hint =
      "La ventana de 24 h está cerrada: ese número tiene que escribirle primero al bot para poder responderle texto libre.";
  }
  if (err.code === 190 || /expired|invalid.*token/i.test(err.message ?? "")) {
    hint =
      "El token de WhatsApp expiró o es inválido. Genera uno nuevo en Meta y actualiza WHATSAPP_TOKEN en Railway.";
  }
  // 502 fijo: si se propagara el 401/403 de Meta, el front lo confundiría con
  // la clave de administración inválida (el gate de login saltaría sin razón).
  return { ok: false, error: hint, code: err.code, status: 502 };
}

/** Motivo legible de un error, con respaldo cuando no lo trae. */
const MES_CERRADO_MS = 2 * 60_000;
const metricasDeMesCerrado = new Map<string, { at: number; metrics: unknown }>();

/** "2026-08" si es un mes anterior al en curso (hora de Guayaquil); si no, null. */
function mesCerrado(mes: string | null): string | null {
  if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return null;
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 7);
  return mes < hoy ? mes : null;
}

function mensaje(error: unknown, respaldo: string): string {
  return error instanceof Error && error.message ? error.message : respaldo;
}

const PANEL_ORIGIN = process.env.ADMIN_PANEL_ORIGIN ?? "*";

/**
 * El gate del panel, exportado para que NADIE tenga que reimplementarlo.
 *
 * Vivía dentro de `createAdminRouter`, así que las rutas que cuelgan de la app
 * raíz —`/cotizaciones/live.png` y `/diagnostico/piezas`— quedaban fuera sin
 * que se notara: la primera dibuja la comparativa REAL del catálogo con
 * `minimumPriceWithTax` (el precio de venta mínimo de Depot) para la medida que
 * pida cualquiera por query, y la segunda rasteriza tres piezas por petición en
 * el mismo proceso que atiende el webhook.
 */
export function exigirCredencial(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  // La sesión va primero: si trae un token válido, entra sea cual sea el
  // estado de la clave, y el rol queda disponible para el resto del router.
  const token = tokenDelHeader(req.header("authorization"));
  const usuario = token ? verificarToken(token) : null;
  if (usuario) {
    req.usuario = usuario;
    next();
    return;
  }
  if (ADMIN_KEY) {
    // Compatibilidad: el bot, los scripts y el panel central siguen mandando
    // la clave cruda y no tienen por qué enterarse de que existen usuarios.
    if (req.header("x-admin-key") === ADMIN_KEY) {
      next();
      return;
    }
    res.status(401).json({ ok: false, error: "Clave de administración requerida" });
    return;
  }
  // Sin ADMIN_KEY: en producción se cierra (nunca abierto en el entregable);
  // en desarrollo local se permite para no frenar las pruebas.
  if (IS_PRODUCTION) {
    res.status(503).json({
      ok: false,
      error: "El panel no tiene ADMIN_KEY configurada. Define ADMIN_KEY antes de exponerlo.",
    });
    return;
  }
  next();
}

export function createAdminRouter(): express.Router {
  const router = express.Router();
  router.use(express.json());

  // CORS: el panel central de administración vive en otro origen y llama a
  // /api/phases y /api/channel de cada cliente. La seguridad real es la
  // x-admin-key; el preflight OPTIONS va ANTES del gate para no rebotar.
  router.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", PANEL_ORIGIN);
    res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-key, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.header("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  if (!ADMIN_KEY && IS_PRODUCTION) {
    console.error(
      "🔒 ADMIN_KEY no está configurada y NODE_ENV=production: el panel /api quedará BLOQUEADO. Define ADMIN_KEY en el entorno.",
    );
  }

  // ── Login ───────────────────────────────────────────────────────────────────
  // Las dos ÚNICAS rutas públicas, y van antes del gate a propósito: pedir la
  // lista de usuarios o intentar entrar son justo lo que se hace cuando todavía
  // no se tiene con qué autenticarse.

  /**
   * Nombres para el desplegable del login. Nunca devuelve claves ni hashes;
   * `pendiente` va porque el login necesita saber a quién mostrarle el
   * formulario de crear clave ANTES de pedirle una que no existe.
   */
  router.get("/auth/users", (_req, res) => {
    res.json({
      ok: true,
      users: listarUsuarios().map((u) => {
        const completo = usuariosHub().find((h) => h.id === u.id);
        return { ...u, pendiente: completo ? estadoClave(completo) === "pendiente" : false };
      }),
    });
  });

  router.post("/auth/login", (req, res) => {
    if (!SESIONES_HABILITADAS) {
      res.status(503).json({
        ok: false,
        error: "Este servidor no tiene ADMIN_KEY configurada: no puede firmar sesiones.",
      });
      return;
    }
    const input = z
      .object({ userId: z.string().min(1).max(40), pin: z.string().min(1).max(60) })
      .safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ ok: false, error: "Elige un usuario y escribe la clave." });
      return;
    }
    // El freno va ANTES de comprobar la clave: si no, cada intento bloqueado
    // seguiría diciendo por el tiempo de respuesta si el usuario existe.
    const espera = esperaDeLogin(input.data.userId);
    if (espera > 0) {
      const segundos = Math.ceil(espera / 1000);
      res.status(429)
        .set("Retry-After", String(segundos))
        .json({
          ok: false,
          error: `Demasiados intentos fallidos. Vuelve a probar en ${segundos} s.`,
        });
      return;
    }
    const usuario = usuarioPorId(input.data.userId);
    const veredicto = usuario ? claveValidaPara(usuario.id, input.data.pin) : "mala";
    // Cuenta nueva sin clave: no es un error de clave, es que el primer
    // ingreso es OBLIGATORIAMENTE crear la suya (con su email). El hub cambia
    // al formulario de activación al ver este código.
    if (veredicto === "activacion_requerida") {
      res.status(403).json({
        ok: false,
        code: "activacion_requerida",
        error: "Primera vez: crea tu clave y deja tu email para entrar.",
      });
      return;
    }
    // Mismo mensaje para usuario inexistente y clave mala: no hace falta
    // confirmarle a nadie qué nombres existen.
    if (!usuario || veredicto !== "ok") {
      registrarLoginFallido(input.data.userId);
      res.status(401).json({ ok: false, error: "Usuario o clave incorrectos." });
      return;
    }
    registrarLoginBueno(usuario.id);
    res.json({
      ok: true,
      token: crearToken(usuario.id),
      user: usuario,
      permisos: permisosDeUsuario(usuario.id),
    });
  });

  /**
   * Activación: el primer ingreso de un usuario creado desde el panel. Pública
   * como el login — quien la necesita todavía no tiene con qué autenticarse.
   * `activarUsuarioHub` solo acepta cuentas pendientes, así que nadie puede
   * pisar la clave de una cuenta ya activa por aquí.
   */
  router.post("/auth/activate", async (req, res) => {
    if (!SESIONES_HABILITADAS) {
      res.status(503).json({
        ok: false,
        error: "Este servidor no tiene ADMIN_KEY configurada: no puede firmar sesiones.",
      });
      return;
    }
    const input = z
      .object({
        userId: z.string().min(1).max(40), email: z.string().min(3).max(120), pin: z.string().min(4).max(60),
        // El código del enlace de invitación (19-nov): obligatorio para las
        // cuentas creadas desde entonces; lo comprueba `activarUsuarioHub`.
        invitacion: z.string().max(200).optional(),
      })
      .safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ ok: false, error: "Hace falta el email y una clave de al menos 4 caracteres." });
      return;
    }
    try {
      // El freno de fuerza bruta también aquí: el código no se adivina, pero
      // nadie tiene por qué poder probar sin límite.
      const espera = esperaDeLogin(`activar:${input.data.userId}`);
      if (espera > 0) {
        res.status(429).json({ ok: false, error: `Demasiados intentos. Vuelve a probar en ${Math.ceil(espera / 1000)} s.` });
        return;
      }
      const usuario = await activarUsuarioHub(input.data.userId, {
        email: input.data.email,
        pin: input.data.pin,
        invitacion: input.data.invitacion,
      }).catch((error: unknown) => {
        registrarLoginFallido(`activar:${input.data.userId}`);
        throw error;
      });
      registrarLoginBueno(usuario.id);
      res.json({
        ok: true,
        token: crearToken(usuario.id),
        user: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
        permisos: permisosDeUsuario(usuario.id),
      });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo activar la cuenta") });
    }
  });

  router.use(exigirCredencial);
  // TODO CAMBIO QUEDA CON NOMBRE (Manuel, 21-nov: «literal todo lo que podría
  // algún día ser preocupante se tiene que guardar quién fue»). Cualquier
  // POST/PUT/PATCH/DELETE del panel —incluidas las rutas que se agreguen
  // después— deja una fila en `audit_events`: quién, qué ruta, el cuerpo (sin
  // claves) y cómo terminó. Las acciones de ticket además guardan su foto
  // antes/después con `registrarAccion`.
  router.use(registrarCambioDelPanel);

  // Quién es el negocio de esta instancia, para que el panel no diga Depot en
  // el servicio de otro cliente (MULTICLIENTE.md §3.2).
  router.get("/negocio", (_req, res) => res.json(negocioPublico()));

  // El espejo de usuarios del hub se puebla al arrancar: el login y el gate lo
  // leen síncrono y no pueden esperar a la base petición por petición.
  void cargarUsuariosHub();

  /**
   * Solo el nivel más alto administra usuarios y la matriz de avisos. Entrar
   * con la clave cruda (sin usuario) también pasa: es el camino del panel
   * central y de los scripts, que ya implican tener la llave de todo.
   */
  const exigirNivelMaximo = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => {
    if (!req.usuario || req.usuario.rol === "admin") {
      next();
      return;
    }
    res.status(403).json({ ok: false, error: "Solo un administrador puede cambiar esto" });
  };

  // Estado general: las páginas lo usan para validar la clave y prellenar datos.
  router.get("/status", (req, res) => {
    res.json({
      ok: true,
      negocio: business.name,
      protegido: Boolean(ADMIN_KEY),
      telefonoVendedor: config.whatsapp.sellerPhone,
      asesor: config.whatsapp.sellerName,
      // null cuando se entró con la clave cruda (bot, scripts, panel central).
      usuario: req.usuario ?? null,
      permisos: req.usuario ? permisosDeUsuario(req.usuario.id) : null,
    });
  });

  // ── Interruptor global del bot ─────────────────────────────────────────────
  // Apagado: no contesta ni manda seguimientos. Sigue recibiendo y guardando
  // los mensajes, y el dueño sigue pudiendo responder a mano desde el panel.
  router.get("/bot-power", async (_req, res) => {
    res.json({ ok: true, power: await getBotPower() });
  });

  router.put("/bot-power", async (req, res) => {
    try {
      // El estado ANTERIOR se lee aquí y no dentro de setBotPower: el aviso a
      // los asesores cuelga de esta ruta porque aquí hay una persona tocando el
      // panel. A setBotPower también lo llaman las semillas y las pruebas, y
      // nadie quiere un WhatsApp por cada una.
      const previo = await getBotPower();
      // R-44: con pendientes de arranque (`faltantes` del perfil, la política o
      // los assets), el bot no se enciende por accidente — el panel tiene que
      // mandar `confirmarFaltantes: true` después de mostrárselos al dueño.
      // Depot tiene la lista vacía y no pasa por acá.
      const pideEncender = Boolean((req.body as { activo?: unknown } | null)?.activo) && !previo.activo;
      const confirmado = (req.body as { confirmarFaltantes?: unknown } | null)?.confirmarFaltantes === true;
      if (pideEncender && !confirmado) {
        const faltantes = negocioPublico().faltantes;
        if (faltantes.length) {
          res.status(409).json({
            ok: false,
            error: "Al negocio le faltan datos de arranque; confirma para encender igual.",
            faltantes,
          });
          return;
        }
      }
      const power = await setBotPower(req.body);
      // Quién prendió o apagó el bot (Manuel, 21-nov): se guarda siempre que
      // cambie, en la misma bitácora que las acciones sobre tickets.
      if (power.activo !== previo.activo || power.motivo !== previo.motivo) {
        await sql`
          insert into audit_events (actor, action, entity_type, entity_id, before_value, after_value)
          values (${quienEnElPanel(req)}, ${power.activo ? "encender_bot" : "apagar_bot"}, 'bot', 'global',
            ${sql.json({ activo: previo.activo, motivo: previo.motivo ?? null })},
            ${sql.json({ activo: power.activo, motivo: power.motivo ?? null })})
        `.catch((e) => console.warn("⚠️ No se guardó quién tocó el interruptor:", e));
      }
      // El hub pinta el estado en la cabecera: que se entere sin recargar.
      emitLiveEvent("sync");
      // Solo si el interruptor cambió de verdad: reguardar el mismo estado (o
      // corregir un motivo) no es noticia y quemaría la confianza en el aviso.
      if (power.activo !== previo.activo) {
        const texto = mensajeCambioDeBot({
          activo: power.activo,
          motivo: power.motivo,
          // Al encender, apagadoAt ya viene en null: la duración del apagón
          // sale de la marca ANTERIOR, que es la que sabe desde cuándo estuvo mudo.
          apagadoAt: power.activo ? previo.apagadoAt : power.apagadoAt,
        });
        // En segundo plano, igual que las alertas del guardián de salida: apagar
        // el bot es una emergencia y un WhatsApp caído no puede frenarla ni
        // romper la respuesta HTTP.
        void (async () => {
          const salida = await avisarAsesoresGlobal(texto);
          if (salida.error) console.warn("⚠️ Aviso de interruptor incompleto:", salida.error);
        })().catch((error) => {
          console.warn("⚠️ No se pudo avisar del interruptor:", error instanceof Error ? error.message : error);
        });
      }
      res.json({ ok: true, power });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Valor inválido",
      });
    }
  });

  // ── Fases del producto (entrega por etapas) ────────────────────────────────
  router.get("/phases", async (_req, res) => {
    res.json({ ok: true, phases: await getPhaseFlags() });
  });

  router.put("/phases", async (req, res) => {
    try {
      const phases = await savePhaseFlags(req.body);
      // Avisa a los hubs conectados para que actualicen la navegación en vivo.
      emitLiveEvent("sync");
      res.json({ ok: true, phases });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Fases inválidas",
      });
    }
  });

  // ── Canal de WhatsApp (token/phoneId/etc. desde el panel) ──────────────────
  router.get("/channel", async (_req, res) => {
    res.json({ ok: true, channel: await getPublicChannelConfig() });
  });

  router.put("/channel", async (req, res) => {
    try {
      await saveChannelConfig(req.body);
      // Reactiva el webhook en caliente con el token recién guardado.
      const activo = await reloadWa();
      res.json({ ok: true, activo, channel: await getPublicChannelConfig() });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Canal inválido",
      });
    }
  });

  /**
   * Diagnóstico paso a paso: pregunta a Meta si el token sirve, si el número
   * es de esta cuenta, y mira si el webhook ya entregó algo. Es lo que pinta
   * Ajustes → WhatsApp; se puede repetir cuantas veces haga falta.
   */
  router.get("/channel/diagnose", async (req, res) => {
    try {
      // Railway termina el TLS en su proxy: sin x-forwarded-proto saldría http.
      const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0];
      const baseUrl = `${proto}://${req.get("host")}`;
      res.json({ ok: true, ...(await diagnoseChannel(baseUrl)) });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo diagnosticar",
      });
    }
  });

  /**
   * Prueba de extremo a extremo: manda un texto real al número que escribas.
   * Es el único chequeo que confirma que el canal SALE de verdad.
   */
  router.post("/channel/test", async (req, res) => {
    const to = String((req.body as { to?: unknown })?.to ?? "").replace(/[^\d]/g, "");
    if (to.length < 8) {
      return res.status(400).json({
        ok: false,
        error: "Escribe el número en formato internacional sin «+» (ej. 5939…).",
      });
    }
    const result = await sendTextDetailed(
      to,
      "✅ Prueba de conexión de AutoVenta. Si lees esto, el canal de WhatsApp está bien configurado.",
    );
    if (result.ok) return res.json({ ok: true, id: result.id });
    res.status(result.status ?? 502).json({ ok: false, error: result.error, code: result.code });
  });

  // ── Producto real: Hub ─────────────────────────────────────────────────────
  // `mes` ("YYYY-MM" o "todos") recorta el tablero al mes que el panel está
  // mirando. Sin el parámetro, todo: el Inbox es la cola viva y no se recorta.
  router.get("/hub/tickets", async (req, res) => {
    const mes = typeof req.query.mes === "string" ? req.query.mes : null;
    res.json({ ok: true, tickets: await listHubTickets({ mes }) });
  });

  // Los meses que tienen algo que mostrar, para el selector del panel.
  router.get("/hub/periods", async (_req, res) => {
    res.json({ ok: true, periods: await mesesConDatos() });
  });

  // Un ticket suelto: el listado corta en 500 y los enlaces del feed o del
  // panel "Llegaron al final" pueden apuntar más atrás.
  router.get("/hub/tickets/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    const ticket = await getHubTicket(id);
    if (!ticket) return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
    res.json({ ok: true, ticket });
  });

  router.get("/hub/tickets/:id/messages", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    res.json({ ok: true, messages: await getHubMessages(id) });
  });

  // ── Fotos, audios y archivos del chat (23-nov-2026) ───────────────────────
  // El archivo de un mensaje (del cliente, o del asesor desde su WhatsApp).
  // Ver services/mediosDelChat.ts. Si al llegar no se pudo bajar de Meta, se
  // vuelve a intentar aquí.
  router.get("/hub/messages/:id/media", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const medio = await medioDelMensaje(id, downloadMedia);
      if (!medio) return res.status(404).json({ ok: false, error: "Ese archivo ya no está disponible." });
      res.setHeader("Content-Type", medio.mime);
      res.setHeader("Content-Length", String(medio.bytes.byteLength));
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(medio.nombre)}`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.send(medio.bytes);
    } catch (error) {
      console.error("❌ media del mensaje:", error);
      res.status(500).json({ ok: false, error: "No se pudo abrir el archivo." });
    }
  });

  // Un error del panel en el teléfono (pantalla rota, promesa suelta): queda en
  // el log del servidor. Sin esto «se me quedó en blanco» no deja rastro.
  let erroresDelPanel = 0;
  setInterval(() => { erroresDelPanel = 0; }, 60_000).unref();
  router.post("/hub/error-del-panel", (req, res) => {
    if (erroresDelPanel++ < 20) {
      const c = (v: unknown, n: number) => String(v ?? "").slice(0, n);
      console.warn("📱 Error en el panel:", JSON.stringify({
        quien: req.usuario?.nombre ?? null,
        mensaje: c(req.body?.mensaje, 300),
        donde: c(req.body?.donde, 500),
        ruta: c(req.body?.ruta, 80),
        agente: c(req.body?.agente, 160),
        pila: c(req.body?.pila, 1500),
      }));
    }
    res.json({ ok: true });
  });

  router.get("/hub/feed", async (_req, res) => {
    res.json({ ok: true, feed: await getHubFeed() });
  });

  // Sin `mes`, el mes en curso: el panel arranca de cero el día 1. Con `mes`
  // ("YYYY-MM" o "todos") el usuario mueve esa ventana desde el selector. El
  // mismo valor va a las dos lecturas para que ningún número quede en otro mes.
  router.get("/hub/metrics", async (req, res) => {
    const mes = typeof req.query.mes === "string" ? req.query.mes : null;
    // Un mes cerrado ya no se mueve: se guarda unos minutos y cambiar de mes en
    // el selector no vuelve a correr las consultas pesadas (Manuel, 28-sep).
    // El mes en curso y «todos» se calculan siempre: incluyen lo de hoy.
    const cerrado = mesCerrado(mes);
    const guardado = cerrado ? metricasDeMesCerrado.get(cerrado) : undefined;
    if (guardado && Date.now() - guardado.at < MES_CERRADO_MS) {
      res.json({ ok: true, metrics: guardado.metrics });
      return;
    }
    // Las dos consultas pesadas salen a la vez: en serie, la pantalla de
    // Métricas esperaba la suma de ambas (Manuel, 25-sep: «se demora mucho»).
    // Las ventas confirmadas leen facturas ya bajadas en memoria: si Contífico
    // falla, la tarjeta dice por qué y el resto de Métricas sigue igual.
    // Los números comprobables (facturas de Contífico, mensajes y hechos
    // guardados) van en paralelo y con su propio `.catch`: si fallan, el
    // panel dice «sin Contífico» en esos bloques y no inventa nada.
    const [hub, followUps, ventasConfirmadas, comprobables] = await Promise.all([
      getHubMetrics(mes),
      getFollowUpMetrics(mes),
      resumenVentasConfirmadas(mes).catch((error) => ({ disponible: false, error: mensaje(error, "No se pudo cruzar") })),
      resumenComprobables(mes).catch((error) => {
        console.error("⚠️  Métricas comprobables:", mensaje(error, "no se pudieron armar"));
        return comprobablesVacios({ clave: mes ?? "", todos: mes === "todos" });
      }),
    ]);
    const metrics = { ...hub, inventory: catalogInventoryMetrics(), followUps, ventasConfirmadas, comprobables };
    if (cerrado) metricasDeMesCerrado.set(cerrado, { at: Date.now(), metrics });
    res.json({ ok: true, metrics });
  });

  // Cuenta de tokens y facturación mensual (tab KPI). La lectura es para el
  // cliente; marcar pagado exige la clave de dueño, que el cliente no tiene.
  router.get("/hub/billing", async (_req, res) => {
    try {
      res.json({ ok: true, billing: await resumenBilling() });
    } catch (error) {
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudo calcular la cuenta") });
    }
  });

  /** Lo que solo hace el dueño del servicio: la clave que Depot no tiene. */
  function esDueno(req: express.Request, res: express.Response): boolean {
    const ownerKey = process.env.OWNER_KEY ?? "";
    if (!ownerKey) {
      res.status(503).json({ ok: false, error: "OWNER_KEY no está configurada en el servidor." });
      return false;
    }
    if (req.header("x-owner-key") !== ownerKey) {
      res.status(403).json({ ok: false, error: "Solo el dueño del servicio puede hacer esto." });
      return false;
    }
    return true;
  }

  // Pre-facturas del mes (IA y mantenimiento) en el formato de la contadora.
  // Salen solas el día 1; esto es para bajarlas o reenviarlas a mano.
  router.get("/hub/billing/:period/prefactura/:clave", async (req, res) => {
    if (!esDueno(req, res)) return;
    try {
      const { mesFacturado, prefacturasEnPdf } = await import("../services/prefacturaMensual.js");
      const mes = await mesFacturado(req.params.period);
      if (!mes) {
        res.status(404).json({ ok: false, error: `No hay cuenta para ${req.params.period}` });
        return;
      }
      const doc = (await prefacturasEnPdf(mes)).find(({ p }) => p.clave === req.params.clave.replace(/\.pdf$/, ""));
      if (!doc) {
        res.status(404).json({ ok: false, error: "Usa ia o mantenimiento" });
        return;
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${doc.filename}"`);
      res.send(doc.pdf);
    } catch (error) {
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudo armar la pre-factura") });
    }
  });

  router.post("/hub/billing/prefacturas/enviar", async (req, res) => {
    if (!esDueno(req, res)) return;
    const body = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional() }).safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ ok: false, error: "period debe ser YYYY-MM" });
      return;
    }
    try {
      const { enviarPrefacturas } = await import("../services/prefacturaMensual.js");
      res.json({ ok: true, resultado: await enviarPrefacturas({ forzar: true, period: body.data.period }) });
    } catch (error) {
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudieron enviar") });
    }
  });

  router.post("/hub/billing/:period/pay", async (req, res) => {
    if (!esDueno(req, res)) return;
    const body = z.object({ paid: z.boolean() }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ ok: false, error: "Falta el campo paid (true/false)." });
      return;
    }
    try {
      await marcarPagado(req.params.period, body.data.paid, "owner");
      res.json({ ok: true, billing: await resumenBilling() });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo actualizar el pago") });
    }
  });

  // Lo que de verdad llega del webhook cuando un asesor contesta desde su
  // WhatsApp. El panel lo usa para explicar una conversación sin respuestas
  // nuestras en vez de dejarla como un monólogo sin motivo.
  router.get("/hub/echo-health", async (_req, res) => {
    res.json({ ok: true, echoHealth: await getEchoHealth() });
  });

  router.get("/hub/final-stage", async (req, res) => {
    const mes = typeof req.query.mes === "string" ? req.query.mes : null;
    res.json({ ok: true, finalStage: await getFinalStageArrivals(mes) });
  });

  router.get("/catalog/media-report", async (_req, res) => {
    await ensureCatalogReady().catch(() => undefined);
    res.json({ ok: true, report: catalogMediaReport() });
  });

  router.get("/hub/events", (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const unsubscribe = subscribeLiveEvents((event) => {
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 20_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  router.get("/hub/follow-ups", async (_req, res) => {
    res.json({ ok: true, followUps: await listFollowUpBoard() });
  });

  router.post("/hub/follow-ups/:id/send-now", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "id inválido" });
    const [job] = await sql<{ conversation_id: number }[]>`
      update follow_up_jobs set due_at = now(), status = 'scheduled',
        cancel_reason = null, locked_at = null, locked_by = null
      where id = ${id} and status in ('scheduled', 'blocked', 'failed')
      returning conversation_id
    `;
    if (!job) return res.status(409).json({ ok: false, error: "Ese seguimiento ya no se puede enviar" });
    emitLiveEvent("follow_up", Number(job.conversation_id));
    res.json({ ok: true });
  });

  router.patch("/hub/follow-ups/:id", async (req, res) => {
    const id = Number(req.params.id);
    const preview = String(req.body?.preview ?? "").trim().slice(0, 1000);
    if (!Number.isInteger(id) || !preview) return res.status(400).json({ ok: false, error: "Mensaje inválido" });
    const [job] = await sql<{ conversation_id: number }[]>`
      update follow_up_jobs
      set payload = payload || jsonb_build_object('preview', ${preview}::text, 'aiPending', false, 'copySource', 'advisor')
      where id = ${id} and status in ('scheduled', 'blocked') returning conversation_id
    `;
    if (!job) return res.status(409).json({ ok: false, error: "Seguimiento no editable" });
    emitLiveEvent("follow_up", Number(job.conversation_id));
    res.json({ ok: true });
  });

  // Redacción bajo demanda: el asesor puede ver y editar el texto antes de la
  // hora de envío. Como queda con `aiPending: false`, el worker lo respeta y no
  // vuelve a llamar al modelo.
  router.post("/hub/follow-ups/:id/generate", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "id inválido" });
    const [job] = await sql<{ status: string }[]>`select status from follow_up_jobs where id = ${id}`;
    if (!job) return res.status(404).json({ ok: false, error: "Seguimiento no encontrado" });
    if (!["scheduled", "blocked"].includes(job.status)) {
      return res.status(409).json({ ok: false, error: "Ese seguimiento ya no se puede redactar" });
    }
    const result = await generateFollowUpJobCopyById(id);
    if (!result) return res.status(404).json({ ok: false, error: "Seguimiento no encontrado" });
    res.json({ ok: true, preview: result.text });
  });

  router.delete("/hub/follow-ups/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "id inválido" });
    const [job] = await sql<{ conversation_id: number }[]>`
      update follow_up_jobs set status = 'cancelled', cancel_reason = 'cancelled_by_owner', executed_at = now()
      where id = ${id} and status in ('scheduled', 'blocked', 'failed') returning conversation_id
    `;
    if (job) emitLiveEvent("follow_up", Number(job.conversation_id));
    res.json({ ok: true });
  });

  router.get("/hub/alerts", async (_req, res) => {
    res.json({ ok: true, alerts: await listBotAlerts() });
  });

  router.post("/hub/alerts/:id/action", async (req, res) => {
    const id = Number(req.params.id);
    const action = String(req.body?.action ?? "");
    if (!Number.isInteger(id) || !["resolve", "snooze", "take"].includes(action)) {
      return res.status(400).json({ ok: false, error: "Acción inválida" });
    }
    const [alert] = await sql<{ conversation_id: number }[]>`
      update bot_alerts set
        status = ${action === "resolve" || action === "take" ? "resolved" : "snoozed"},
        resolved_at = ${action === "resolve" || action === "take" ? new Date() : null},
        snoozed_until = ${action === "snooze" ? new Date(Date.now() + 4 * 60 * 60 * 1000) : null}
      where id = ${id} returning conversation_id
    `;
    if (!alert) return res.status(404).json({ ok: false, error: "Alerta no encontrada" });
    if (action === "take") await setConversationAssignee(Number(alert.conversation_id), "human");
    emitLiveEvent("alert", Number(alert.conversation_id));
    res.json({ ok: true });
  });

  // ── Reporte del día ────────────────────────────────────────────────────
  // El asesor lo recibe por WhatsApp a las 20:00; estas rutas son para verlo
  // antes, revisarlo desde el panel y reenviarlo si hizo falta. Fuera de hora
  // devuelven el último período cerrado, no medio día suelto.
  router.get("/hub/reporte-diario", async (_req, res) => {
    res.json({ ok: true, reporte: await buildDailyReport() });
  });

  router.get("/hub/reporte-diario.html", async (_req, res) => {
    res.type("html").send(renderDailyReportHtml(await buildDailyReport()));
  });

  // El PDF que llega por WhatsApp: el modelo simple.
  router.get("/hub/reporte-diario.pdf", async (_req, res) => {
    const reporte = await buildReporteSimple();
    const pdf = await renderReporteSimplePdf(reporte);
    res.type("application/pdf")
      .setHeader("Content-Disposition", `inline; filename="${nombreArchivoReporteSimple(reporte)}"`);
    res.send(pdf);
  });

  // El original, con el tablero de la semana y una tarjeta por conversación.
  router.get("/hub/reporte-diario-completo.pdf", async (_req, res) => {
    const reporte = await buildDailyReport();
    const pdf = await renderDailyReportPdf(reporte);
    res.type("application/pdf")
      .setHeader("Content-Disposition", `inline; filename="${nombreArchivoReporte(reporte)}"`);
    res.send(pdf);
  });

  router.post("/hub/reporte-diario/enviar", async (_req, res) => {
    const resultado = await enviarReporteDiario({ forzar: true });
    res.json({ ok: resultado.enviado, ...resultado });
  });

  router.get("/follow-up-settings", async (_req, res) => {
    res.json({ ok: true, ...(await getFollowUpSettings()) });
  });

  router.put("/follow-up-settings/policy", async (req, res) => {
    const input = z.object({
      timezone: z.string().min(1).max(80), businessHours: z.record(z.string(), z.unknown()),
      quietHours: z.record(z.string(), z.unknown()).default({}), enabledStages: z.array(z.string()).max(10),
      enabled: z.boolean(), firstDelayMinutes: z.number().int().min(1).max(10080),
      secondBeforeCloseMinutes: z.number().int().min(1).max(1440), minimumGapMinutes: z.number().int().min(1).max(1440),
      maxInWindowAttempts: z.number().int().min(0).max(5), maxPostWindowAttempts: z.number().int().min(0).max(5),
      postWindowGapMinutes: z.number().int().min(1440).max(10080), advisorAlertDays: z.number().int().min(1).max(30),
      recommendCloseDays: z.number().int().min(1).max(90), requireConsent: z.boolean(), respectOptOut: z.boolean(),
      neverOutsideHours: z.boolean(), maxMessagesPerDay: z.number().int().min(1).max(10), pauseOnHumanControl: z.boolean(),
      alertSettings: z.record(z.string(), z.unknown()).default({}),
      stagePrompts: z.record(z.string(), z.string().max(2000)).default({}),
      templateFollowUpDays: z.number().int().min(1).max(8).default(8),
      templateSendTime: z.string().regex(/^\d{2}:\d{2}$/).default("10:00"),
    }).parse(req.body);
    await sql`
      update follow_up_policies set enabled=${input.enabled}, timezone=${input.timezone},
        business_hours=${sql.json(input.businessHours as never)}, quiet_hours=${sql.json(input.quietHours as never)},
        enabled_stages=${sql.json(input.enabledStages as never)}, first_delay_minutes=${input.firstDelayMinutes},
        second_before_close_minutes=${input.secondBeforeCloseMinutes}, minimum_gap_minutes=${input.minimumGapMinutes},
        max_in_window_attempts=${input.maxInWindowAttempts}, max_post_window_attempts=${input.maxPostWindowAttempts},
        post_window_gap_minutes=${input.postWindowGapMinutes}, advisor_alert_days=${input.advisorAlertDays},
        recommend_close_days=${input.recommendCloseDays}, require_consent=${input.requireConsent},
        respect_opt_out=${input.respectOptOut}, never_outside_hours=${input.neverOutsideHours},
        max_messages_per_day=${input.maxMessagesPerDay}, pause_on_human_control=${input.pauseOnHumanControl}, updated_at=now()
        , alert_settings=${sql.json(input.alertSettings as never)}, stage_prompts=${sql.json(input.stagePrompts as never)},
        template_follow_up_days=${input.templateFollowUpDays}, template_send_time=${input.templateSendTime}
      where policy_key='default'
    `;
    const rescheduled = await rescheduleActiveConversationPlans();
    emitLiveEvent("settings"); emitLiveEvent("follow_up");
    res.json({ ok: true, rescheduled });
  });

  // Trae de Meta estado y categoría reales de cada plantilla (19-nov-2026).
  router.post("/follow-up-settings/templates/sync", async (_req, res) => {
    try {
      const { actualizadas, enMeta } = await sincronizarPlantillas();
      emitLiveEvent("settings");
      res.json({ ok: true, actualizadas, enMeta, ...(await getFollowUpSettings()) });
    } catch (error) {
      res.status(502).json({ ok: false, error: mensaje(error, "No se pudo leer Meta") });
    }
  });

  router.put("/follow-up-settings/templates/:key", async (req, res) => {
    const key = String(req.params.key);
    const input = z.object({ templateName: z.string().max(512).nullable(), language: z.string().min(1).max(20),
      expectedCategory: z.string().max(40), variables: z.array(z.string()).max(20), buttons: z.array(z.unknown()).max(10),
      preview: z.string().max(2000), approvalStatus: z.enum(["not_configured", "pending", "approved", "rejected"]),
      configured: z.boolean(), automaticSend: z.boolean() }).parse(req.body);
    await sql`update follow_up_templates set template_name=${input.templateName}, language=${input.language},
      expected_category=${input.expectedCategory}, variables=${sql.json(input.variables as never)}, buttons=${sql.json(input.buttons as never)},
      preview=${input.preview}, approval_status=${input.approvalStatus}, configured=${input.configured},
      automatic_send=${input.automaticSend}, updated_at=now() where template_key=${key}`;
    emitLiveEvent("settings"); res.json({ ok: true });
  });

  router.get("/hub/follow-up-metrics", async (_req, res) => {
    res.json({ ok: true, metrics: await getFollowUpMetrics() });
  });

  router.get("/hub/tickets/:id/template-plan", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "id inválido" });
    res.json({ ok: true, plan: await previewAdvisorTemplatePlan(id) });
  });

  router.post("/hub/tickets/:id/template-plan", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "id inválido" });
    try {
      const plan = await authorizeAdvisorTemplatePlan(id);
      res.json({ ok: true, plan });
    } catch (error) {
      res.status(409).json({ ok: false, error: error instanceof Error ? error.message : "No se pudo autorizar el plan" });
    }
  });

  router.post("/hub/tickets/:id/consent", async (req, res) => {
    const id = Number(req.params.id); const granted = Boolean(req.body?.granted);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "id inválido" });
    const [conversation] = await sql<{ current_cycle: number }[]>`select current_cycle from conversations where id=${id}`;
    if (!conversation) return res.status(404).json({ ok: false, error: "Conversación no encontrada" });
    await sql`update conversations set customer_opt_in=${granted}, opted_out_at=${granted ? null : new Date()}, updated_at=now() where id=${id}`;
    await sql`insert into customer_consents (conversation_id, cycle, status, source, recorded_by, revoked_at)
      values (${id}, ${conversation.current_cycle}, ${granted ? "granted" : "revoked"}, 'admin_panel', 'owner', ${granted ? null : new Date()})`;
    if (!granted) await cancelPendingFollowUps(id, "consent_revoked");
    emitLiveEvent("sync", id); res.json({ ok: true });
  });

  router.post("/hub/tickets/:id/discount-offers", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "id inválido" });
    try {
      const input = z.object({
        prompt: z.string().trim().min(3).max(500),
        deliveryMode: z.enum(["now", "next_message"]).default("next_message"),
      }).parse(req.body);
      const antes = await fotoDelTicket(id);
      const created = await createDiscountFromPrompt(
        id, input.prompt, "admin_prompt", null, input.deliveryMode,
      );
      await registrarAccion(id, "descuento", quienEnElPanel(req), { indicacion: input.prompt, entrega: input.deliveryMode }, antes);
      const message = created.status === "pending"
        ? pendingDiscountNoticeMessage(created.pending)
        : discountOfferMessage(created.offer);
      if (input.deliveryMode === "next_message") {
        await scheduleConversationFollowUps(id);
        return res.status(202).json({
          ok: true, sent: false, pending: created.status === "pending", message,
          warning: created.status === "pending"
            ? "Descuento guardado: el bot lo incluirá en su siguiente respuesta y en la próxima cotización."
            : "Descuento aplicado: el bot lo incluirá en su siguiente respuesta.",
        });
      }
      await cancelPendingFollowUps(id, "discount_offer_replaced_plan");
      const decision = await authorizeConversationOutbound({
        conversationId: id, contentType: "text", actor: "owner",
      });
      if (!decision.allowed) {
        const [conversation] = await sql<{ current_cycle: number }[]>`
          select current_cycle from conversations where id=${id}
        `;
        if (conversation) await createBotAlert({
          conversationId: id, cycle: conversation.current_cycle,
          type: "discount_template_required", priority: "high",
          summary: "Descuento autorizado, pero la ventana está cerrada",
          exactReason: created.status === "applied"
            ? "No se envió texto libre. La oferta quedó reflejada en la cotización revisada."
            : "No se envió texto libre. La elegibilidad quedó guardada para la próxima cotización.",
          suggestedAction: `Usar una plantilla aprobada o llamar al cliente. Texto de contexto: ${message}`,
          dedupeKey: `${id}:${conversation.current_cycle}:discount_template_required:${created.status}:${created.status === "pending" ? created.pending.id : created.offer.id}`,
        });
        await scheduleConversationFollowUps(id);
        return res.status(202).json({
          ok: true, sent: false, policyCode: decision.code, message,
          ...(created.status === "applied" ? { offer: created.offer } : { pending: true }),
          warning: "Ventana cerrada: no se envió texto libre; se creó una alerta para el asesor.",
        });
      }
      const [conversation] = await sql<{ phone: string }[]>`select phone from conversations where id=${id}`;
      if (!conversation) return res.status(404).json({ ok: false, error: "Conversación no encontrada" });
      let providerId: string | undefined;
      let messageType: "text" | "image" = "text";
      let filename: string | undefined;
      if (created.status === "pending") {
        const sent = await sendTextDetailed(conversation.phone, message);
        if (!sent.ok) return res.status(sent.status).json(sent);
        providerId = sent.id;
      } else try {
        const offer = created.offer;
        await ensureCatalogReady();
        const [quote] = await sql<{
          id: number; quote_number: string; items: Array<Record<string, unknown>>;
          subtotal: string | number; tax: string | number; total: string | number;
        }[]>`select id, quote_number, items, subtotal, tax, total from quotes where id=${offer.quoteId}`;
        if (!quote) throw new Error("Cotización revisada no encontrada");
        const renderLines = [];
        for (const item of quote.items) {
          const product = findByCode(String(item.code ?? ""));
          if (!product) throw new Error(`Producto ${String(item.code ?? "")} no está en catálogo`);
          renderLines.push(await toRenderLine(product, Number(item.quantity ?? 1)));
        }
        const png = await renderQuoteImage({
          number: quote.quote_number, dateLabel: new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeZone: "America/Guayaquil" }).format(new Date()),
          lines: renderLines, subtotal: Number(quote.subtotal), iva: Number(quote.tax), total: Number(quote.total),
          discountAmount: offer.discountAmountCents / 100, discountCondition: offer.condition,
          offerExpiresAt: offer.expiresAt,
        });
        filename = `Cotizacion-${business.name.replace(/\s/g, "")}-${quote.quote_number}.png`;
        providerId = await sendImage(id, conversation.phone, png, message, filename);
        messageType = "image";
        await logQuoteArtifact({ conversationId: id, quoteId: Number(quote.id), kind: "quote", products: quote.items, filename, providerId });
      } catch (visualError) {
        console.warn("⚠️ No se pudo generar la cotización visual del descuento; se enviará texto:", visualError);
        const sent = await sendTextDetailed(conversation.phone, message);
        if (!sent.ok) return res.status(sent.status).json(sent);
        providerId = sent.id;
      }
      await appendMessage(id, "assistant", message, providerId, {
        type: messageType, authorKind: "bot", status: "sent",
        metadata: created.status === "applied"
          ? { discountOfferId: created.offer.id, authorizedBy: "owner", filename }
          : { pendingDiscountId: created.pending.id, authorizedBy: "owner" },
      });
      const [stored] = providerId
        ? await sql<{ id: number }[]>`select id from messages where wa_message_id=${providerId}`
        : [];
      if (created.status === "applied") {
        await markDiscountOfferSent(created.offer.id, stored?.id ? Number(stored.id) : null);
      } else {
        await markDiscountNoticeSent("pending", created.pending.id);
      }
      await scheduleConversationFollowUps(id);
      emitLiveEvent("message", id); emitLiveEvent("sync", id);
      res.json({ ok: true, sent: true, message,
        ...(created.status === "applied" ? { offer: created.offer } : { pending: true }) });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Oferta inválida" });
    }
  });

  /**
   * Vuelve a dibujar la pieza que se envió en un mensaje, para poder verla en
   * el panel. Solo se guarda el registro del envío, no el PNG: se re-renderiza
   * desde `metadata` (códigos o número de cotización).
   *
   * Ojo: usa el catálogo de HOY. Sirve para comprobar que la pieza se ve bien,
   * no como archivo de lo que exactamente recibió el cliente — si un precio
   * cambió desde entonces, aquí sale el nuevo. El estado real del envío (sent /
   * failed) sale del mensaje, no de que esto renderice.
   */
  router.get("/hub/messages/:id/pieza.png", async (req, res) => {
    try {
      // `?chica=1`: la versión de 560 px para la burbuja del chat. Las dos
      // versiones se guardan en memoria (ver services/piezasDelChat.ts).
      const chica = req.query.chica === "1";
      const claveDePieza = `${Number(req.params.id)}:${chica ? "chica" : "grande"}`;
      const guardada = piezaEnMemoria(claveDePieza);
      if (guardada) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "private, max-age=1800");
        return res.send(guardada);
      }
      const [row] = await sql<{
        type: string;
        metadata: Record<string, unknown> | null;
        tire_size: string | null;
      }[]>`
        select m.type, m.metadata, c.tire_size
        from messages m
        join conversations c on c.id = m.conversation_id
        where m.id = ${Number(req.params.id)}
      `;
      if (!row || (row.type !== "image" && row.type !== "pdf")) {
        return res.status(404).json({ ok: false, error: "Ese mensaje no llevaba una pieza" });
      }
      const meta = row.metadata ?? {};
      // Una foto que adjuntó el asesor: no hay nada que redibujar, se sirve su miniatura.
      if (meta.adjunto === "foto") {
        // Al ampliar va la foto entera (guardada desde el 23-nov); en la burbuja, la miniatura.
        const entera = chica ? null : await medioDelMensaje(Number(req.params.id), downloadMedia).catch(() => null);
        const foto = entera?.bytes ?? miniaturaABuffer(meta.miniatura);
        if (!foto) return res.status(404).json({ ok: false, error: "Esa foto no guardó miniatura" });
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "private, max-age=86400");
        return res.send(foto);
      }
      await ensureCatalogReady().catch(() => undefined);
      const pieza = String(meta.piece ?? (meta.quoteNumber ? "quote" : "options"));
      const codes = Array.isArray(meta.codes) ? (meta.codes as string[]) : [];
      const tema = { ...(await getPiecesConfig()), brandProfiles: await brandProfilesForRender() };
      const fecha = new Date().toLocaleDateString("es-EC", {
        day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil",
      });

      let png: Buffer;
      if (pieza === "quote") {
        const [quote] = await sql<{ items: unknown; subtotal: string; tax: string; total: string }[]>`
          select items, subtotal, tax, total from quotes
          where quote_number = ${String(meta.quoteNumber ?? "")} limit 1
        `;
        const item = (Array.isArray(quote?.items) ? quote.items : [])[0] as
          { code?: string; quantity?: number } | undefined;
        const producto = item?.code ? findByCode(item.code) : undefined;
        if (!producto) {
          return res.status(404).json({ ok: false, error: "El producto de esa cotización ya no está en el catálogo" });
        }
        png = await renderQuoteImage({
          number: String(meta.quoteNumber ?? ""), dateLabel: fecha,
          lines: [await toRenderLine(producto, Number(item?.quantity ?? 1))],
          subtotal: Number(quote.subtotal), iva: Number(quote.tax), total: Number(quote.total),
          benefits: await applicableBenefitTexts({ brands: [producto.brand], quantity: Number(item?.quantity ?? 1) }),
          ...tema,
        });
      } else {
        const productos = codes.map((c) => findByCode(c)).filter(Boolean) as NonNullable<ReturnType<typeof findByCode>>[];
        if (!productos.length) {
          return res.status(404).json({ ok: false, error: "Los productos de esa pieza ya no están en el catálogo" });
        }
        const medidasProducto = new Set(productos.map((p) => p.sizeLabel).filter(Boolean));
        const medidaPedida =
          (typeof meta.sizeLabel === "string" && meta.sizeLabel.trim())
          || row.tire_size?.trim()
          || (medidasProducto.size === 1 ? productos[0]?.sizeLabel ?? null : null);
        const comun = {
          dateLabel: fecha,
          sizeLabel: medidasProducto.size === 1 ? (productos[0]?.sizeLabel ?? null) : null,
          medidaPedida,
          products: await Promise.all(productos.map((p) => toRenderLine(p))),
          ...tema,
        };
        png = pieza === "comparison"
          ? await renderCompareImage(comun)
          : await renderOptionsImage(comun);
      }
      guardarPieza(`${Number(req.params.id)}:grande`, png);
      if (chica) {
        png = achicarPieza(png, 560);
        guardarPieza(claveDePieza, png);
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, max-age=1800");
      res.send(png);
    } catch (error) {
      console.error("❌ No se pudo re-dibujar la pieza:", error);
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudo dibujar la pieza") });
    }
  });

  // ── Puesta al día tras un apagón del bot ────────────────────────────────────
  //
  // Con el bot apagado se guardan los mensajes y se extraen los datos, pero
  // nunca corre el clasificador de etapa. Estas dos dejan el tablero al día sin
  // adivinar. Ambas aceptan ?simular=1 para ver el plan sin tocar nada.

  router.post("/hub/tickets/reorganizar", async (req, res) => {
    try {
      const dryRun = req.query.simular === "1";
      const { movimientos, aplicados } = await reorganizarEtapas({ dryRun });
      res.json({ ok: true, simulado: dryRun, aplicados, movimientos });
    } catch (error) {
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudo reorganizar") });
    }
  });

  router.post("/hub/tickets/atender-pendientes", async (req, res) => {
    try {
      const dryRun = req.query.simular === "1";
      const limite = Math.max(1, Math.min(Number(req.body?.limite) || 25, 100));
      const out = await atenderPendientes({ limite, dryRun });
      res.json({ ok: true, simulado: dryRun, ...out });
    } catch (error) {
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudo atender los pendientes") });
    }
  });

  router.patch("/hub/tickets/:id/stage", async (req, res) => {
    const id = Number(req.params.id);
    const stage = String(req.body?.stage ?? "");
    if (!Number.isInteger(id) || !isStage(stage)) {
      return res.status(400).json({ ok: false, error: "Etapa inválida" });
    }
    // «Ganado» se confirma en el formulario de cierre (factura y monto, o
    // completar después): arrastrar la tarjeta no alcanza.
    if (stage === "ganado" && (await confirmaGanado())) {
      return res.status(409).json({ ok: false, code: "ganado_sin_confirmar", error: "Para cerrar como ganado, confirma la venta en «Cerrar ticket»." });
    }
    const antes = await fotoDelTicket(id);
    await setStage(id, stage, {
      actor: "owner",
      reason: String(req.body?.reason ?? "Movimiento manual desde Kanban").slice(0, 300),
    });
    await registrarAccion(id, "mover_etapa", quienEnElPanel(req), { a: stage }, antes);
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  router.post("/hub/tickets/:id/close", async (req, res) => {
    const id = Number(req.params.id);
    const closure = String(req.body?.closure ?? "");
    if (!Number.isInteger(id) || !["ganado", "perdido", "sin_respuesta"].includes(closure)) {
      return res.status(400).json({ ok: false, error: "Cierre inválido" });
    }
    // «GANADO» = EL ASESOR CONFIRMA QUE COMPRÓ ACÁ (21-nov-2026, Manuel): «el
    // cliente llegó y compró» + factura y monto, siempre (sin ellos se espera).
    // Eso escribe la factura del ticket (la misma tabla que /venta) y lo cierra. Con el ajuste del negocio apagado, el cierre libre
    // de antes. «Perdido» y «sin respuesta» no cambian.
    const antes = await fotoDelTicket(id);
    if (closure === "ganado") {
      const cuerpo = (req.body ?? {}) as Record<string, unknown>;
      const vendedor = quienEnElPanel(req);
      const nota = typeof cuerpo.note === "string" ? cuerpo.note : null;
      if (await confirmaGanado()) {
        const revision = revisarCierreGanado(cuerpo, ventaCompleta(await ventaDelTicket(id)));
        if (!revision.ok) return res.status(revision.status).json(revision);
        const venta = await confirmarVentaEnElPanel(id, { vendedor, factura: revision.factura, monto: revision.monto, nota });
        if (!venta) return res.status(404).json({ ok: false, error: "Conversación no encontrada" });
        await registrarAccion(id, "cerrar_ganado", vendedor, { factura: revision.factura, monto: revision.monto, nota }, antes);
        return res.json({ ok: true, venta });
      }
      await setStage(id, "ganado", { actor: "owner", reason: String(nota ?? closure) });
      await registrarAccion(id, "cerrar_ganado", vendedor, { nota }, antes);
      emitLiveEvent("sync", id);
      return res.json({ ok: true });
    }
    await setStage(id, "perdido", {
      actor: "owner",
      reason: closure === "sin_respuesta" ? "sin_respuesta" : String(req.body?.note ?? closure),
    });
    await registrarAccion(id, closure === "sin_respuesta" ? "cerrar_sin_respuesta" : "cerrar_perdido", quienEnElPanel(req), {
      nota: typeof req.body?.note === "string" ? req.body.note : null,
    }, antes);
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  // Añadir una factura a un ticket ganado: la primera de un ganado viejo, u
  // otra más si el cliente hizo dos compras (mismo ticket y ciclo; sigue siendo
  // UNA venta, lo pagado se suma). No mueve la etapa. `cycle` solo para un
  // ganado de un ciclo anterior (el cliente volvió). `/venta` queda como el
  // nombre de antes de la misma ruta.
  router.post(["/hub/tickets/:id/facturas", "/hub/tickets/:id/venta"], async (req, res) => {
    const id = Number(req.params.id);
    const cycle = req.body?.cycle == null ? null : Number(req.body.cycle);
    if (!Number.isInteger(id) || (cycle != null && !Number.isInteger(cycle))) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    const quien = quienEnElPanel(req);
    const antes = await fotoDelTicket(id);
    const r = await agregarFactura(id, cycle, { vendedor: quien, factura: req.body?.factura, monto: req.body?.monto });
    if (!r.ok) return res.status(r.status).json(r);
    const ultima = r.facturas[r.facturas.length - 1];
    await registrarAccion(id, "agregar_factura", quien, { factura: ultima?.factura ?? null, monto: ultima?.monto ?? null }, antes);
    res.json(r);
  });

  // Lo que falta para que «ganado» sea venta: compras por confirmar («ya
  // compré»), facturas pendientes y ganados viejos sin registrar.
  // Quién hizo qué en este ticket (services/accionesDelPanel.ts).
  router.get("/hub/tickets/:id/historial", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "id inválido" });
    res.json({ ok: true, historial: await historialDelTicket(id) });
  });

  router.get("/hub/ventas-pendientes", async (_req, res) => {
    res.json({ ok: true, pendientes: await listarPendientes() });
  });

  // «Deshacer venta»: vuelve a la etapa de antes del «Vendido», en la misma
  // visita, y la venta deja de contarse (`deshacerVenta`).
  router.post("/hub/tickets/:id/deshacer-venta", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    const antes = await fotoDelTicket(id);
    const etapa = await deshacerVenta(id);
    if (!etapa) return res.status(409).json({ ok: false, error: "Este ticket no está cerrado como venta" });
    await registrarAccion(id, "deshacer_venta", quienEnElPanel(req), { etapa }, antes);
    emitLiveEvent("sync", id);
    res.json({ ok: true, etapa });
  });

  router.post("/hub/tickets/:id/reopen", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    // La misma regla de las 12 h que la reapertura por mensaje del cliente:
    // reabrir a los minutos de un cierre (p. ej. un cierre equivocado que el
    // asesor deshace desde el panel) conserva la medida, el carro y el local;
    // pasadas las 12 h de silencio sí empieza una visita limpia.
    const antes = await fotoDelTicket(id);
    await reopenConversation(id, "owner", "Conversación reabierta manualmente", {
      conservarFichaSiEsMismaVisita: true,
    });
    await registrarAccion(id, "reabrir", quienEnElPanel(req), {}, antes);
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  router.patch("/hub/tickets/:id/assignee", async (req, res) => {
    const id = Number(req.params.id);
    const assignedTo = String(req.body?.assignedTo ?? "");
    if (!Number.isInteger(id) || !["bot", "human"].includes(assignedTo)) {
      return res.status(400).json({ ok: false, error: "Asignación inválida" });
    }
    const antes = await fotoDelTicket(id);
    await setConversationAssignee(id, assignedTo as "bot" | "human");
    await registrarAccion(id, assignedTo === "bot" ? "devolver_al_bot" : "tomar", quienEnElPanel(req), {}, antes);
    const resumed = assignedTo === "bot" ? await resumeBotIfUnanswered(id) : null;
    emitLiveEvent("sync", id);
    res.json({ ok: true, resumed });
  });

  // "Para después": el asesor la revisó en el modo swipe y no la cerró, pero
  // tampoco la quiere perder de vista. Oportunidades la pinta arriba de todo.
  router.patch("/hub/tickets/:id/review-later", async (req, res) => {
    const id = Number(req.params.id);
    const enabled = req.body?.enabled;
    if (!Number.isInteger(id) || typeof enabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "Parámetros inválidos" });
    }
    await setReviewLater(id, enabled);
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  // Para cerrar: quienes ya aceptaron precio y local, a quién escribir hoy,
  // a quién ya se le escribió y el archivo (domain/paraCerrar.ts).
  router.get("/hub/para-cerrar", async (_req, res) => {
    res.json({ ok: true, paraCerrar: await leerParaCerrar() });
  });

  const AccionParaCerrarSchema = z.discriminatedUnion("accion", [
    z.object({ accion: z.literal("sacar") }),
    z.object({ accion: z.literal("devolver") }),
    z.object({ accion: z.literal("posponer"), hasta: z.coerce.date() }),
    z.object({ accion: z.literal("no_posponer") }),
    z.object({ accion: z.literal("revivir") }),
    z.object({ accion: z.literal("no_revivir") }),
  ]);
  router.post("/hub/tickets/:id/para-cerrar", async (req, res) => {
    const id = Number(req.params.id);
    const parsed = AccionParaCerrarSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) {
      return res.status(400).json({ ok: false, error: "Acción inválida" });
    }
    if (!(await decidirParaCerrar(id, parsed.data as AccionParaCerrar))) {
      return res.status(404).json({ ok: false, error: "Conversación no encontrada" });
    }
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  router.post("/hub/tickets/:id/notes", async (req, res) => {
    const id = Number(req.params.id);
    const content = String(req.body?.content ?? "").trim().slice(0, 2000);
    if (!Number.isInteger(id) || !content) {
      return res.status(400).json({ ok: false, error: "Nota inválida" });
    }
    await addConversationNote(id, content);
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  router.post("/hub/tickets/:id/read", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    await markConversationRead(id);
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  // ── Cotizador / catálogo ───────────────────────────────────────────────────
  router.get("/catalog/status", (_req, res) => {
    res.json({ ok: true, catalog: catalogStatus() });
  });

  router.get("/catalog/search", async (req, res) => {
    const query = String(req.query.q ?? "").trim().slice(0, 100);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 40, 60));
    if (!query) {
      return res.status(400).json({ ok: false, error: "Escribe una medida, código o diseño" });
    }
    try {
      await ensureCatalogReady();
      const products = searchByText(query, limit).map(publicCatalogItem);
      res.json({ ok: true, query, products, catalog: catalogStatus() });
    } catch {
      res.status(503).json({
        ok: false,
        error: "El catálogo no está disponible en este momento. Intenta nuevamente.",
      });
    }
  });

  router.post("/catalog/message", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = CatalogSelectionSchema.parse(req.body);
      const selections = resolveCatalogSelections(input.items);
      res.json({
        ok: true,
        message: buildCustomerQuoteMessage(selections, input.customerName),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Selección inválida";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/catalog/compare-message", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = CompareSchema.parse(req.body);
      const products = resolveCatalogProducts(input.items.map(({ id }) => id));
      res.json({ ok: true, message: buildComparisonMessageDetallado(products) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Comparación inválida";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/catalog/options-message", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = OptionsSchema.parse(req.body);
      const products = resolveCatalogProducts(input.items.map(({ id }) => id));
      const message =
        input.style === "distributor"
          ? buildDistributorOptionsMessage(products)
          : buildCustomerOptionsMessageDetallado(products, input.customerName);
      res.json({ ok: true, message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Selección inválida";
      res.status(400).json({ ok: false, error: message });
    }
  });

  // ── Piezas del Cotizador (PNG) ──────────────────────────────────────────────
  //
  // El hub las dibujaba por su cuenta con un canvas propio, y ese canvas se
  // quedó en el diseño viejo (azul marino, sin garantías grandes, sin sello de
  // medida) mientras el bot ya mandaba el nuevo: en la demo del 14-ago Andrés
  // vio dos piezas distintas para lo mismo. Ahora hay UN solo renderizador —
  // este, el del bot— y el hub solo descarga lo que aquí sale.

  /** Tema (paleta, fuente y perfiles de marca) tal como lo usa el bot. */
  async function temaDePiezas() {
    return { ...(await getPiecesConfig()), brandProfiles: await brandProfilesForRender() };
  }

  /**
   * Las llantas de una lámina de OPCIONES armada en el panel. La plantilla día
   * y noche muestra el JUEGO de 4: con una promoción por cantidad (4x3, precio
   * del juego…) la tarjeta tiene que salir con el precio de esas 4, que es lo
   * que después firma la cotización (25-nov: 4x3 a las Kenda y la tarjeta
   * seguía en $234.70 con la cotización en $188.60). La clásica muestra el
   * precio por unidad: ahí la llanta va sin cantidad, como siempre.
   */
  async function lineasDeOpciones(products: Parameters<typeof toRenderLine>[0][]) {
    const delJuego = (await getPiecesConfig()).plantilla === "diaNoche";
    return Promise.all(products.map((p) => toRenderLine(delJuego ? productoParaCantidad(p, politica.juegoCompleto) : p)));
  }

  function fechaDePieza(): string {
    return new Date().toLocaleDateString("es-EC", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Guayaquil",
    });
  }

  function enviarPng(res: express.Response, png: Buffer, filename: string): void {
    res
      .status(200)
      .type("image/png")
      .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
      .send(png);
  }

  router.post("/catalog/options-image", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = OptionsImageSchema.parse(req.body);
      const products = resolveCatalogProducts(input.items.map(({ id }) => id));
      // El rótulo de medida solo se pone cuando TODAS son la misma: con un
      // grupo mezclado, poner la medida de la primera es falso para las otras.
      const medidas = new Set(products.map((p) => p.sizeLabel).filter(Boolean));
      const png = await renderOptionsImage({
        dateLabel: fechaDePieza(),
        sizeLabel: medidas.size === 1 ? (products[0]?.sizeLabel ?? null) : null,
        // La medida buscada en el Cotizador es la que pidió el cliente: con
        // ella cada tarjeta sale sellada como exacta o como equivalente.
        medidaPedida: input.medidaPedida?.trim() || null,
        products: await lineasDeOpciones(products),
        ...(await temaDePiezas()),
      });
      enviarPng(res, png, `Opciones-${business.name.replace(/\s/g, "")}.png`);
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo dibujar las opciones") });
    }
  });

  router.post("/catalog/compare-image", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = CompareSchema.parse(req.body);
      const products = resolveCatalogProducts(input.items.map(({ id }) => id));
      const png = await renderCompareImage({
        dateLabel: fechaDePieza(),
        sizeLabel: products[0]?.sizeLabel ?? null,
        products: await Promise.all(products.map((p) => toRenderLine(p))),
        ...(await temaDePiezas()),
      });
      enviarPng(res, png, `Comparativa-${business.name.replace(/\s/g, "")}.png`);
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo dibujar la comparativa") });
    }
  });

  router.post("/catalog/quote-image", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = QuoteSchema.parse(req.body);
      const [selection] = resolveCatalogSelections([input.item]);
      const { product, quantity } = selection;
      // Mismos números que el PDF: se arma la cotización con el mismo builder
      // para que la imagen y el PDF de la misma selección nunca discrepen.
      const quote = buildQuote(
        [
          {
            code: product.code,
            description: `${product.brand} ${product.design} ${product.sizeLabel ?? product.name}`,
            quantity,
            unitPrice: product.minimumPriceWithTax / (1 + product.taxRate),
          },
        ],
        input.customerName,
        input.customerPhone,
      );
      const png = await renderQuoteImage({
        number: quote.number,
        dateLabel: fechaDePieza(),
        lines: [await toRenderLine(product, quantity)],
        subtotal: quote.subtotal,
        iva: quote.tax,
        total: quote.total,
        benefits: [...await applicableBenefitTexts({ brands: [product.brand], quantity }), ...textosDeRegalos(product)],
        ...(await temaDePiezas()),
      });
      enviarPng(res, png, `Cotizacion-${business.name.replace(/\s/g, "")}-${quote.number}.png`);
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo dibujar la cotización") });
    }
  });

  router.post("/catalog/compare-pdf", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = CompareSchema.parse(req.body);
      const products = resolveCatalogProducts(input.items.map(({ id }) => id));
      const pdf = await renderComparisonPdf(products);
      res
        .status(200)
        .type("application/pdf")
        .setHeader(
          "Content-Disposition",
          `attachment; filename="Comparativa-${business.name.replace(/\s/g, "")}.pdf"`,
        )
        .send(pdf);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo generar la comparativa";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/catalog/quote-message", async (req, res) => {
    try {
      await ensureCatalogReady();
      const input = QuoteSchema.parse(req.body);
      const [selection] = resolveCatalogSelections([input.item]);
      res.json({
        ok: true,
        message: buildSingleQuoteMessageDetallado(selection, input.customerName),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cotización inválida";
      res.status(400).json({ ok: false, error: message });
    }
  });

  /** La cotización que arma el panel (Cotizador y chat): un producto, una cantidad, su PDF. */
  async function cotizacionDelPanel(body: unknown) {
      await ensureCatalogReady();
      const input = QuoteSchema.parse(body);
      const [selection] = resolveCatalogSelections([input.item]);
      const { product, quantity } = selection;
      const warranty = warrantyForBrand(product.brand);
      const quote = buildQuote(
        [
          {
          code: product.code,
          description: `${product.brand} ${product.design} ${product.sizeLabel ?? product.name}`,
          quantity,
            unitPrice: product.minimumPriceWithTax / (1 + product.taxRate),
            brand: product.brand,
            design: product.design,
            sizeLabel: product.sizeLabel,
            listPriceWithTax: product.customerPriceWithTax,
            salePriceWithTax: product.minimumPriceWithTax,
            availability: product.availability,
            imageUrl: product.imageUrl,
            loadSpeed: product.loadSpeed,
            warrantyFactory: warranty.factory,
            warrantyRoadHazard: warranty.roadHazard,
          },
        ],
        input.customerName,
        input.customerPhone,
      );
      // La misma pieza que manda el bot (22-nov-2026): el PDF clásico de pdfmake
      // era el «formato viejo» que les llegaba a los clientes desde el panel.
      // El PDF ahora es esa imagen en una página; el pdfmake queda solo si el
      // render falla.
      let png: Buffer | null = null;
      try {
        png = await renderQuoteImage({
          number: quote.number,
          dateLabel: fechaDePieza(),
          lines: [await toRenderLine(product, quantity)],
          subtotal: quote.subtotal,
          iva: quote.tax,
          total: quote.total,
          benefits: [...await applicableBenefitTexts({ brands: [product.brand], quantity }), ...textosDeRegalos(product)],
          ...(await temaDePiezas()),
        });
      } catch (error) {
        console.error(`❌ render de la cotización ${quote.number} falló; sale el PDF clásico:`, error);
      }
      const pdf = png ? await pngToQuotePdf(png) : await renderQuotePdf(quote);
      const base = `Cotizacion-${business.name.replace(/\s/g, "")}-${quote.number}`;
      return { quote, png, pdf, filename: `${base}.pdf`, pngFilename: `${base}.png`, product, quantity };
  }

  router.post("/catalog/quote-pdf", async (req, res) => {
    try {
      const { pdf, filename } = await cotizacionDelPanel(req.body);
      res
        .status(200)
        .type("application/pdf")
        .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
        .send(pdf);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo generar la cotización";
      res.status(400).json({ ok: false, error: message });
    }
  });

  // ── Catálogo y facturas por archivo (R-22, R-26) ────────────────────────────
  // El archivo llega CRUDO (octet-stream, nombre en ?nombre=): el express.json()
  // del router corta en 100 kB y un inventario de Fénix pesa más. El parser va
  // a nivel de ruta para no cambiar el límite del resto del panel.
  const archivoCrudo = express.raw({ type: "*/*", limit: "5mb" });
  const nombreDelArchivo = (req: express.Request) =>
    String(req.query.nombre ?? "").trim().slice(0, 200) || "archivo.csv";
  const cuerpoDelArchivo = (req: express.Request): Buffer | null =>
    Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : null;

  // La tarjeta «Inventario de hoy»: `porArchivo` dice si este negocio carga el
  // inventario por archivo (sin Contífico). Depot (Contífico) recibe false y
  // el panel no le muestra nada nuevo.
  router.get("/catalog/archivo", async (_req, res) => {
    const porArchivo = !config.contifico && (!config.catalog || (await hayCatalogoArchivo()));
    res.json({ ok: true, porArchivo, archivo: await estadoCatalogoArchivo(), catalog: catalogStatus() });
  });

  router.post("/catalog/import", archivoCrudo, async (req, res) => {
    const cuerpo = cuerpoDelArchivo(req);
    if (!cuerpo) return res.status(400).json({ ok: false, error: "Falta el archivo (cuerpo vacío)" });
    try {
      // El bot lo usa SIN reinicio: la fuente se decide en esta misma sincronización.
      // Un archivo dudoso (cae mucho, es más viejo) vuelve 409 y se sube otra
      // vez con ?confirmar=1; uno malo vuelve 400. En los dos casos el
      // catálogo anterior sigue vivo.
      const confirmar = req.query.confirmar === "1" || req.query.confirmar === "true";
      res.json({ ok: true, ...(await importarCatalogoYSincronizar(nombreDelArchivo(req), cuerpo, { confirmar })) });
    } catch (error) {
      const confirmable = error instanceof CargaRechazada && error.confirmable;
      res.status(confirmable ? 409 : 400).json({
        ok: false,
        necesitaConfirmacion: confirmable,
        error: error instanceof Error ? error.message : "No se pudo importar el catálogo",
      });
    }
  });

  router.get("/catalog/mapeo", async (_req, res) => {
    res.json({ ok: true, mapeo: await leerMapeoCatalogo() });
  });

  router.put("/catalog/mapeo", async (req, res) => {
    try {
      res.json({ ok: true, mapeo: await guardarMapeoCatalogo(req.body?.mapeo ?? req.body) });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Mapeo inválido" });
    }
  });

  // ── Promociones que el negocio arma solo (pestaña «Promociones», 24-nov-2026) ──
  // Elegir tipo → bajar el Excel con el stock y el precio de hoy → llenarlo →
  // subirlo (se ve cómo queda cada llanta ANTES de guardar) → guardar. Las
  // cuentas viven en `domain/promociones.ts`. Cambian el precio que cotiza el
  // bot, así que las maneja quien puede entrar a Ajustes.
  const exigirPromociones = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    if (!req.usuario || req.usuario.rol === "admin" || permisosDeUsuario(req.usuario.id).verAjustes) {
      next();
      return;
    }
    res.status(403).json({ ok: false, error: "Su usuario no tiene permiso para manejar promociones (Ajustes → Usuarios)." });
  };
  /** Lo que se subió y todavía no se guardó: el panel manda de vuelta solo la llave. */
  const subidasDePromocion = new Map<string, { tipo: TipoDePromocion; filas: FilaDePromocion[]; en: number }>();
  const guardarSubida = (tipo: TipoDePromocion, filas: FilaDePromocion[]): string => {
    const ahora = Date.now();
    for (const [k, v] of subidasDePromocion) if (ahora - v.en > 2 * 60 * 60_000) subidasDePromocion.delete(k);
    const llave = randomBytes(12).toString("hex");
    subidasDePromocion.set(llave, { tipo, filas, en: ahora });
    return llave;
  };
  const tipoDelPedido = (v: unknown): TipoDePromocion | null =>
    (TIPOS_DE_PROMOCION as readonly string[]).includes(String(v)) ? (String(v) as TipoDePromocion) : null;
  const jsonDelPedido = (v: unknown): Record<string, unknown> => {
    try { return v ? (JSON.parse(String(v)) as Record<string, unknown>) : {}; } catch { return {}; }
  };
  const errorDePromocion = (res: express.Response, error: unknown) =>
    res.status(error instanceof PromocionInvalida ? 400 : 500).json({
      ok: false,
      error: error instanceof PromocionInvalida ? error.message : "No se pudo completar. Intente de nuevo.",
    });
  /** Tras un cambio: el catálogo se vuelve a armar ya, para que el bot cotice con la promo al momento. */
  const reaplicarPromociones = async () => {
    await syncCatalog().catch((error) => console.warn("⚠️ No se pudo rearmar el catálogo tras cambiar una promoción:", error instanceof Error ? error.message : error));
  };

  router.get("/promociones", exigirPromociones, async (_req, res) => {
    try {
      await ensureCatalogReady().catch(() => undefined);
      const { items, bases } = catalogoParaPromociones();
      const promociones = (await listarPromociones()).map((p) => paraElPanel(p, items, bases));
      res.json({ ok: true, tipos: TIPOS_PARA_EL_PANEL, promociones, llantasEnInventario: items.length });
    } catch (error) {
      errorDePromocion(res, error);
    }
  });

  router.get("/promociones/excel", exigirPromociones, async (req, res) => {
    try {
      await ensureCatalogReady();
      const { items, bases } = catalogoParaPromociones();
      const guardada = req.query.id ? await leerPromocion(Number(req.query.id)) : null;
      const tipo = guardada?.tipo ?? tipoDelPedido(req.query.tipo);
      if (!tipo) return res.status(400).json({ ok: false, error: "Elija un tipo de promoción." });
      if (!items.length) return res.status(409).json({ ok: false, error: "Todavía no hay inventario cargado: suba primero el inventario." });
      const nombre = guardada?.nombre ?? (String(req.query.nombre ?? "").trim().slice(0, 40) || null);
      const excel = await excelDePromocion({ tipo, nombre, filas: guardada?.filas, items, bases });
      const archivo = `Promocion-${(nombre ?? tipoParaElPanel(tipo).nombre).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "AutoVenta"}.xlsx`;
      res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").attachment(archivo).send(excel);
    } catch (error) {
      errorDePromocion(res, error);
    }
  });

  router.post("/promociones/leer", exigirPromociones, archivoCrudo, async (req, res) => {
    const cuerpo = cuerpoDelArchivo(req);
    if (!cuerpo) return res.status(400).json({ ok: false, error: "Falta el archivo (cuerpo vacío)" });
    try {
      const tipo = tipoDelPedido(req.query.tipo);
      if (!tipo) throw new PromocionInvalida("Elija un tipo de promoción.");
      const parametros = parametrosLimpios(tipo, jsonDelPedido(req.query.parametros) as never);
      const problema = errorDeParametros(tipo, parametros);
      if (problema) throw new PromocionInvalida(problema);
      await ensureCatalogReady();
      const { items, bases } = catalogoParaPromociones();
      const leido = await leerExcelDePromocion(tipo, nombreDelArchivo(req), cuerpo);
      const vista = vistaPreviaDe(tipo, parametros, leido.filas, items, bases);
      const entran = new Set(vista.entran.map((l) => l.codigo.trim().toLowerCase()));
      // Se guardan solo las que entran hoy: lo que el negocio vio es lo que queda.
      const filas: FilaDePromocion[] = leido.filas
        .filter((f) => entran.has(f.codigo.trim().toLowerCase()))
        .map(({ filaDelExcel: _f, ...resto }) => { void _f; return resto; });
      res.json({
        ok: true,
        subida: filas.length ? guardarSubida(tipo, filas) : null,
        entran: vista.entran,
        noEntran: [...leido.ilegibles.map((i) => ({ fila: i.fila, codigo: i.codigo, nombre: null, motivo: i.motivo })), ...vista.noEntran],
        sinLlenar: leido.sinLlenar,
      });
    } catch (error) {
      errorDePromocion(res, error);
    }
  });

  router.get("/promociones/:id", exigirPromociones, async (req, res) => {
    try {
      const promo = await leerPromocion(Number(req.params.id));
      if (!promo) return res.status(404).json({ ok: false, error: "Esa promoción ya no existe." });
      await ensureCatalogReady().catch(() => undefined);
      const { items, bases } = catalogoParaPromociones();
      const vista = vistaPreviaDe(promo.tipo, promo.parametros, promo.filas, items, bases);
      res.json({ ok: true, promocion: paraElPanel(promo, items, bases), entran: vista.entran, noEntran: vista.noEntran });
    } catch (error) {
      errorDePromocion(res, error);
    }
  });

  router.post("/promociones", exigirPromociones, async (req, res) => {
    try {
      const subida = subidasDePromocion.get(String(req.body?.subida ?? ""));
      if (!subida) throw new PromocionInvalida("Suba el Excel lleno antes de guardar (la subida anterior ya caducó).");
      if (subida.tipo !== req.body?.tipo) throw new PromocionInvalida("El Excel subido es de otro tipo de promoción.");
      const promo = await crearPromocion(req.body, subida.filas, req.usuario?.nombre ?? null);
      subidasDePromocion.delete(String(req.body.subida));
      await reaplicarPromociones();
      const { items, bases } = catalogoParaPromociones();
      res.json({ ok: true, promocion: paraElPanel(promo, items, bases) });
    } catch (error) {
      errorDePromocion(res, error);
    }
  });

  router.patch("/promociones/:id", exigirPromociones, async (req, res) => {
    try {
      const cuerpo = (req.body ?? {}) as Record<string, unknown>;
      const cambios: Parameters<typeof actualizarPromocion>[1] = {};
      if (typeof cuerpo.nombre === "string") cambios.nombre = cuerpo.nombre;
      if ("textoExtra" in cuerpo) cambios.textoExtra = cuerpo.textoExtra as string | null;
      if ("desde" in cuerpo) cambios.desde = (cuerpo.desde as string | null) || null;
      if ("hasta" in cuerpo) cambios.hasta = (cuerpo.hasta as string | null) || null;
      if (typeof cuerpo.activa === "boolean") cambios.activa = cuerpo.activa;
      if (cuerpo.parametros && typeof cuerpo.parametros === "object") cambios.parametros = cuerpo.parametros as never;
      if (cuerpo.subida) {
        const actual = await leerPromocion(Number(req.params.id));
        const subida = subidasDePromocion.get(String(cuerpo.subida));
        if (!subida) throw new PromocionInvalida("La subida ya caducó: suba el Excel otra vez.");
        if (actual && subida.tipo !== actual.tipo) throw new PromocionInvalida("El Excel subido es de otro tipo de promoción.");
        cambios.filas = subida.filas;
      }
      const promo = await actualizarPromocion(Number(req.params.id), cambios);
      if (cuerpo.subida) subidasDePromocion.delete(String(cuerpo.subida));
      await reaplicarPromociones();
      const { items, bases } = catalogoParaPromociones();
      res.json({ ok: true, promocion: paraElPanel(promo, items, bases) });
    } catch (error) {
      errorDePromocion(res, error);
    }
  });

  router.delete("/promociones/:id", exigirPromociones, async (req, res) => {
    try {
      const quitada = await archivarPromocion(Number(req.params.id));
      if (!quitada) return res.status(404).json({ ok: false, error: "Esa promoción ya no existe." });
      await reaplicarPromociones();
      res.json({ ok: true });
    } catch (error) {
      errorDePromocion(res, error);
    }
  });

  // Ventas que los vendedores registran a mano en /venta, y el enlace que se les pasa.
  router.get("/ventas-registradas", async (req, res) => {
    const ventas = await listarVentasRegistradas();
    if (req.query.formato === "csv") {
      res.type("text/csv").attachment("ventas-registradas.csv").send(ventasACsv(ventas));
      return;
    }
    res.json({ ok: true, enlace: `/venta?k=${claveDelEnlace()}`, enlaceRegistros: `/venta/registros?k=${claveDeRegistros()}`, ventas });
  });

  router.get("/ventas/archivo", async (_req, res) => {
    res.json({ ok: true, estado: await estadoFacturasImportadas() });
  });

  router.post("/ventas/import", archivoCrudo, async (req, res) => {
    const cuerpo = cuerpoDelArchivo(req);
    if (!cuerpo) return res.status(400).json({ ok: false, error: "Falta el archivo (cuerpo vacío)" });
    try {
      res.json({ ok: true, ...(await importarFacturasYSincronizar(nombreDelArchivo(req), cuerpo)) });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "No se pudieron importar las facturas" });
    }
  });

  router.get("/ventas/mapeo", async (_req, res) => {
    res.json({ ok: true, mapeo: await leerMapeoFacturas() });
  });

  router.put("/ventas/mapeo", async (req, res) => {
    try {
      res.json({ ok: true, mapeo: await guardarMapeoFacturas(req.body?.mapeo ?? req.body) });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Mapeo inválido" });
    }
  });

  // ── Mensajes ────────────────────────────────────────────────────────────────
  router.get("/conversations", async (_req, res) => {
    const rows = await sql`
      select c.id, c.phone, c.name, c.stage, c.bot_paused_until,
             m.content as last_message, m.role as last_role, m.created_at as last_at
      from conversations c
      left join lateral (
        select content, role, created_at
        from messages
        where conversation_id = c.id
        order by created_at desc
        limit 1
      ) m on true
      order by coalesce(m.created_at, c.updated_at) desc
      limit 100
    `;
    res.json({ ok: true, conversations: rows });
  });

  router.get("/conversations/:id/messages", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "id inválido" });
    const rows = await sql`
      select id, role, content, created_at
      from messages
      where conversation_id = ${id} and role in ('user', 'assistant')
      order by created_at asc
      limit 500
    `;
    res.json({ ok: true, messages: rows });
  });

  // Envío manual del dueño: manda por Meta, guarda en el historial y silencia
  // al bot (mismo handoff que cuando responde desde su celular).
  router.post("/conversations/:id/send", async (req, res) => {
    const id = Number(req.params.id);
    const text = String(req.body?.text ?? "").trim();
    if (!Number.isInteger(id) || !text) {
      return res.status(400).json({ ok: false, error: "Falta el mensaje" });
    }
    const [conversation] = await sql<{ id: number; phone: string }[]>`
      select id, phone from conversations where id = ${id}
    `;
    if (!conversation) return res.status(404).json({ ok: false, error: "Conversación no encontrada" });

    const decision = await authorizeConversationOutbound({
      conversationId: id,
      contentType: "text",
      actor: "owner",
    });
    if (!decision.allowed) {
      return res.status(409).json({
        ok: false,
        error: decision.code === "window_closed"
          ? VENTANA_CERRADA
          : `Envío bloqueado por seguridad: ${decision.code}`,
        policyCode: decision.code,
        windowClosesAt: decision.windowClosesAt?.toISOString() ?? null,
      });
    }

    const antes = await fotoDelTicket(id);
    const sent = await sendTextDetailed(conversation.phone, text);
    if (!sent.ok) return res.status(sent.status).json(sent);

    // Quién escribió: se GUARDA (el WhatsApp del teléfono no lo dice; solo el panel lo sabe), no se muestra.
    const autor = quienEnElPanel(req);
    await appendMessage(id, "assistant", text, sent.id, {
      authorKind: "owner",
      status: "sent",
      metadata: { autor },
    });
    await registrarAccion(id, "mensaje", autor, { texto: text.slice(0, 120) }, antes);
    await captureManualDiscount(id, text, sent.id);
    await pauseBot(id, undefined, "persona_escribio");
    await setConversationAssignee(id, "human", "persona_escribio");
    emitLiveEvent("message", id);
    emitLiveEvent("sync", id);
    res.json({ ok: true, id: sent.id, botPausadoHoras: config.pipeline.botPauseHours });
  });

  // ── Adjuntos desde el chat del panel (22-nov-2026) ────────────────────────
  // El «+» del chat en el teléfono: una foto del carrete o una cotización en
  // PDF, sin salir de la conversación. Misma política que el texto del asesor
  // (ventana de 24 h, opt-out) y el mismo traspaso: quien adjunta, atiende.
  async function conversacionParaAdjuntar(req: express.Request, res: express.Response, contentType: "image" | "pdf") {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ ok: false, error: "Conversación inválida" });
      return null;
    }
    const [conversation] = await sql<{ id: number; phone: string; name: string | null }[]>`
      select id, phone, name from conversations where id = ${id}
    `;
    if (!conversation) {
      res.status(404).json({ ok: false, error: "Conversación no encontrada" });
      return null;
    }
    const decision = await authorizeConversationOutbound({ conversationId: id, contentType, actor: "owner" });
    if (!decision.allowed) {
      res.status(409).json({
        ok: false,
        error: decision.code === "window_closed"
          ? VENTANA_CERRADA
          : `Envío bloqueado por seguridad: ${decision.code}`,
        policyCode: decision.code,
      });
      return null;
    }
    return conversation;
  }

  async function trasAdjuntar(req: express.Request, id: number, detalle: Record<string, unknown>) {
    await pauseBot(id, undefined, "persona_escribio");
    await setConversationAssignee(id, "human", "persona_escribio");
    await registrarAccion(id, "mensaje", quienEnElPanel(req), detalle);
    emitLiveEvent("message", id);
    emitLiveEvent("sync", id);
  }

  // La foto llega ya achicada por el panel (JPEG ≤ 1600 px) más una miniatura
  // para pintarla en el chat: la imagen se sube a Meta y no se guarda acá.
  // Tipo propio: el `express.json()` general del panel corta en 100 kB y solo mira
  // `application/json`, así que la foto pasa de largo y la lee este, con su tope.
  const fotoEnJson = express.json({ limit: "6mb", type: "application/vnd.autoventa.foto+json" });
  router.post("/conversations/:id/send-image", fotoEnJson, async (req, res) => {
    try {
      const conversation = await conversacionParaAdjuntar(req, res, "image");
      if (!conversation) return;
      const imagen = miniaturaABuffer(req.body?.imagen);
      const miniatura = String(req.body?.miniatura ?? "");
      if (!imagen || imagen.length > 4_500_000) {
        return res.status(400).json({ ok: false, error: "La foto no se pudo leer o pesa demasiado." });
      }
      const caption = String(req.body?.caption ?? "").trim().slice(0, 900) || undefined;
      const providerId = await sendImage(conversation.id, conversation.phone, imagen, caption, "foto.jpg", "owner", "image/jpeg");
      await appendMessage(conversation.id, "assistant", caption ? `Foto: ${caption}` : "Foto enviada", providerId, {
        type: "image",
        authorKind: "owner",
        status: "sent",
        metadata: {
          autor: quienEnElPanel(req),
          adjunto: "foto",
          ...(miniaturaABuffer(miniatura) && miniatura.length < 400_000 ? { miniatura } : {}),
        },
      });
      // La foto entera, para ampliarla en el chat (antes solo quedaba la miniatura).
      if (providerId) {
        await guardarMedio({ waMessageId: providerId, conversationId: conversation.id, kind: "image", mime: "image/jpeg", filename: "foto.jpg", bytes: imagen });
      }
      await trasAdjuntar(req, conversation.id, { adjunto: "foto" });
      res.json({ ok: true, id: providerId ?? null });
    } catch (error) {
      console.error("❌ send-image:", error);
      res.status(502).json({ ok: false, error: mensaje(error, "No se pudo enviar la foto") });
    }
  });

  // «Opciones» y «Comparación» desde el «+» del chat (22-nov-2026, tarde): la
  // misma pieza que dibuja el Cotizador, pero se le manda al cliente en vez de
  // descargarse. Con esto el teléfono ya no necesita la pestaña Cotizador.
  // Se guarda igual que cuando la manda el bot (`piece` + `codes`): que el
  // cliente vio esas opciones es un hecho, lo haya mandado quien lo haya mandado.
  const MAX_OPCIONES_CHAT = 4;
  const PiezaDelChatSchema = z.discriminatedUnion("piece", [
    z.object({
      piece: z.literal("options"),
      // Máximo 4 opciones por envío (Manuel, 22-nov-2026).
      items: z.array(z.object({ id: z.string().min(1).max(80) })).min(1).max(MAX_OPCIONES_CHAT),
      medidaPedida: z.string().max(40).optional(),
    }),
    z.object({
      piece: z.literal("comparison"),
      items: z.array(z.object({ id: z.string().min(1).max(80) })).min(2).max(3),
    }),
  ]);

  router.post("/conversations/:id/send-piece", async (req, res) => {
    try {
      const conversation = await conversacionParaAdjuntar(req, res, "image");
      if (!conversation) return;
      let png: Buffer;
      let products: ReturnType<typeof resolveCatalogProducts>;
      let input: z.infer<typeof PiezaDelChatSchema>;
      let sizeLabel: string | null = null;
      try {
        await ensureCatalogReady();
        input = PiezaDelChatSchema.parse(req.body);
        products = resolveCatalogProducts(input.items.map(({ id }) => id));
        const medidas = new Set(products.map((p) => p.sizeLabel).filter(Boolean));
        sizeLabel = medidas.size === 1 ? (products[0]?.sizeLabel ?? null) : null;
        const lineas = await Promise.all(products.map((p) => toRenderLine(p)));
        png = input.piece === "comparison"
          ? await renderCompareImage({ dateLabel: fechaDePieza(), sizeLabel: products[0]?.sizeLabel ?? null, products: lineas, ...(await temaDePiezas()) })
          : await renderOptionsImage({
            dateLabel: fechaDePieza(), sizeLabel,
            medidaPedida: input.medidaPedida?.trim() || null,
            products: await lineasDeOpciones(products), ...(await temaDePiezas()),
          });
      } catch (error) {
        // Un pedido mal formado (una sola llanta para comparar, más de 4 opciones)
        // se dice en cristiano, no con el detalle interno de la validación.
        const texto = error instanceof z.ZodError
          ? `Elige entre 1 y ${MAX_OPCIONES_CHAT} llantas para las opciones, o 2 o 3 para comparar.`
          : mensaje(error, "No se pudo armar la pieza");
        return res.status(400).json({ ok: false, error: texto });
      }
      const esComparacion = input.piece === "comparison";
      const nombres = products.map((p) => `${p.brand} ${p.design}`);
      const filename = `${esComparacion ? "Comparativa" : "Opciones"}-${business.name.replace(/\s/g, "")}.png`;
      const providerId = await sendImage(conversation.id, conversation.phone, png, undefined, filename, "owner");
      await appendMessage(
        conversation.id,
        "assistant",
        esComparacion ? `Comparativa enviada: ${nombres.join(" vs ")}` : `Opciones enviadas: ${nombres.join(", ")}`,
        providerId,
        {
          type: "image",
          authorKind: "owner",
          status: "sent",
          metadata: {
            autor: quienEnElPanel(req), piece: input.piece, filename, origen: "panel",
            codes: products.map((p) => p.code),
            ...(input.piece === "options" ? { sizeLabel: input.medidaPedida?.trim() || sizeLabel } : {}),
          },
        },
      );
      // La pieza ya está dibujada: queda en memoria para que el chat la abra al instante.
      if (providerId) {
        const [guardado] = await sql<{ id: number }[]>`select id from messages where wa_message_id = ${providerId}`;
        if (guardado) {
          guardarPieza(`${Number(guardado.id)}:grande`, png);
          guardarPieza(`${Number(guardado.id)}:chica`, achicarPieza(png, 560));
        }
      }
      await trasAdjuntar(req, conversation.id, { adjunto: input.piece, productos: products.map((p) => p.code) });
      res.json({ ok: true, id: providerId ?? null, productos: products.length });
    } catch (error) {
      console.error("❌ send-piece:", error);
      res.status(502).json({ ok: false, error: mensaje(error, "No se pudo enviar la pieza") });
    }
  });

  router.post("/conversations/:id/send-quote", async (req, res) => {
    try {
      // Desde el chat (teléfono o escritorio) la cotización sale SIEMPRE como
      // imagen, igual que cuando cotiza el bot (Manuel, 22-nov-2026).
      const conversation = await conversacionParaAdjuntar(req, res, "image");
      if (!conversation) return;
      let armada: Awaited<ReturnType<typeof cotizacionDelPanel>>;
      try {
        armada = await cotizacionDelPanel({
          item: req.body?.item,
          customerName: conversation.name ?? "Cliente",
          customerPhone: conversation.phone,
        });
      } catch (error) {
        return res.status(400).json({ ok: false, error: mensaje(error, "No se pudo armar la cotización") });
      }
      const { quote, png, pngFilename, product, quantity } = armada;
      if (!png) {
        return res.status(502).json({ ok: false, error: "No se pudo dibujar la imagen de la cotización. Intente de nuevo." });
      }
      const filename = pngFilename;
      const providerId = await sendImage(conversation.id, conversation.phone, png, "Su cotización 🏁", filename, "owner");
      // Igual que cuando cotiza el bot: queda en `quotes` (cuenta en Métricas y
      // el chat puede volver a dibujar la pieza desde ahí).
      await logQuote(conversation.id, quote.lines, quote.subtotal, quote.tax, quote.total, quote.number);
      await appendMessage(
        conversation.id,
        "assistant",
        `Cotización ${quote.number} enviada por $${quote.total.toFixed(2)} · ${quantity} × ${product.brand} ${product.design}`,
        providerId,
        {
          type: "image",
          authorKind: "owner",
          status: "sent",
          metadata: { autor: quienEnElPanel(req), piece: "quote", filename, quoteNumber: quote.number, codes: [product.code], quantity, origen: "panel" },
        },
      );
      // La pieza ya está dibujada: queda en memoria para que el chat la abra al instante.
      if (providerId) {
        const [guardado] = await sql<{ id: number }[]>`select id from messages where wa_message_id = ${providerId}`;
        if (guardado) {
          guardarPieza(`${Number(guardado.id)}:grande`, png);
          guardarPieza(`${Number(guardado.id)}:chica`, achicarPieza(png, 560));
        }
      }
      await trasAdjuntar(req, conversation.id, { adjunto: "cotizacion", cotizacion: quote.number, total: quote.total });
      res.json({ ok: true, id: providerId ?? null, numero: quote.number, total: quote.total });
    } catch (error) {
      console.error("❌ send-quote:", error);
      res.status(502).json({ ok: false, error: mensaje(error, "No se pudo enviar la cotización") });
    }
  });

  // ── «Retomar la venta»: la plantilla que sí sale con la ventana cerrada ──
  // (22-nov-2026). Manuel: «que tengamos una plantilla aprobada simple que
  // podamos mandar ahí». Texto fijo aprobado por Meta en cada WABA
  // (`retomar_venta_v1`, ver docs/cliente-nuevo/PLANTILLAS.md) con dos botones:
  // «Sí, continuar» y «Ya no las necesito» (no «No, gracias»: para el bot eso
  // significa «quiero otra opción», no «ya no quiero»).
  router.post("/conversations/:id/send-retomar", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "Conversación inválida" });
    const [conversation] = await sql<{ id: number; phone: string; name: string | null }[]>`
      select id, phone, name from conversations where id = ${id}
    `;
    if (!conversation) return res.status(404).json({ ok: false, error: "Conversación no encontrada" });
    const decision = await authorizeConversationOutbound({ conversationId: id, contentType: "template", actor: "owner" });
    if (!decision.allowed) {
      const motivo: Record<string, string> = {
        opted_out: "El cliente pidió que no le escriban: no se le puede mandar la plantilla.",
        negative_sentiment: "El cliente estaba molesto: no se le manda la plantilla. Mejor llámelo.",
        conversation_closed: "El ticket está cerrado: reábralo para escribirle.",
      };
      return res.status(409).json({ ok: false, error: motivo[decision.code] ?? `No se puede mandar la plantilla: ${decision.code}`, policyCode: decision.code });
    }
    const nombre = conversation.name?.trim().split(/\s+/)[0] || "";
    // Meta no acepta un hueco vacío: sin nombre va un saludo neutro.
    const variables = [nombre || "qué tal", nombreDelResponsable(negocio)];
    try {
      const providerId = await sendApprovedTemplate({
        conversationId: id,
        to: conversation.phone,
        templateName: PLANTILLA_RETOMAR,
        language: "es",
        variables,
        callbackData: `retomar_venta:${id}`,
        actor: "owner",
      });
      const texto = `Hola ${variables[0]}, le saluda ${variables[1]}. Quedamos pendientes con las llantas que estaba cotizando. ¿Le gustaría continuar con su compra?`;
      await appendMessage(id, "assistant", texto, providerId, {
        authorKind: "owner",
        status: "sent",
        metadata: {
          autor: quienEnElPanel(req), plantilla: PLANTILLA_RETOMAR,
          botones: [{ id: "retomar_si", titulo: "Sí, continuar" }, { id: "retomar_no", titulo: "Ya no las necesito" }],
        },
      });
      await registrarAccion(id, "mensaje", quienEnElPanel(req), { plantilla: PLANTILLA_RETOMAR });
      await pauseBot(id, undefined, "persona_escribio");
      await setConversationAssignee(id, "human", "persona_escribio");
      emitLiveEvent("message", id);
      emitLiveEvent("sync", id);
      res.json({ ok: true, id: providerId ?? null });
    } catch (error) {
      const crudo = mensaje(error, "");
      console.error("❌ send-retomar:", crudo);
      // 132001 = la plantilla no existe (o no está aprobada) en esta cuenta.
      const texto = /132001|132000|does not exist|not approved|template name/i.test(crudo)
        ? "La plantilla para retomar la venta todavía no está aprobada por Meta. Pruebe más tarde."
        : /131042|payment/i.test(crudo)
          ? "WhatsApp no envía plantillas: la cuenta no tiene método de pago."
          : `No se pudo mandar la plantilla. ${crudo}`.trim();
      res.status(502).json({ ok: false, error: texto });
    }
  });

  router.post("/conversations/:id/bot", async (req, res) => {
    const id = Number(req.params.id);
    const accion = String(req.body?.accion ?? "");
    if (!Number.isInteger(id) || !["pausar", "activar"].includes(accion)) {
      return res.status(400).json({ ok: false, error: "Acción inválida" });
    }
    const antes = await fotoDelTicket(id);
    if (accion === "pausar") {
      await pauseBot(id);
      await setConversationAssignee(id, "human");
    } else {
      await setConversationAssignee(id, "bot");
    }
    await registrarAccion(id, accion === "pausar" ? "tomar" : "devolver_al_bot", quienEnElPanel(req), {}, antes);
    emitLiveEvent("sync", id);
    res.json({ ok: true });
  });

  // ── Ajustes del negocio: piezas, promociones y marcas ───────────────────────
  //
  // Todo lo de esta sección lo edita Depot Tire desde el tab «Ajustes». Ningún
  // endpoint de aquí expone un token ni puede dejar al bot mudo.

  router.get("/pieces-config", async (_req, res) => {
    res.json({
      ok: true,
      config: await getPiecesConfig(),
      paletas: PALETTE_NAMES,
      // Las muestras salen de la misma paleta que renderiza las piezas: el
      // botón de Ajustes no puede mentir sobre el color que va a salir.
      muestras: Object.fromEntries(
        PALETTE_NAMES.map((n) => {
          const { dark, accent, gold, base } = PALETTES[n];
          return [n, [dark, accent, gold, base]];
        }),
      ),
      fuentes: PRICE_FONT_NAMES,
      // «diaNoche» es la plantilla del cliente (12-sep) y la única con modos.
      plantillas: PLANTILLA_NAMES,
      modos: MODO_NAMES,
      // Cómo se nombra la rebaja (26-oct). Con el descuento de la llanta de
      // la vista previa, Ajustes avisa si con 3x4 saldría como porcentaje.
      modosPromocion: MODOS_PROMOCION,
      // Los temas de la pieza (24-nov): los listos con su diseño, para pintar
      // las muestras y copiarlos a «personalizado».
      // «automatico» ya no se ofrece (25-nov): el panel lo muestra como Black
      // Friday mientras la promo corre y como Normal cuando no (`temaQueSeVe`).
      temas: TEMAS.filter((id) => id !== "automatico").map((id) => ({
        id, nombre: nombreDelTema(id),
        diseno: id === "ninguno" || id === "personalizado" ? null : TEMAS_LISTOS[id].diseno,
      })),
      // Medido como la vista previa (que la muestra aunque esté «solo para
      // números de prueba»): el tema marcado y la imagen de al lado dicen lo mismo.
      promoDeTemporadaVigente: await comoVistaPrevia(async () => promocionVigente(politica.promocionDeTemporada)),
      // Las paletas listas de «día y noche» (25-nov), con sus dos colores.
      coloresListos: COLORES_LISTOS,
      descuentoDeMuestra: await descuentoDeLaMuestra().catch(() => null),
    });
  });

  router.put("/pieces-config", async (req, res) => {
    try {
      res.json({ ok: true, config: await savePiecesConfig(req.body) });
    } catch {
      res.status(400).json({ ok: false, error: "Plantilla, modo, paleta, fuente, promoción o tema inválidos" });
    }
  });

  // La promo de temporada (Black Friday de Depot, nov-2026): quién la ve.
  // Las fechas y cifras son de la política; acá solo se abre o se cierra.
  router.get("/temporada", async (_req, res) => {
    const promo = politica.promocionDeTemporada ?? null;
    res.json({
      ok: true,
      config: await getTemporadaConfig(),
      modos: MODOS_TEMPORADA,
      promo: promo ? { nombre: promo.nombre, lema: promo.lema, desde: promo.desde, hasta: promo.hasta } : null,
    });
  });

  router.put("/temporada", async (req, res) => {
    try {
      res.json({ ok: true, config: await saveTemporadaConfig(req.body) });
    } catch {
      res.status(400).json({ ok: false, error: "Modo o teléfonos inválidos" });
    }
  });

  // El Ángel Guardián: interruptor + el informe con la lista documentada de
  // lo que encontró (services/guardian.ts). El interruptor es una decisión de
  // gasto del asesor, por eso vive aquí y no en una variable de entorno.
  router.get("/guardian", async (_req, res) => {
    const [config7d, informe] = await Promise.all([getGuardianConfig(), informeGuardian(7)]);
    res.json({
      ok: true,
      config: config7d,
      modelo: config.openai.guardianModel,
      semana: {
        revisiones: informe.revisiones,
        correcciones: informe.correcciones,
        hallazgos: informe.hallazgos.length,
      },
    });
  });

  router.put("/guardian", async (req, res) => {
    try {
      res.json({ ok: true, config: await saveGuardianConfig(req.body) });
    } catch {
      res.status(400).json({ ok: false, error: "Configuración inválida" });
    }
  });

  router.get("/guardian/informe", async (req, res) => {
    const dias = Math.min(90, Math.max(1, Number(req.query.dias ?? 7)));
    res.json({ ok: true, informe: await informeGuardian(dias) });
  });

  // ── Cupón de confirmación ───────────────────────────────────────────────────
  // El código que el cliente lleva a caja para reclamar su 2 % adicional y que,
  // al canjearse, dice qué cotización del bot fue venta de verdad.
  //
  // El interruptor vive aquí y NO en una variable de entorno a propósito: es una
  // decisión comercial de Depot (cuándo empezar, con qué porcentaje), y tiene
  // que poder tomarse desde Ajustes el día de la capacitación de cajeros, sin
  // esperar un deploy. Nace apagado.
  // Registro de ventas (`/venta`) visto desde el panel: el enlace de los
  // vendedores (para el botón «Registrar venta» de la ficha) y el interruptor
  // del negocio «ganado exige la venta registrada», que nace apagado.
  router.get("/hub/registro-venta", async (_req, res) => {
    const config = await getVentaRegistradaConfig();
    res.json({ ok: true, enlace: `/venta?k=${encodeURIComponent(claveDelEnlace())}`, ...config });
  });

  // ── Avisos en la app del teléfono (22-nov-2026) ───────────────────────────
  // Ver services/avisosEnLaApp.ts. La clave cruda (sin usuario) puede leer el
  // historial, pero suscribirse es de un usuario con nombre.
  router.get("/hub/avisos", async (req, res) => {
    try {
      const telefono = req.usuario ? await telefonoDelUsuario(req.usuario.id) : null;
      const avisos = await historialDeAvisos(telefono);
      res.json({
        ok: true,
        soloMios: Boolean(telefono),
        porLaApp: EVENTOS_POR_LA_APP,
        avisos: avisos.map((a) => ({
          ...a,
          titulo: cabeceraDeEvento(a.evento as AdvisorEventType).replace(/\*/g, "").trim(),
        })),
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudieron cargar los avisos") });
    }
  });

  // La ventana de 24 h del asesor que está usando la app (ver services/ventanaDelAsesor.ts).
  router.get("/hub/mi-ventana", async (req, res) => {
    try {
      res.json({ ok: true, ...(await miVentana(req.usuario ? { id: req.usuario.id, nombre: req.usuario.nombre } : null)) });
    } catch (error) {
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudo leer la ventana") });
    }
  });

  router.get("/hub/push/config", async (req, res) => {
    try {
      const { publicKey } = await clavesPush();
      const asesores = await asesoresActivos();
      res.json({
        ok: true,
        publicKey,
        miTelefono: req.usuario ? await telefonoDelUsuario(req.usuario.id) : null,
        // Para el «¿cuál eres tú?» al activar: nombre y número de cada asesor que recibe avisos.
        asesores: asesores.map((a) => ({ nombre: a.nombre, telefono: a.telefono })),
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudo preparar la app") });
    }
  });

  router.post("/hub/push/suscribir", async (req, res) => {
    if (!req.usuario) return res.status(403).json({ ok: false, error: "Entra con tu usuario para activar las notificaciones." });
    const suscripcion = leerSuscripcion(req.body?.suscripcion);
    if (!suscripcion) return res.status(400).json({ ok: false, error: "El teléfono no entregó una suscripción válida." });
    try {
      // Si el teléfono no dijo qué asesor es, lo decide el servidor por el nombre
      // (25-nov-2026: con tres «Carlos» la app mandaba vacío y no le llegaba nada).
      const telefono = req.body?.telefono
        ? String(req.body.telefono)
        : (await asesorDelUsuario({ id: req.usuario.id, nombre: req.usuario.nombre }).catch(() => null))?.telefono ?? null;
      await guardarSuscripcion({
        userId: req.usuario.id,
        userName: req.usuario.nombre,
        advisorPhone: telefono,
        suscripcion,
        userAgent: req.header("user-agent"),
      });
      // La confirmación sale por el mismo camino que los avisos de verdad.
      if (telefono) {
        await enviarPushAAsesores([telefono], {
          titulo: "Notificaciones activadas",
          cuerpo: "Desde ahora las cotizaciones enviadas y las ventas confirmadas te llegan por aquí.",
          ruta: "#/avisos",
          etiqueta: "activadas",
        });
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudo activar") });
    }
  });

  router.post("/hub/push/desuscribir", async (req, res) => {
    const endpoint = String(req.body?.endpoint ?? "");
    if (!endpoint) return res.status(400).json({ ok: false, error: "Falta la suscripción" });
    await borrarSuscripcion(endpoint);
    res.json({ ok: true });
  });

  // ── Avisos a soporte (24-nov-2026) ────────────────────────────────────────
  // «El bot no respondió» y «saldo de OpenAI bajo» le llegan a soporte de
  // AutoVenta, no al negocio. Esta parte del panel (Ajustes → Bot) es solo de
  // soporte: el saldo anotado, el umbral, los incidentes y un botón de prueba.
  // La clave cruda (sin usuario) también pasa, como en el resto del panel.
  const exigirSoporte = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    if (!req.usuario || esUsuarioDeSoporte(req.usuario.id)) {
      next();
      return;
    }
    res.status(403).json({ ok: false, error: "Esto es solo para soporte de AutoVenta." });
  };

  router.get("/hub/soporte", exigirSoporte, async (_req, res) => {
    try {
      const [incidentes, aparatos] = await Promise.all([
        estadoDeSoporte(),
        sql<{ n: number }[]>`
          select count(*)::int as n from push_subscriptions
          where user_id = any(${[...USUARIOS_DE_SOPORTE]}) and failed_count < 5
        `,
      ]);
      // El saldo va aparte: si OpenAI no contesta, el resto de la tarjeta se ve igual.
      let saldo: Awaited<ReturnType<typeof estadoDelSaldo>> = null;
      let errorDelSaldo: string | null = null;
      try {
        saldo = await estadoDelSaldo();
      } catch (error) {
        errorDelSaldo = mensaje(error, "No se pudo leer el gasto de OpenAI");
      }
      res.json({
        ok: true,
        ...incidentes,
        aparatosConLaApp: aparatos[0]?.n ?? 0,
        // Con clave de administrador el gasto es el de toda la organización;
        // sin ella se estima con lo que registró este bot.
        leeElGastoDeOpenAI: Boolean(config.openai.adminKey),
        umbralPorDefecto: UMBRAL_POR_DEFECTO_USD,
        saldo: saldo && {
          saldoUsd: saldo.anotado.saldoUsd, umbralUsd: saldo.anotado.umbralUsd,
          anotadoAt: saldo.anotado.anotadoAt.toISOString(), anotadoPor: saldo.anotado.anotadoPor,
          gastadoUsd: saldo.gastadoUsd, restanteUsd: saldo.restanteUsd,
          fuente: saldo.fuente, aproximado: saldo.aproximado, bajo: saldo.bajo,
        },
        errorDelSaldo,
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudo cargar el estado de soporte") });
    }
  });

  router.put("/hub/soporte/saldo", exigirSoporte, async (req, res) => {
    try {
      const estado = await anotarSaldo(req.body, req.usuario?.id ?? null);
      // Si ya se anotó por debajo del umbral, el aviso sale ahora y no en cinco minutos.
      void revisarSaldo();
      res.json({ ok: true, restanteUsd: estado.restanteUsd, bajo: estado.bajo, fuente: estado.fuente });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo guardar el saldo") });
    }
  });

  router.post("/hub/soporte/probar", exigirSoporte, async (_req, res) => {
    const resultado = await avisarASoporte({
      clase: "prueba",
      texto: {
        titulo: `✅ ${business.name}: prueba de aviso`,
        cuerpo: "Si lees esto, los avisos de «el bot no responde» y de saldo bajo te llegan a este teléfono.",
      },
    });
    res.json({ ok: true, ...resultado });
  });

  // ── «Validar» dentro del panel (22-nov-2026) ──────────────────────────────
  // Lo mismo que la página `/venta`, pero con la sesión del panel: el vendedor
  // es el usuario que entró (no se escribe a mano) y el permiso `validarNumeros`
  // de Ajustes → Usuarios decide quién ve la pestaña. La clave cruda (sin
  // usuario) también pasa, como en el resto del panel.
  const exigirValidar = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    if (!req.usuario || permisosDeUsuario(req.usuario.id).validarNumeros) {
      next();
      return;
    }
    res.status(403).json({ ok: false, error: "Tu usuario no tiene activada la validación de números." });
  };

  router.post("/hub/validar/numero", exigirValidar, async (req, res) => {
    const validacion = validarEntrada({ vendedor: quienEnElPanel(req), telefono: req.body?.telefono });
    if (!validacion.ok) return res.status(400).json(validacion);
    try {
      const resultado = await registrarVenta(validacion.entrada, validacion.tel9);
      emitLiveEvent("sync", resultado.venta.conversationId ?? undefined);
      res.json({ ok: true, ...resultado });
    } catch (error) {
      console.error("❌ /hub/validar/numero:", error);
      res.status(500).json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." });
    }
  });

  router.post("/hub/validar/factura", exigirValidar, async (req, res) => {
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    const llave = tel9(cuerpo.telefono);
    if (!Number.isInteger(cuerpo.id) || !llave || !String(cuerpo.factura ?? "").trim()) {
      return res.status(400).json({ ok: false, campo: "factura", error: "Escribe el número de factura o la referencia." });
    }
    if (leerMonto(cuerpo.monto) == null) {
      return res.status(400).json({ ok: false, campo: "monto", error: "Revisa el monto: escribe solo el número, por ejemplo 230.50." });
    }
    try {
      const venta = await guardarFactura(cuerpo.id as number, llave, cuerpo.factura, cuerpo.monto);
      if (!venta) return res.status(404).json({ ok: false, error: "No se encontró ese registro. Vuelve a validar el número." });
      emitLiveEvent("sync", venta.conversationId ?? undefined);
      res.json({ ok: true, venta });
    } catch (error) {
      console.error("❌ /hub/validar/factura:", error);
      res.status(500).json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." });
    }
  });

  router.post("/hub/validar/anular", exigirValidar, async (req, res) => {
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    const llave = tel9(cuerpo.telefono);
    if (!Number.isInteger(cuerpo.id) || !llave) {
      return res.status(400).json({ ok: false, error: "Falta el registro a corregir." });
    }
    try {
      const resultado = await anularRegistro(cuerpo.id as number, llave);
      if (!resultado) return res.status(404).json({ ok: false, error: "No se encontró ese registro." });
      emitLiveEvent("sync", resultado.venta.conversationId ?? undefined);
      res.json({ ok: true, ...resultado });
    } catch (error) {
      console.error("❌ /hub/validar/anular:", error);
      res.status(500).json({ ok: false, error: "No se pudo corregir. Intenta de nuevo." });
    }
  });

  router.put("/hub/registro-venta", async (req, res) => {
    try {
      const config = await saveVentaRegistradaConfig(req.body);
      emitLiveEvent("settings");
      res.json({ ok: true, enlace: `/venta?k=${encodeURIComponent(claveDelEnlace())}`, ...config });
    } catch {
      res.status(400).json({ ok: false, error: "Ajuste inválido" });
    }
  });

  router.get("/cupones", async (req, res) => {
    const dias = Math.min(365, Math.max(1, Number(req.query.dias ?? 30)));
    const [cfg, resumen] = await Promise.all([getCouponConfig(), resumenCupones(dias)]);
    res.json({ ok: true, config: cfg, resumen });
  });

  router.put("/cupones", async (req, res) => {
    try {
      res.json({ ok: true, config: await saveCouponConfig(req.body) });
    } catch {
      res.status(400).json({ ok: false, error: "Configuración de cupón inválida" });
    }
  });

  // Verificar SIN canjear: es el primer paso real en caja — comprobar que el
  // código existe y de quién es, antes de aplicar nada. Separado del canje para
  // que comprobar no queme el cupón de un cliente que todavía no pagó.
  router.get("/cupones/consulta", async (req, res) => {
    const resultado = await consultarCupon(String(req.query.codigo ?? ""));
    res.status(resultado.ok ? 200 : 404).json({ ok: resultado.ok, resultado });
  });

  // El canje, que es lo que hace en caja quien atiende. `redeemed_by` guarda el
  // usuario del login (S2) — no el asesor de WhatsApp: aquí interesa quién
  // aplicó el descuento, que es una responsabilidad de caja.
  router.post("/cupones/canje", async (req, res) => {
    const codigo = String((req.body as { codigo?: unknown })?.codigo ?? "");
    const resultado = await canjearCupon(codigo, req.usuario?.nombre ?? null);
    res.status(resultado.ok ? 200 : 409).json({ ok: resultado.ok, resultado });
  });

  router.get("/store-hours", async (_req, res) => {
    res.json({ ok: true, hours: await getStoreHours() });
  });

  router.put("/store-hours", async (req, res) => {
    try {
      res.json({ ok: true, hours: await saveStoreHours(req.body) });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Horarios inválidos" });
    }
  });

  router.get("/anuncios-activos", async (_req, res) => {
    res.json({ ok: true, anuncios: await getAnunciosActivos() });
  });

  router.put("/anuncios-activos", async (req, res) => {
    const lista = Array.isArray(req.body) ? req.body : req.body?.anuncios;
    const r = AnunciosActivosSchema.safeParse(lista);
    if (!r.success) {
      const issue = r.error.issues[0];
      const cual = typeof issue?.path?.[0] === "number" ? `Anuncio ${issue.path[0] + 1}: ` : "";
      return res.status(400).json({ ok: false, error: `${cual}${issue?.message ?? "Anuncios inválidos"}` });
    }
    try {
      res.json({ ok: true, anuncios: await saveAnunciosActivos(r.data) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "No se pudieron guardar los anuncios" });
    }
  });

  router.get("/anuncios-vistos", async (req, res) => {
    const dias = Math.min(60, Math.max(1, Number(req.query.dias) || 14));
    res.json({ ok: true, vistos: await anunciosVistos(dias) });
  });

  /**
   * Estado del barrido de precios y botón para forzarlo. Los cambios de precio
   * son raros y el proveedor avisa cuando ocurren, así que el barrido corre una
   * vez por semana y quien se entera de un cambio lo refresca desde Ajustes sin
   * esperar al miércoles.
   */
  router.get("/precios", (_req, res) => {
    const st = interbotPricesState();
    res.json({
      ok: true,
      precios: {
        fuente: st.source,
        actualizadoEn: st.at?.toISOString() ?? null,
        productos: st.productos,
        error: st.lastError,
      },
    });
  });

  router.post("/precios/sync", async (_req, res) => {
    try {
      const st = await forceSyncNow();
      res.json({
        ok: true,
        precios: {
          fuente: st.source,
          actualizadoEn: st.at?.toISOString() ?? null,
          productos: st.productos,
          error: null,
        },
      });
    } catch (error) {
      res.status(502).json({
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo actualizar los precios",
      });
    }
  });

  router.get("/benefits", async (_req, res) => {
    res.json({ ok: true, benefits: await listBenefits() });
  });

  router.post("/benefits", async (req, res) => {
    try {
      res.json({ ok: true, benefit: await createBenefit(req.body) });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo crear el beneficio") });
    }
  });

  router.put("/benefits/:id", async (req, res) => {
    try {
      res.json({ ok: true, benefit: await updateBenefit(Number(req.params.id), req.body) });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo guardar el beneficio") });
    }
  });

  router.delete("/benefits/:id", async (req, res) => {
    await deleteBenefit(Number(req.params.id));
    res.json({ ok: true });
  });

  router.get("/advisors", async (_req, res) => {
    const asesores = await sql<
      { id: number; nombre: string; telefono: string; prioridad: number; active: boolean; rol: string }[]
    >`select id, nombre, telefono, prioridad, active, rol from advisors order by prioridad, id`;
    res.json({ ok: true, asesores });
  });

  /**
   * Un rol que no existe dejaría al asesor sin ningún aviso —el filtro no lo
   * reconocería ni como admin ni como asesor— y nadie se enteraría hasta que un
   * cliente se quedara sin atender. Se rechaza aquí, con nombre y apellido, en
   * vez de dejar que reviente el check de la base con un error de Postgres.
   */
  const rolPedido = async (valor: unknown): Promise<string | null> => {
    if (valor === undefined || valor === null || valor === "") return null;
    const niveles = await getNivelesAviso();
    if (typeof valor !== "string" || !niveles.some((n) => n.id === valor)) {
      throw new Error(`Ese nivel no existe. Los niveles son: ${niveles.map((n) => n.nombre).join(", ")}`);
    }
    return valor;
  };

  router.post("/advisors", async (req, res) => {
    try {
      const nombre = String(req.body?.nombre ?? "").trim();
      // Formato de la Graph API: solo dígitos, con código de país y sin "+".
      const telefono = String(req.body?.telefono ?? "").replace(/\D/g, "");
      if (!nombre || telefono.length < 8) {
        return res.status(400).json({ ok: false, error: "Hace falta nombre y un teléfono con código de país" });
      }
      // Sin nivel explícito entra al primero: el que recibe más, como el default
      // de la columna antes de que existieran los niveles.
      const rol = (await rolPedido(req.body?.rol)) ?? (await getNivelesAviso())[0].id;
      const [asesor] = await sql`
        insert into advisors (nombre, telefono, prioridad, active, rol)
        values (${nombre}, ${telefono}, ${Number(req.body?.prioridad) || 10}, true, ${rol})
        on conflict (telefono) do update set
          nombre = excluded.nombre, prioridad = excluded.prioridad,
          active = true, rol = excluded.rol, updated_at = now()
        returning id, nombre, telefono, prioridad, active, rol
      `;
      res.json({ ok: true, asesor });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo guardar el asesor") });
    }
  });

  router.patch("/advisors/:id", async (req, res) => {
    const campos = req.body ?? {};
    let rol: string | null;
    try {
      rol = await rolPedido(campos.rol);
    } catch (error) {
      return res.status(400).json({ ok: false, error: mensaje(error, "Rol inválido") });
    }
    const [asesor] = await sql`
      update advisors set
        nombre = coalesce(${campos.nombre ?? null}, nombre),
        prioridad = coalesce(${campos.prioridad ?? null}::int, prioridad),
        active = coalesce(${campos.active ?? null}::boolean, active),
        rol = coalesce(${rol}, rol),
        updated_at = now()
      where id = ${Number(req.params.id)}
      returning id, nombre, telefono, prioridad, active, rol
    `;
    if (!asesor) return res.status(404).json({ ok: false, error: "Asesor no encontrado" });
    res.json({ ok: true, asesor });
  });

  router.delete("/advisors/:id", async (req, res) => {
    await sql`delete from advisors where id = ${Number(req.params.id)}`;
    res.json({ ok: true });
  });

  // ── Asesores por local (Ajustes → Avisos, R-34) ────────────────────────────
  // Qué asesores atienden cada local: con asignación, los avisos de una
  // conversación con local elegido van solo a ellos. Leerlo puede cualquiera
  // del hub; cambiarlo es de administradores, como la matriz de avisos.

  router.get("/asesores-por-local", async (_req, res) => {
    res.json({ ok: true, asignaciones: await getAsesoresPorLocal(), locales: localesAsignables() });
  });

  router.put("/asesores-por-local", exigirNivelMaximo, async (req, res) => {
    try {
      const asignaciones = await saveAsesoresPorLocal(req.body?.asignaciones ?? req.body);
      res.json({ ok: true, asignaciones, locales: localesAsignables() });
    } catch (error) {
      const texto = error instanceof Error && "issues" in error
        ? ((error as { issues: Array<{ message: string }> }).issues[0]?.message ?? "Asignaciones inválidas")
        : mensaje(error, "No se pudieron guardar los asesores por local");
      res.status(400).json({ ok: false, error: texto });
    }
  });

  // ── Niveles de aviso (Ajustes → Avisos) ────────────────────────────────────
  // Qué aviso recibe cada nivel, uno por uno, y el catálogo con sus nombres
  // para que el panel no tenga que copiarlo: un aviso nuevo aparece solo.
  // Leerlo puede cualquiera del hub; cambiarlo es de administradores.

  const catalogoPorCategoria = () => CATEGORIAS_AVISO.map((c) => ({
    id: c,
    nombre: NOMBRE_DE_CATEGORIA[c],
    eventos: EVENTOS_AVISO.filter((e) => CATEGORIA_DE_EVENTO[e] === c).map((e) => ({ id: e, nombre: NOMBRE_DE_EVENTO[e] })),
  }));

  router.get("/aviso-niveles", async (_req, res) => {
    res.json({ ok: true, niveles: await getNivelesAviso(), catalogo: catalogoPorCategoria(), generales: AVISOS_GENERALES.map((g) => ({ id: g, nombre: NOMBRE_DE_AVISO_GENERAL[g] })), avisos: catalogoDeAvisos().avisos });
  });

  // El aviso de la mañana a los asesores (19-nov-2026): una plantilla con el
  // botón «Listo» que deja abierta su ventana de 24 h. Ver avisoDeLaManana.ts.
  router.get("/aviso-manana", async (_req, res) => {
    const [config, resultado] = await Promise.all([getAvisoManana(), ultimoResultadoAvisoManana()]);
    let enMeta: { status: string; category: string } | null = null;
    let errorMeta: string | null = null;
    try {
      const plantilla = (await listarPlantillasDeMeta()).find((p) => p.name === config.plantilla);
      enMeta = plantilla ? { status: plantilla.status, category: plantilla.category } : null;
    } catch (error) {
      errorMeta = mensaje(error, "No se pudo leer Meta");
    }
    res.json({ ok: true, config, resultado, enMeta, errorMeta });
  });

  router.put("/aviso-manana", exigirNivelMaximo, async (req, res) => {
    try {
      res.json({ ok: true, config: await saveAvisoManana(req.body) });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "Ajuste inválido") });
    }
  });

  router.post("/aviso-manana/enviar", exigirNivelMaximo, async (_req, res) => {
    try {
      res.json({ ok: true, resultado: await enviarAvisoDeLaManana({ forzar: true }) });
    } catch (error) {
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudo enviar") });
    }
  });

  router.put("/aviso-niveles", exigirNivelMaximo, async (req, res) => {
    try {
      res.json({ ok: true, niveles: await saveNivelesAviso(req.body?.niveles ?? req.body), catalogo: catalogoPorCategoria(), generales: AVISOS_GENERALES.map((g) => ({ id: g, nombre: NOMBRE_DE_AVISO_GENERAL[g] })), avisos: catalogoDeAvisos().avisos });
    } catch (error) {
      const texto = error instanceof Error && "issues" in error
        ? ((error as { issues: Array<{ message: string }> }).issues[0]?.message ?? "Niveles inválidos")
        : mensaje(error, "No se pudieron guardar los niveles");
      res.status(400).json({ ok: false, error: texto });
    }
  });

  // ── Usuarios del hub (Ajustes → Usuarios) ──────────────────────────────────
  // Distinto de /advisors a propósito: esto es QUIÉN ENTRA AL DASHBOARD y qué
  // pantallas ve; /advisors es qué teléfono recibe avisos por WhatsApp.

  /** Lo que ve el panel: nunca el hash, sí el estado de la clave y el email. */
  const usuarioParaPanel = (
    { pinHash: _hash, claveCompartida: _c, invitacionHash: _inv, ...resto }: UsuarioHub & { invitacion?: string },
    completo: UsuarioHub,
  ) => {
    const { invitacion: _codigo, ...sinCodigo } = resto;
    return { ...sinCodigo, estadoClave: estadoClave(completo), invitacionVigente: Boolean(completo.invitacionHash) };
  };

  router.get("/hub-users", exigirNivelMaximo, (_req, res) => {
    res.json({ ok: true, usuarios: usuariosHub().map((u) => usuarioParaPanel(u, u)) });
  });

  router.post("/hub-users", exigirNivelMaximo, async (req, res) => {
    try {
      const usuario = await crearUsuarioHub(req.body);
      // El código va UNA vez, fuera del objeto del usuario: el panel arma el
      // enlace y se lo muestra a quien lo creó.
      res.json({ ok: true, usuario: usuarioParaPanel(usuario, usuario), ...(usuario.invitacion ? { invitacion: usuario.invitacion } : {}) });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo crear el usuario") });
    }
  });

  router.patch("/hub-users/:id", exigirNivelMaximo, async (req, res) => {
    try {
      const usuario = await actualizarUsuarioHub(String(req.params.id), req.body);
      res.json({ ok: true, usuario: usuarioParaPanel(usuario, usuario) });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo guardar el usuario") });
    }
  });

  /** «Se me olvidó la clave»: la cuenta vuelve a pendiente y la crea de nuevo. */
  router.post("/hub-users/:id/reset-clave", exigirNivelMaximo, async (req, res) => {
    try {
      const usuario = await restablecerClaveHub(String(req.params.id));
      res.json({ ok: true, usuario: usuarioParaPanel(usuario, usuario), invitacion: usuario.invitacion });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo restablecer la clave") });
    }
  });

  /** Otro enlace de invitación para una cuenta pendiente; el anterior deja de servir. */
  router.post("/hub-users/:id/invitacion", exigirNivelMaximo, async (req, res) => {
    try {
      const usuario = await nuevaInvitacionHub(String(req.params.id));
      res.json({ ok: true, usuario: usuarioParaPanel(usuario, usuario), invitacion: usuario.invitacion });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo crear el enlace") });
    }
  });

  router.delete("/hub-users/:id", exigirNivelMaximo, async (req, res) => {
    try {
      await borrarUsuarioHub(String(req.params.id));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo borrar el usuario") });
    }
  });

  router.get("/brand-profiles", async (_req, res) => {
    res.json({ ok: true, profiles: await listBrandProfiles() });
  });

  router.put("/brand-profiles/:brand", async (req, res) => {
    try {
      const profile = await saveBrandProfile({ ...req.body, brand: req.params.brand });
      res.json({ ok: true, profile });
    } catch (error) {
      res.status(400).json({ ok: false, error: mensaje(error, "No se pudo guardar la marca") });
    }
  });

  router.delete("/brand-profiles/:brand", async (req, res) => {
    await deleteBrandProfile(req.params.brand);
    res.json({ ok: true });
  });

  /**
   * Vista previa en vivo de una pieza. Renderiza con lo que venga en la query,
   * no con lo guardado: así el negocio ve el cambio antes de aplicarlo, que es
   * lo que exige el §20 del PDF.
   *
   * Usa el catálogo real cuando hay; si no, un ejemplo, para que la pantalla de
   * ajustes funcione aunque Contífico esté caído.
   */
  router.get("/pieces/preview.png", async (req, res) => {
    try {
      const pieza = String(req.query.pieza ?? "cotizacion");
      const paleta = req.query.paleta ? String(req.query.paleta) : undefined;
      const fuente = req.query.fuente ? String(req.query.fuente) : undefined;
      const plantilla = req.query.plantilla ? String(req.query.plantilla) : undefined;
      const modo = req.query.modo ? String(req.query.modo) : undefined;
      const promocion = req.query.promocion ? String(req.query.promocion) : undefined;
      // El tema llega como JSON ({ id, personalizado }); lo limpia `cintaDelTema` al dibujar.
      const tema = req.query.tema ? jsonDelPedido(req.query.tema) as never : undefined;
      const colores = req.query.colores ? jsonDelPedido(req.query.colores) as never : undefined;
      const beneficios = req.query.beneficios
        ? String(req.query.beneficios).split("|").map((b) => b.trim()).filter(Boolean)
        // La vista previa dibuja un juego completo: con esa cantidad entran
        // también los beneficios con mínimo (alineación de Mundillantas).
        : await applicableBenefitTexts({ quantity: politica.juegoCompleto });
      // El panel pide la imagen al ancho de su recuadro: llega mucho antes (render/quoteImage.ts).
      const ancho = req.query.ancho ? Number(req.query.ancho) : undefined;
      const png = await comoVistaPrevia(() => renderPreviewPiece({ pieza, paleta, fuente, plantilla, modo, promocion, beneficios, tema, colores, ancho }));
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.send(png);
    } catch (error) {
      console.error("❌ Vista previa de pieza falló:", error);
      res.status(500).json({ ok: false, error: mensaje(error, "No se pudo renderizar la vista previa") });
    }
  });

  // ── Configuración de IA ─────────────────────────────────────────────────────
  router.get("/ai-config", async (_req, res) => {
    res.json({ ok: true, config: await getAiConfig() });
  });

  router.put("/ai-config", async (req, res) => {
    try {
      res.json({ ok: true, config: await saveAiConfig(req.body) });
    } catch {
      res.status(400).json({ ok: false, error: "Configuración inválida" });
    }
  });

  router.get("/stage-prompts", async (_req, res) => {
    res.json({ ok: true, prompts: await listStagePrompts() });
  });

  router.post("/stage-prompts/:stage/drafts", async (req, res) => {
    const stage = String(req.params.stage ?? "");
    if (!isStage(stage)) {
      return res.status(400).json({ ok: false, error: "Etapa inválida" });
    }
    try {
      const prompt = await saveStagePromptDraft(stage, req.body);
      emitLiveEvent("settings");
      res.json({ ok: true, prompt });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Prompt inválido",
      });
    }
  });

  router.post("/stage-prompts/versions/:id/publish", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "Versión inválida" });
    }
    try {
      const prompt = await publishStagePrompt(id);
      emitLiveEvent("settings");
      res.json({ ok: true, prompt });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo publicar",
      });
    }
  });

  // ── Tester ──────────────────────────────────────────────────────────────────
  router.post("/tester/send", async (req, res) => {
    const to = String(req.body?.to ?? "").replace(/\D/g, "");
    const message = String(req.body?.message ?? "").trim();
    if (!to || !message) {
      return res.status(400).json({ ok: false, error: "Escribe el número y el mensaje." });
    }
    const [conversation] = await sql<{ id: number }[]>`
      select id from conversations where phone = ${to}
    `;
    if (!conversation) {
      return res.status(409).json({
        ok: false,
        error: "Ese número no tiene una conversación entrante. El tester no puede iniciar texto libre.",
        policyCode: "no_customer_window",
      });
    }
    const decision = await authorizeConversationOutbound({
      conversationId: Number(conversation.id), contentType: "text", actor: "owner",
    });
    if (!decision.allowed) {
      return res.status(409).json({
        ok: false,
        error: "Envío bloqueado por la política de 24 h; usa una plantilla aprobada.",
        policyCode: decision.code,
      });
    }
    const sent = await sendTextDetailed(to, message);
    res.status(sent.ok ? 200 : sent.status).json(sent);
  });

  return router;
}

function resolveCatalogSelections(
  input: { id: string; quantity: number }[],
): CatalogQuoteSelection[] {
  return input.map(({ id, quantity }) => {
    const product = findById(id);
    if (!product) throw new Error(`El producto ${id} ya no está en el catálogo`);
    if (product.availability === "out") {
      throw new Error(`${product.brand} ${product.design} está agotada`);
    }
    // Promoción por cantidad (pestaña Promociones): con la cantidad en la mano
    // la llanta ya sale al precio de la promo, igual que en el bot.
    return { product: productoParaCantidad(product, quantity), quantity };
  });
}

function resolveCatalogProducts(ids: string[]) {
  if (new Set(ids).size !== ids.length) {
    throw new Error("Selecciona modelos distintos para comparar");
  }
  return ids.map((id) => {
    const product = findById(id);
    if (!product) throw new Error(`El producto ${id} ya no está en el catálogo`);
    return product;
  });
}

function publicCatalogItem(item: ReturnType<typeof searchByText>[number]) {
  const warranty = warrantyForBrand(item.brand);
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    brand: item.brand,
    design: item.design,
    sizeLabel: item.sizeLabel,
    listPrice: item.customerPriceWithTax,
    salePrice: item.minimumPriceWithTax,
    discountPercent: Math.round(
      (1 - item.minimumPriceWithTax / item.customerPriceWithTax) * 100,
    ),
    // Alias temporal para clientes anteriores.
    customerPrice: item.customerPriceWithTax,
    minimumPrice: item.minimumPriceWithTax,
    availability: item.availability,
    stock: item.stock,
    imageUrl: item.imageUrl,
    imageSource: item.imageSource,
    loadSpeed: item.loadSpeed,
    warranty,
    updatedAt: catalogStatus().lastSync,
  };
}
