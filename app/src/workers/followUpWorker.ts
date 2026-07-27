import { sql } from "../db/client.js";
import {
  claimDueFollowUpJobs,
  markFollowUpJobCancelled,
  type FollowUpJob,
  reconcileFollowUpAlerts,
  ensureActiveConversationPlans,
} from "../services/followUps.js";

/**
 * Latido del worker.
 *
 * El worker corre en un proceso aparte y sin healthcheck: si se muere, los
 * seguimientos dejan de salir y nada lo dice — el bot sigue contestando, el
 * panel sigue abriendo, y el silencio pasa por normalidad. Dejar la marca de
 * la última vuelta es lo que permite que /health lo detecte.
 */
async function latir(workerId: string): Promise<void> {
  await sql`
    insert into settings (key, value)
    values ('follow_up_worker_heartbeat', ${sql.json({ at: new Date().toISOString(), workerId })})
    on conflict (key) do update set value = excluded.value
  `.catch(() => { /* el latido nunca debe tumbar al worker */ });
}

export interface FollowUpJobProcessor {
  (job: FollowUpJob): Promise<void>;
}

export interface WorkerOptions {
  workerId: string;
  pollMs?: number;
  batchSize?: number;
  leaseMinutes?: number;
  clock?: () => Date;
}

export async function runFollowUpWorkerOnce(
  processor: FollowUpJobProcessor,
  options: WorkerOptions,
): Promise<number> {
  await latir(options.workerId);
  await reconcileFollowUpAlerts(options.clock?.() ?? new Date());
  await ensureActiveConversationPlans(options.clock?.() ?? new Date());
  const jobs = await claimDueFollowUpJobs({
    workerId: options.workerId,
    now: options.clock?.() ?? new Date(),
    limit: options.batchSize ?? 10,
    leaseMinutes: options.leaseMinutes ?? 5,
  });
  for (const job of jobs) {
    try {
      await processor(job);
    } catch (error) {
      // El processor persiste reintentos/fallos esperados. Esta barrera evita
      // que un error inesperado deje el lease bloqueado hasta el siguiente boot.
      await markFollowUpJobCancelled(
        job.id,
        `unexpected_worker_error:${error instanceof Error ? error.message : "unknown"}`.slice(0, 500),
      );
    }
  }
  return jobs.length;
}

export async function startFollowUpWorker(
  processor: FollowUpJobProcessor,
  options: WorkerOptions,
  signal?: AbortSignal,
): Promise<void> {
  const pollMs = options.pollMs ?? 5_000;
  while (!signal?.aborted) {
    const processed = await runFollowUpWorkerOnce(processor, options);
    if (processed > 0) continue;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, pollMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
