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
}
