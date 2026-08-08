/**
 * Worker de seguimientos dentro del proceso HTTP.
 *
 * El diseño original lo tiene como servicio aparte (`npm run start:worker`),
 * y eso sigue siendo lo preferible cuando existe. El problema es lo que pasa
 * cuando NO existe: `/health` reporta `worker.ok=false`, los seguimientos no
 * salen, y el bot sigue contestando como si nada — el fallo es invisible desde
 * el lado del cliente. Pasó en staging: el latido nunca se escribió porque el
 * servicio dedicado no estaba corriendo.
 *
 * Por eso el proceso HTTP lo levanta por defecto. Si el servicio dedicado ya
 * existe se apaga con `FOLLOW_UP_WORKER=externo`. Correr los dos a la vez
 * tampoco corrompe nada — los jobs se reclaman con `FOR UPDATE SKIP LOCKED` y
 * lease — pero duplica trabajo, así que conviene declarar cuál manda.
 */
// El procesador y el bucle se cargan en caliente dentro de `supervisar`: así
// este módulo no arrastra config/DB solo por preguntar si le toca correr
// (`/health` y las pruebas lo importan sin querer levantar nada).
import { hostname } from "node:os";

/** Espera entre reintentos cuando el bucle del worker se cae entero. */
const RELANZAR_MS = 15_000;

/** Cada cuánto se revisa si el bot está apagado con clientes esperando. */
const VIGILANCIA_MS = 5 * 60_000;

/**
 * Cada cuánto se buscan las visitas de mañana. Un cuarto de hora sobra: la
 * ventana de envío dura diez horas y el aviso sale una sola vez por cliente y
 * por fecha. Revisar más seguido no adelanta nada.
 */
const VISITAS_MS = 15 * 60_000;

/**
 * ¿Le toca a este proceso correr el worker? Solo se apaga con la señal
 * explícita: cualquier otro valor (o ninguno) deja el worker encendido, que es
 * el estado seguro — un seguimiento de más se ve; uno de menos, no.
 */
export function shouldRunEmbeddedWorker(env: NodeJS.ProcessEnv = process.env): boolean {
  const modo = (env.FOLLOW_UP_WORKER ?? "").trim().toLowerCase();
  return modo !== "externo" && modo !== "external";
}

function esperar(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/**
 * Decisión pura del watchdog de bot apagado.
 *
 * El 6-ago el bot quedó apagado desde las 13:16 y entraron 139 mensajes de 38
 * clientes sin que nadie se enterara: apagar el bot no apaga el WhatsApp, así
 * que los mensajes siguen llegando y nadie los contesta. Esto avisa.
 *
 * La clave de deduplicación baja a HORAS apagadas a propósito: se quiere un
 * recordatorio por hora mientras dure el apagón, no una alerta cada 5 minutos
 * (eso sería ruido y el dueño lo terminaría ignorando, que es justo el fallo
 * que se quiere evitar).
 *
 * Se separa de la consulta para poder probar la regla sin base de datos.
 */
export function debeAlertarBotApagado(
  estado: { activo: boolean; apagadoAt: string | null },
  clientesEsperando: number,
  ahora: Date,
): { alertar: boolean; dedupeKey: string } | null {
  // Encendido: no hay nada que vigilar. Sin apagadoAt tampoco hay apagón que
  // fechar (instalación que nunca se encendió), y alertar ahí sería ruido.
  if (estado.activo || !estado.apagadoAt) return null;
  if (clientesEsperando <= 0) return null;
  const desde = new Date(estado.apagadoAt).getTime();
  if (Number.isNaN(desde)) return null;
  const minutosApagado = Math.max(0, (ahora.getTime() - desde) / 60_000);
  return {
    alertar: true,
    dedupeKey: `bot_apagado:${estado.apagadoAt}:${Math.floor(minutosApagado / 60)}`,
  };
}

/**
 * Cuenta clientes esperando y, si toca, alerta. Nunca lanza: el watchdog vigila
 * al worker, no puede ser quien lo tumbe.
 */
async function vigilarBotApagado(): Promise<void> {
  const [{ sql }, { getBotPower }, { createBotAlert }, { notifyAdvisor }] = await Promise.all([
    import("../db/client.js"),
    import("../services/botPower.js"),
    import("../services/followUps.js"),
    import("../services/advisorNotifications.js"),
  ]);

  const estado = await getBotPower();
  if (estado.activo || !estado.apagadoAt) return;

  // Conversaciones con mensajes del cliente posteriores al apagón donde el
  // último mensaje NO es del negocio: nadie contestó, ni el bot ni un humano.
  const esperando = await sql<{ id: number; cycle: number }[]>`
    select c.id, c.current_cycle as cycle
    from conversations c
    where exists (
            select 1 from messages m
            where m.conversation_id = c.id
              and m.direction = 'inbound'
              and m.created_at >= ${estado.apagadoAt}
          )
      and (
        select m2.direction from messages m2
        where m2.conversation_id = c.id
        order by m2.created_at desc limit 1
      ) = 'inbound'
    order by c.id desc
  `;

  const decision = debeAlertarBotApagado(estado, esperando.length, new Date());
  if (!decision?.alertar) return;

  // La alerta cuelga de la conversación más reciente que quedó sin respuesta:
  // bot_alerts y las notificaciones son por conversación, y esa es la que el
  // dueño va a querer abrir primero.
  const ancla = esperando[0];
  const horas = Math.floor(
    (Date.now() - new Date(estado.apagadoAt).getTime()) / 3_600_000,
  );
  const resumen = `El bot está APAGADO y ${esperando.length} clientes escribieron sin respuesta`;
  // El motivo que escribió quien lo apagó va en el recordatorio: sin él, a las
  // 3 horas nadie se acuerda de si fue por pruebas o por catálogo desactualizado
  // — y esa es justo la información que decide si ya se puede volver a prender.
  const porQue = estado.motivo ? ` Motivo del apagado: «${estado.motivo}».` : "";
  const razon = `Apagado desde ${estado.apagadoAt} (${horas} h).${porQue} ${esperando.length} conversaciones tienen un mensaje del cliente como último mensaje.`;
  const accion = "Enciende el bot desde el panel o contesta a mano esas conversaciones.";

  await createBotAlert({
    conversationId: ancla.id,
    cycle: ancla.cycle,
    type: "bot_apagado_con_clientes",
    priority: "high",
    summary: resumen,
    exactReason: razon,
    suggestedAction: accion,
    dedupeKey: decision.dedupeKey,
  });
  await notifyAdvisor({
    conversationId: ancla.id,
    cycle: ancla.cycle,
    eventType: "bot_apagado_con_clientes",
    dedupeKey: decision.dedupeKey,
    title: resumen,
    reason: razon,
    action: accion,
  });
}

/** Bucle del watchdog: revisa cada ~5 min mientras viva el proceso. */
async function supervisarBotApagado(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      await vigilarBotApagado();
    } catch (error) {
      console.warn(
        "⚠️ Watchdog de bot apagado falló:",
        error instanceof Error ? error.message : error,
      );
    }
    await esperar(VIGILANCIA_MS, signal);
  }
}

