/**
 * Contífico, congelado en una foto y con el stock editable.
 *
 * El catálogo real cambia solo: entre que se reproduce un error y se prueba el
 * arreglo, la llanta del caso pasó de 3 unidades a 7 y el error «desapareció»
 * sin que nadie tocara una línea. Un caso que no se puede volver a montar no
 * es una prueba.
 *
 * Así que el simulador se sirve de una FOTO del catálogo real (una vez, con la
 * clave de verdad, guardada en datos/catalogo.json) y encima deja pisar el
 * stock de cualquier código. El bot no se entera: pide `/producto/` como
 * siempre, con su cabecera y su paginación, y recibe lo mismo que recibiría de
 * Contífico — salvo el número que quisimos mover.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const POR_PAGINA = 100;

/**
 * @param {{ puerto: number, snapshot: string, apiKey: string|null, urlReal: string, refrescar: boolean }} opciones
 */
export async function levantarContificoSim({ puerto, snapshot, apiKey, urlReal, refrescar }) {
  let productos = [];

  if (!refrescar && existsSync(snapshot)) {
    productos = JSON.parse(readFileSync(snapshot, "utf8"));
    console.log(`📸 Catálogo desde la foto: ${productos.length} productos (${snapshot})`);
  } else {
    if (!apiKey) throw new Error("No hay foto del catálogo y falta CONTIFICO_API_KEY para tomarla.");
    productos = await bajarCatalogo(apiKey, urlReal);
    mkdirSync(dirname(snapshot), { recursive: true });
    writeFileSync(snapshot, JSON.stringify(productos, null, 0));
    console.log(`📸 Foto del catálogo tomada: ${productos.length} productos → ${snapshot}`);
  }

  /** código → stock forzado. */
  const forzados = new Map();

  const conStockForzado = () =>
    productos.map((p) => {
      const clave = String(p.codigo ?? p.id ?? "");
      return forzados.has(clave) ? { ...p, cantidad_stock: forzados.get(clave) } : p;
    });

  // Inyección de fallos para el corpus T115 (E09/R01): el arnés PROVOCA la
  // caída del catálogo y mide que el bot la maneje sin inventar «no hay stock».
  //   PUT /averia {"modo":"caido"}    → todo /producto responde 503
  //   PUT /averia {"modo":"timeout"}  → todo /producto se cuelga 45 s
  //   PUT /averia {"modo":"sano"}     → se repara
  let averia = "sano";
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${puerto}`);
    if (url.pathname === "/averia" && req.method === "PUT") {
      let cuerpo = "";
      req.on("data", (c) => { cuerpo += c; });
      req.on("end", () => {
        try { averia = JSON.parse(cuerpo).modo ?? "sano"; } catch { averia = "sano"; }
        json(res, 200, { averia });
      });
      return;
    }
    if (!url.pathname.startsWith("/producto")) return json(res, 404, { error: "ruta no simulada" });
    if (averia === "caido") return json(res, 503, { error: "Contífico simulado caído (avería inyectada)" });
    if (averia === "timeout") return void setTimeout(() => json(res, 503, { error: "timeout inyectado" }), 45_000);
    const pagina = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const todos = conStockForzado();
    const trozo = todos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
    return json(res, 200, trozo);
  });

  await new Promise((ok) => server.listen(puerto, "127.0.0.1", ok));

  return {
    puerto,
    total: () => productos.length,
    /** Pisa el stock de un código. `null` devuelve el valor real de la foto. */
    forzarStock: (codigo, cantidad) => {
      if (cantidad === null) forzados.delete(codigo);
      else forzados.set(codigo, Math.max(0, Math.trunc(Number(cantidad) || 0)));
    },
    forzados: () => Object.fromEntries(forzados),
    /** Búsqueda tonta por texto, para poder elegir un código desde la UI. */
    buscar: (texto, limite = 12) => {
      const agujas = String(texto ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      if (!agujas.length) return [];
      return conStockForzado()
        .filter((p) => {
          const heno = `${p.nombre ?? ""} ${p.codigo ?? ""}`.toLowerCase();
          return agujas.every((a) => heno.includes(a));
        })
        .slice(0, limite)
        .map((p) => ({
          codigo: String(p.codigo ?? p.id ?? ""),
          nombre: String(p.nombre ?? ""),
          stock: Number(p.cantidad_stock ?? 0),
          forzado: forzados.has(String(p.codigo ?? p.id ?? "")),
        }));
    },
    cerrar: () => new Promise((ok) => server.close(ok)),
  };
}

/** Baja TODAS las páginas del catálogo real. Se hace una vez y se guarda. */
async function bajarCatalogo(apiKey, urlReal) {
  const filas = [];
  for (let pagina = 1; pagina <= 100; pagina += 1) {
    const url = new URL(`${urlReal.replace(/\/$/, "")}/producto/`);
    url.searchParams.set("page", String(pagina));
    url.searchParams.set("estado", "A");
    const respuesta = await fetch(url, {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!respuesta.ok) throw new Error(`Contífico respondió HTTP ${respuesta.status} bajando la foto (${url})`);
    const cuerpo = await respuesta.json();
    const trozo = Array.isArray(cuerpo) ? cuerpo : Array.isArray(cuerpo?.results) ? cuerpo.results : [];
    filas.push(...trozo);
    process.stdout.write(`\r📸 bajando catálogo real… ${filas.length} productos`);
    if (trozo.length < POR_PAGINA) break;
  }
  process.stdout.write("\n");
  return filas;
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
