import { IVA } from "../types";
import type { MockSource } from "./mockSource";

/**
 * Modo demo: clientes simulados escribiendo en vivo, con typing realista,
 * avanzando por el pipeline hasta un cierre ganado. Es el guion que se le
 * enseña a Joaquín — su negocio funcionando solo.
 */

type Paso =
  | { t: "espera"; ms: number }
  | { t: "cliente"; texto: string; tipo?: "texto" | "ubicacion"; typing?: number }
  | { t: "bot"; texto: string; tipo?: "texto" | "pdf"; typing?: number }
  | { t: "etapa"; etapa: "medidas" | "cotizado" | "ubicacion" | "por_visitar" }
  | { t: "medida"; medida: string }
  | { t: "cotizacion"; medida: string; marca: string; modelo: string; precio: number; cant?: number }
  | { t: "local"; nombre: string; direccion: string; distanciaKm: number }
  | { t: "toast"; icono: string; titulo: string; cuerpo?: string }
  | { t: "ganado" };

interface Guion {
  arranqueMs: number;
  cliente: { nombre: string; telefono: string; vehiculo?: string };
  pasos: Paso[];
}

const GUIONES: Guion[] = [
  {
    // El protagonista: recorre TODO el guion de venta y cierra ganado.
    arranqueMs: 1200,
    cliente: { nombre: "Roberto Zambrano", telefono: "+593 98 700 4581", vehiculo: "Chevrolet Sail 2020" },
    pasos: [
      { t: "toast", icono: "👋", titulo: "Nuevo cliente escribiendo", cuerpo: "Roberto Zambrano" },
      { t: "cliente", texto: "Buenas 🙌 ¿tienen llantas para un Chevrolet Sail?", typing: 1600 },
      { t: "bot", texto: "¡Hola Roberto! 👋 Claro que sí. ¿Me confirmas la medida de tus llantas? La ves en el costado — algo como 185/60 R14.", typing: 1700 },
      { t: "cliente", texto: "185/60 R14 creo, la de siempre", typing: 2200 },
      { t: "medida", medida: "185/60 R14" },
      { t: "etapa", etapa: "medidas" },
      { t: "bot", texto: "Perfecto, 185/60 R14 ✅ Dame un segundo y te paso la cotización 🔧", typing: 1300 },
      { t: "espera", ms: 1600 },
      { t: "cotizacion", medida: "185/60 R14", marca: "Kenda", modelo: "Kaiser KR26", precio: 62 },
      { t: "bot", texto: "Cotización #1042 · Kenda Kaiser KR26 185/60 R14", tipo: "pdf", typing: 900 },
      { t: "etapa", etapa: "cotizado" },
      { t: "toast", icono: "📄", titulo: "Cotización enviada", cuerpo: "Roberto Zambrano — $285,20" },
      { t: "bot", texto: "Ahí te va 📄 4 llantas con instalación, balanceo y válvulas incluidas. ¿Te interesa?", typing: 1400 },
      { t: "cliente", texto: "¿Y estas Kenda son buenas? el precio me cuadra", typing: 2400 },
      { t: "bot", texto: "¡Muy buenas! 💪 Kaiser KR26 es de lo más vendido para Sail: agarre en mojado y duración. Si quieres, compárteme tu ubicación y te digo qué local te queda más cerca 📍", typing: 1900 },
      { t: "cliente", texto: "📍 La Floresta, Quito", tipo: "ubicacion", typing: 1800 },
      { t: "local", nombre: "Depot Tire Cumbayá", direccion: "C.C. La del Establo y Av. Oswaldo Guayasamín", distanciaKm: 6.8 },
      { t: "etapa", etapa: "ubicacion" },
      { t: "bot", texto: "¡Listo! Te queda Depot Tire Cumbayá — C.C. La del Establo, a 6,8 km de ti. ¿Te esperamos hoy? Atendemos hasta las 17:30 🕠", typing: 1500 },
      { t: "cliente", texto: "Sí, paso en la tarde 💪", typing: 2100 },
      { t: "etapa", etapa: "por_visitar" },
      { t: "toast", icono: "🔥", titulo: "Roberto confirmó visita", cuerpo: "Hoy en la tarde · Cumbayá — vendedor notificado" },
      { t: "bot", texto: "¡Buenísimo Roberto! 🙌 Te esperamos. Pregunta por Andrés y menciona la cotización #1042 🚗", typing: 1200 },
      { t: "espera", ms: 4500 },
      { t: "ganado" },
    ],
  },
  {
    // Segundo hilo: llega hasta cotizado — muestra el Kanban moviéndose en paralelo.
    arranqueMs: 14_000,
    cliente: { nombre: "Paola Reinoso", telefono: "+593 99 315 7702", vehiculo: "Hyundai Tucson 2021" },
    pasos: [
      { t: "cliente", texto: "hola! necesito llantas para una tucson 2021", typing: 1500 },
      { t: "bot", texto: "¡Hola Paola! 👋 Para la Tucson 2021 suele ser 225/55 R18 — ¿me confirmas viendo el costado de la llanta?", typing: 1800 },
      { t: "cliente", texto: "sí, 225/55 r18 ✔️", typing: 2600 },
      { t: "medida", medida: "225/55 R18" },
      { t: "etapa", etapa: "medidas" },
      { t: "bot", texto: "Perfecto ✅ Te preparo la cotización.", typing: 1100 },
      { t: "espera", ms: 1500 },
      { t: "cotizacion", medida: "225/55 R18", marca: "Falken", modelo: "Azenis FK510", precio: 156 },
      { t: "bot", texto: "Cotización #1043 · Falken Azenis FK510 225/55 R18", tipo: "pdf", typing: 800 },
      { t: "etapa", etapa: "cotizado" },
      { t: "toast", icono: "📄", titulo: "Cotización enviada", cuerpo: "Paola Reinoso — $717,60" },
      { t: "bot", texto: "Ahí está 📄 ¿Te interesa? También tengo una opción más económica en Kenda si prefieres.", typing: 1600 },
      { t: "cliente", texto: "déjame verlo con mi esposo y te aviso 🙏", typing: 3000 },
    ],
  },
  {
    // Tercer hilo: cliente nuevo que se queda en el arranque del funnel.
    arranqueMs: 30_000,
    cliente: { nombre: "Kevin Chamorro", telefono: "+593 96 208 3319" },
    pasos: [
      { t: "cliente", texto: "buenas, ¿aro 13 tienen?", typing: 1400 },
      { t: "bot", texto: "¡Hola! 👋 Sí tenemos rin 13. ¿Me pasas la medida completa del costado? Son 3 números, tipo 165/70 R13. ¿Y para qué vehículo es?", typing: 1700 },
      { t: "cliente", texto: "es para un spark, deja veo la medida", typing: 2800 },
    ],
  },
];