/**
 * Bucle de las visitas de mañana.
 *
 * Va aparte del worker de seguimientos porque ese se corta en seco cuando el
 * bot está apagado, y este NO debe cortarse: el aviso es para una persona, no
 * un mensaje al cliente. Con el bot apagado es cuando más falta hace — nadie
 * más va a acordarse de que mañana viene alguien.
 */
async function supervisarVisitas(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const { revisarVisitasDeManana } = await import("../services/visitAlerts.js");
      const avisados = await revisarVisitasDeManana();
      if (avisados > 0) console.log(`📅 ${avisados} recordatorio(s) de visita para mañana`);
    } catch (error) {
      console.warn(
        "⚠️ Recordatorio de visitas falló:",
        error instanceof Error ? error.message : error,
      );
    }
    await esperar(VISITAS_MS, signal);
  }
}

/**
 * Bucle de las ventanas de 24 h de los asesores.
 *
 * Comparte el ritmo de las visitas y el motivo para no depender del bot: si el
 * bot está apagado, los avisos a personas son lo único que queda funcionando.
 * La ventana se cierra sola con el paso del tiempo, así que este es de los
 * pocos vigilantes que tiene algo que hacer aunque nadie escriba.
 */
async function supervisarVentanas(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const { revisarVentanasDeAsesores } = await import("../services/advisorWindow.js");
      const avisados = await revisarVentanasDeAsesores();
      if (avisados > 0) console.log(`📵 ${avisados} asesor(es) por quedarse sin ventana de WhatsApp`);
    } catch (error) {
      console.warn(
        "⚠️ Revisión de ventanas de asesores falló:",
        error instanceof Error ? error.message : error,
      );
    }
    await esperar(VISITAS_MS, signal);
  }
}

/**
 * Supervisa el bucle: si revienta (por ejemplo, la base se cae un momento) lo
 * vuelve a levantar. En el servicio dedicado ese trabajo lo hacía Railway
 * reiniciando el proceso; aquí no puede morirse el HTTP por culpa del worker.
 */
async function supervisar(workerId: string, signal: AbortSignal): Promise<void> {
  const [{ processFollowUpJob }, { startFollowUpWorker }] = await Promise.all([
    import("../services/followUpProcessor.js"),
    import("./followUpWorker.js"),
  ]);
  const opciones = {
    workerId,
    pollMs: Number(process.env.FOLLOW_UP_POLL_MS ?? 5_000),
    batchSize: Number(process.env.FOLLOW_UP_BATCH_SIZE ?? 10),
    leaseMinutes: Number(process.env.FOLLOW_UP_LEASE_MINUTES ?? 5),
  };
  while (!signal.aborted) {
    try {
      await startFollowUpWorker(processFollowUpJob, opciones, signal);
      return; // salida limpia: solo ocurre al abortar
    } catch (error) {
      console.error("❌ El worker de seguimientos se cayó; se relanza en 15 s:", error);
      await esperar(RELANZAR_MS, signal);
    }
  }
}

/**
 * Arranca el worker en este proceso (si le toca) y devuelve el control de
 * inmediato: el bucle vive en segundo plano y se detiene con SIGTERM/SIGINT.
 */
export function startEmbeddedFollowUpWorker(): void {
  if (!shouldRunEmbeddedWorker()) {
    console.log("⏭️  Worker de seguimientos delegado al servicio externo (FOLLOW_UP_WORKER=externo)");
    return;
  }
  const controller = new AbortController();
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => controller.abort());
  }
  console.log("✅ Worker de seguimientos activo dentro del proceso HTTP");
  void supervisar(`http:${hostname()}:${process.pid}`, controller.signal);
  // Bucles aparte: con el bot apagado el worker de seguimientos se corta antes
  // de hacer nada, y es justo entonces cuando hay que vigilar y avisar.
  void supervisarBotApagado(controller.signal);
  void supervisarVisitas(controller.signal);
  void supervisarVentanas(controller.signal);
}
