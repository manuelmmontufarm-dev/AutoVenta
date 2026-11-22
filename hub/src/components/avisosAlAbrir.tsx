import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { activarPush, esIos, estadoPush, instalada, type EstadoPush } from "../data/avisos";
import { authHeaders } from "../data/realSource";
import { useHub } from "../store";
import { Hoja } from "./adjuntar";
import { IconCampana } from "./icons";

/*
 * Lo que la app le pide al asesor al abrirla (Manuel, 22-nov-2026):
 *
 *  1. Si su ventana de 24 h de WhatsApp está cerrada (o se cierra en menos de
 *     3 h), un aviso con un botón que abre el WhatsApp del negocio con el
 *     mensaje ya escrito («/asesor …»). El bot lo reconoce y la reabre.
 *  2. Si no activó las notificaciones, se las pide. «Ahora no» la calla solo
 *     hasta la próxima vez que abra la app: tiene que molestar hasta que las prenda.
 *
 * Primero la ventana (es el canal de lo urgente), después las notificaciones.
 */

interface MiVentana {
  asesor: { nombre: string; telefono: string } | null;
  estado: "abierta" | "por_vencer" | "cerrada" | "nunca" | null;
  ventanaHasta: string | null;
  numeroDelBot: string | null;
  mensaje: string;
}

/** «Ahora no» vale por esta apertura de la app (sessionStorage), no para siempre. */
const CALLADO = "autoventa.alAbrir.callado";
const leerCallados = (): string[] => {
  try { return JSON.parse(window.sessionStorage.getItem(CALLADO) ?? "[]") as string[]; } catch { return []; }
};
const callar = (clave: string) => {
  try { window.sessionStorage.setItem(CALLADO, JSON.stringify([...leerCallados(), clave])); } catch { /* sin almacenamiento */ }
};

async function pedirVentana(): Promise<MiVentana | null> {
  try {
    const r = await fetch("/api/hub/mi-ventana", { headers: authHeaders() });
    if (!r.ok) return null;
    return (await r.json()) as MiVentana;
  } catch {
    return null;
  }
}

