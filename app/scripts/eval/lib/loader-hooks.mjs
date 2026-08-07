/**
 * Hooks del loader (corren en el hilo de resolución, aislados del programa).
 * Ver lib/loader.mjs para el porqué.
 */
import { fileURLToPath } from "node:url";

const STUB = new URL("./wa-stub.mjs", import.meta.url).href;

/** Reconoce `…/src/wa/client.ts` y `…/dist/wa/client.js`, y nada más. */
function esClienteWa(url) {
  if (!url.startsWith("file:")) return false;
  const ruta = fileURLToPath(url).replace(/\\/g, "/");
  return /\/(?:src|dist)\/wa\/client\.(?:ts|js|mts|mjs)$/.test(ruta);
}

export async function resolve(specifier, context, nextResolve) {
  const resuelto = await nextResolve(specifier, context);
  if (esClienteWa(resuelto.url)) {
    return { url: STUB, shortCircuit: true, format: "module" };
  }
  return resuelto;
}
