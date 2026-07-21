import { hostname } from "node:os";
import { ensureSchema } from "./db/schema.js";
import { sql } from "./db/client.js";
import { processFollowUpJob } from "./services/followUpProcessor.js";
import { startFollowUpWorker } from "./workers/followUpWorker.js";

await ensureSchema();
const controller = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => controller.abort());
}

console.log("✅ Worker de seguimientos listo");
await startFollowUpWorker(processFollowUpJob, {
  workerId: `${hostname()}:${process.pid}`,
  pollMs: Number(process.env.FOLLOW_UP_POLL_MS ?? 5_000),
  batchSize: Number(process.env.FOLLOW_UP_BATCH_SIZE ?? 10),
  leaseMinutes: Number(process.env.FOLLOW_UP_LEASE_MINUTES ?? 5),
}, controller.signal);
await sql.end();