function cuantoFalta(iso: string): string {
  const min = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

export function AvisosAlAbrir() {
  const dataMode = useHub((s) => s.dataMode);
  const conexion = useHub((s) => s.conexion);
  const usuario = useHub((s) => s.usuario);
  const [ventana, setVentana] = useState<MiVentana | null>(null);
  const [push, setPush] = useState<EstadoPush | null>(null);
  const [callados, setCallados] = useState<string[]>(leerCallados);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const activo = dataMode === "real" && conexion === "conectada" && Boolean(usuario);

  // Al abrir y cada 10 min: la ventana se cierra sola con el reloj. Volver a la
  // app (de otra app al frente) también la revisa.
  useEffect(() => {
    if (!activo) return;
    const revisar = () => {
      void pedirVentana().then(setVentana);
      void estadoPush().then(setPush);
    };
    revisar();
    const t = window.setInterval(revisar, 10 * 60_000);
    const alVolver = () => { if (document.visibilityState === "visible") revisar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
  }, [activo, usuario?.id]);

  if (!activo) return null;

  const claveVentana = `ventana:${ventana?.estado}:${ventana?.ventanaHasta ?? "nunca"}`;
  const mostrarVentana = Boolean(
    ventana?.asesor && ventana.estado && ventana.estado !== "abierta" && !callados.includes(claveVentana),
  );
  // iPhone sin instalar no puede tener notificaciones: se le explica cómo instalar.
  const mostrarPush = !mostrarVentana
    && (push === "apagado" || push === "bloqueado" || (push === "no-soportado" && esIos() && !instalada()))
    && !callados.includes(`push:${push}`);

  const ahoraNo = (clave: string) => {
    callar(clave);
    setCallados(leerCallados());
    setError("");
  };

  async function activar() {
    setOcupado(true);
    setError("");
    try {
      await activarPush(ventana?.asesor?.telefono ?? null);
      setPush("activo");
    } catch (e) {
      setError((e as Error).message);
      setPush(await estadoPush());
    } finally {
      setOcupado(false);
    }
  }

  const enlace = ventana?.numeroDelBot
    ? `https://wa.me/${ventana.numeroDelBot}?text=${encodeURIComponent(ventana.mensaje)}`
    : null;

  return (
    <AnimatePresence>
      {mostrarVentana && ventana && (
        <Hoja key="ventana" titulo={ventana.estado === "por_vencer" ? "Tus avisos se apagan pronto" : "No te están llegando los avisos"} onClose={() => ahoraNo(claveVentana)}>
          <div className="flex flex-col gap-3 p-5" data-testid="popup-ventana">
            <p className="m-0 text-[15px]">
              {ventana.estado === "por_vencer" && ventana.ventanaHasta
                ? `En ${cuantoFalta(ventana.ventanaHasta)} WhatsApp deja de mandarte los avisos de clientes.`
                : "WhatsApp dejó de mandarte los avisos de clientes: pasaron más de 24 h desde tu último mensaje al bot."}
            </p>
            <details className="text-[13px] text-text2">
              <summary className="cursor-pointer select-none">Por qué pasa</summary>
              <p className="mt-1.5">WhatsApp solo deja mandarte mensajes si le escribiste al número del bot en las últimas 24 h. Con un mensaje se renueva por 24 h más.</p>
            </details>
            {enlace ? (
              <a href={enlace} target="_blank" rel="noopener" onClick={() => ahoraNo(claveVentana)} className="btn-signal flex h-[52px] w-full items-center justify-center rounded-[8px] text-[16px] font-semibold" data-testid="abrir-whatsapp">
                Abrir WhatsApp y enviar
              </a>
            ) : (
              <p className="m-0 rounded-[8px] bg-bg p-3 text-[14px]">Escríbele al WhatsApp del bot: <b>{ventana.mensaje}</b></p>
            )}
            <p className="m-0 text-center text-[12px] text-text2">Se abre WhatsApp con el mensaje escrito: solo toca enviar.</p>
            <button type="button" onClick={() => ahoraNo(claveVentana)} className="h-11 text-[14px] text-text2">Ahora no</button>
          </div>
        </Hoja>
      )}
      {mostrarPush && (
        <Hoja key="push" titulo="Activa las notificaciones" onClose={() => ahoraNo(`push:${push}`)}>
          <div className="flex flex-col gap-3 p-5" data-testid="popup-push">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-text text-white"><IconCampana size={22} /></span>
            {push === "bloqueado" ? (
              <>
                <p className="m-0 text-[15px]">Las notificaciones de esta app están bloqueadas.</p>
                <p className="m-0 text-[14px] text-text2">
                  {esIos()
                    ? "Ve a Ajustes del iPhone → Notificaciones → AutoVenta y activa «Permitir notificaciones»."
                    : "Toca el candado junto a la dirección (o Ajustes del teléfono → Apps → AutoVenta) y permite las notificaciones."}
                </p>
              </>
            ) : push === "no-soportado" ? (
              <>
                <p className="m-0 text-[15px]">Para recibir avisos en este teléfono, instala la app.</p>
                <p className="m-0 text-[14px] text-text2">En Safari toca Compartir y elige «Agregar a inicio». Después abre AutoVenta desde el ícono.</p>
              </>
            ) : (
              <>
                <p className="m-0 text-[15px]">Te avisamos aquí cuando se envía una cotización o se confirma una venta, sin llenarte el WhatsApp.</p>
                {error && <p role="alert" className="m-0 text-[14px] text-signal">{error}</p>}
                <button type="button" onClick={() => void activar()} disabled={ocupado} className="btn-signal h-[52px] w-full rounded-[8px] text-[16px]" data-testid="popup-activar">
                  {ocupado ? "Activando…" : "Activar notificaciones"}
                </button>
              </>
            )}
            <button type="button" onClick={() => ahoraNo(`push:${push}`)} className="h-11 text-[14px] text-text2">Ahora no</button>
          </div>
        </Hoja>
      )}
    </AnimatePresence>
  );
}