export class Simulator {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private corriendo = false;

  constructor(private source: MockSource) {}

  get activo(): boolean {
    return this.corriendo;
  }

  start(): void {
    if (this.corriendo) return;
    this.corriendo = true;
    for (const guion of GUIONES) {
      this.programar(guion.arranqueMs, () => this.correrGuion(guion));
    }
  }

  stop(): void {
    this.corriendo = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private programar(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private correrGuion(guion: Guion): void {
    if (!this.corriendo) return;
    const ticket = this.source.crearTicket(guion.cliente);
    let reloj = 0;

    for (const paso of guion.pasos) {
      switch (paso.t) {
        case "espera":
          reloj += paso.ms;
          break;
        case "cliente":
        case "bot": {
          const rol = paso.t === "cliente" ? "cliente" : "bot";
          const typing = paso.typing ?? 1200;
          const inicioTyping = reloj + 350;
          this.programar(inicioTyping, () => this.source.setTyping(ticket.id, rol, true));
          reloj = inicioTyping + typing;
          const { texto } = paso;
          const tipo = paso.tipo ?? "texto";
          this.programar(reloj, () => {
            this.source.setTyping(ticket.id, rol, false);
            this.source.pushMensaje(ticket.id, rol, tipo, texto);
          });
          reloj += 500;
          break;
        }
        case "etapa": {
          const { etapa } = paso;
          this.programar(reloj, () => void this.source.moverEtapa(ticket.id, etapa));
          break;
        }
        case "medida": {
          const { medida } = paso;
          this.programar(reloj, () => this.source.patch(ticket.id, { medida }));
          break;
        }
        case "cotizacion": {
          const { medida, marca, modelo, precio } = paso;
          const cant = paso.cant ?? 4;
          const subtotal = precio * cant;
          const iva = Math.round(subtotal * IVA * 100) / 100;
          this.programar(reloj, () =>
            this.source.patch(ticket.id, {
              cotizacion: {
                numero: 1042 + guion.arranqueMs / 1000,
                items: [{ descripcion: `${marca} ${modelo} ${medida}`, cantidad: cant, precioUnit: precio }],
                subtotal,
                iva,
                total: Math.round((subtotal + iva) * 100) / 100,
              },
            }),
          );
          break;
        }
        case "local": {
          const { nombre, direccion, distanciaKm } = paso;
          this.programar(reloj, () =>
            this.source.patch(ticket.id, { localAsignado: { nombre, direccion, distanciaKm } }),
          );
          break;
        }
        case "toast": {
          const { icono, titulo, cuerpo } = paso;
          this.programar(reloj, () => this.source.toast(icono, titulo, cuerpo, ticket.id));
          break;
        }
        case "ganado":
          this.programar(reloj, () =>
            void this.source.cerrar(ticket.id, "ganado", "Demo: compró 4 llantas el mismo día"),
          );
          break;
      }
    }
  }
}
