/**
 * La puerta del CONECTOR: el programa que corre en el servidor del cliente,
 * lee su sistema contable (Fénix) y manda aquí el inventario y las facturas.
 *
 * No inventa una importación nueva: entrega un CSV a las mismas funciones que
 * usa el panel cuando alguien sube el Excel a mano (`fuentes/archivo.ts`), con
 * la misma regla de seguridad — un inventario dudoso NO reemplaza al bueno.
 * El conector nunca «confirma» una carga dudosa: eso lo decide una persona en
 * el panel.
 *
 * Tiene su propia clave (`CONECTOR_KEY`), distinta de la del panel: esa clave
 * vive en una máquina que no es nuestra, así que solo abre estas cuatro rutas.
 * Con ella no se puede leer un chat, ni un precio, ni cambiar un ajuste. Sin
 * `CONECTOR_KEY` en el servicio (Depot) las rutas contestan 404.
 */
import { timingSafeEqual } from "node:crypto";
import express from "express";
import { sql } from "../db/client.js";
import {
  CargaRechazada,
  ensayarFacturas,
  ensayarInventario,
  importarCatalogoYSincronizar,
  importarFacturasYSincronizar,
  marcarCatalogoAlDia,
} from "../services/fuentes/archivo.js";

/** Lo que el panel puede mostrar del conector: si está vivo y cómo le fue. */
export interface EstadoDelConector {
  /** La última vez que el conector llamó, haya salido bien o mal. */
  ultimoContacto: string;
  equipo: string | null;
  version: string | null;
  inventario: { en: string; ok: boolean; mensaje: string } | null;
  facturas: { en: string; ok: boolean; mensaje: string } | null;
  /** Un error DEL LADO DE ELLOS (no pudo leer Fénix), contado por el conector. */
  error: { en: string; mensaje: string } | null;
}

const CLAVE_DE_ESTADO = "conector_estado";

export async function estadoDelConector(): Promise<EstadoDelConector | null> {
  const [row] = await sql<{ value: EstadoDelConector }[]>`select value from settings where key = ${CLAVE_DE_ESTADO}`;
  return row?.value ?? null;
}

async function anotar(req: express.Request, cambio: Partial<EstadoDelConector>): Promise<void> {
  const anterior = await estadoDelConector();
  const corto = (v: string | undefined) => (v ? v.trim().slice(0, 80) : null);
  const estado: EstadoDelConector = {
    inventario: null,
    facturas: null,
    error: null,
    ...anterior,
    ...cambio,
    ultimoContacto: new Date().toISOString(),
    equipo: corto(req.header("x-conector-equipo")) ?? anterior?.equipo ?? null,
    version: corto(req.header("x-conector-version")) ?? anterior?.version ?? null,
  };
  await sql`
    insert into settings (key, value) values (${CLAVE_DE_ESTADO}, ${sql.json(estado as never)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

function claveCorrecta(recibida: string | undefined, esperada: string): boolean {
  const a = Buffer.from(recibida ?? "");
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createConectorRouter(): express.Router {
  const router = express.Router();

  router.use((req, res, next) => {
    const esperada = process.env.CONECTOR_KEY ?? "";
    // Sin clave configurada este servicio no tiene conector: que ni se note la ruta.
    if (!esperada) return res.status(404).json({ ok: false, error: "No encontrado" });
    if (!claveCorrecta(req.header("x-conector-key"), esperada)) {
      return res.status(401).json({ ok: false, error: "Clave del conector incorrecta" });
    }
    next();
  });

  const archivoCrudo = express.raw({ type: "*/*", limit: "8mb" });
  const nombreDelArchivo = (req: express.Request, porDefecto: string) =>
    String(req.query.nombre ?? "").trim().slice(0, 200) || porDefecto;
  const cuerpoDelArchivo = (req: express.Request): Buffer | null =>
    Buffer.isBuffer(req.body) && req.body.length ? req.body : null;
  const esEnsayo = (req: express.Request) => req.query.ensayo === "1";

  // Para que `--probar` compruebe la dirección y la clave antes de nada.
  router.get("/estado", async (_req, res) => {
    res.json({ ok: true, estado: await estadoDelConector() });
  });

  router.post("/inventario", archivoCrudo, async (req, res) => {
    const cuerpo = cuerpoDelArchivo(req);
    if (!cuerpo) return res.status(400).json({ ok: false, error: "Falta el inventario (cuerpo vacío)" });
    const nombre = nombreDelArchivo(req, "fenix-inventario.csv");
    if (esEnsayo(req)) {
      try {
        return res.json({ ok: true, ensayo: true, ...(await ensayarInventario(nombre, cuerpo)) });
      } catch (error) {
        return res.status(422).json({ ok: false, ensayo: true, error: mensajeDe(error) });
      }
    }
    const en = new Date().toISOString();
    try {
      const { importado } = await importarCatalogoYSincronizar(nombre, cuerpo);
      if (importado.mismoArchivo) await marcarCatalogoAlDia();
      const mensaje = importado.mismoArchivo
        ? `Sin cambios (${importado.llantas} llantas)`
        : `${importado.llantas} llantas cargadas${importado.descartadas.length ? `, ${importado.descartadas.length} filas descartadas` : ""}`;
      await anotar(req, { inventario: { en, ok: true, mensaje }, error: null });
      res.json({
        ok: true,
        llantas: importado.llantas,
        aros: importado.aros,
        descartadas: importado.descartadas.length,
        sinCambios: importado.mismoArchivo,
      });
    } catch (error) {
      const mensaje = mensajeDe(error);
      await anotar(req, { inventario: { en, ok: false, mensaje } }).catch(() => undefined);
      // 409 = dudoso, lo puede cargar una persona en el panel; 422 = no sirve.
      const confirmable = error instanceof CargaRechazada && error.confirmable;
      const status = error instanceof CargaRechazada ? (confirmable ? 409 : 422) : 500;
      res.status(status).json({ ok: false, error: mensaje, confirmable });
    }
  });

  router.post("/facturas", archivoCrudo, async (req, res) => {
    const cuerpo = cuerpoDelArchivo(req);
    if (!cuerpo) return res.status(400).json({ ok: false, error: "Faltan las facturas (cuerpo vacío)" });
    const nombre = nombreDelArchivo(req, "fenix-facturas.csv");
    if (esEnsayo(req)) {
      try {
        return res.json({ ok: true, ensayo: true, ...(await ensayarFacturas(nombre, cuerpo)) });
      } catch (error) {
        return res.status(422).json({ ok: false, ensayo: true, error: mensajeDe(error) });
      }
    }
    const en = new Date().toISOString();
    try {
      const { importado, estado } = await importarFacturasYSincronizar(nombre, cuerpo);
      const mensaje = `${importado.facturas} facturas recibidas${importado.descartadas.length ? `, ${importado.descartadas.length} filas descartadas` : ""}`;
      await anotar(req, { facturas: { en, ok: true, mensaje }, error: null });
      res.json({ ok: true, facturas: importado.facturas, descartadas: importado.descartadas.length, total: estado.facturas });
    } catch (error) {
      const mensaje = mensajeDe(error);
      await anotar(req, { facturas: { en, ok: false, mensaje } }).catch(() => undefined);
      res.status(422).json({ ok: false, error: mensaje });
    }
  });

  // El conector cuenta cómo le fue de SU lado: si no pudo leer Fénix (servidor
  // apagado, clave cambiada, una actualización que movió una tabla) nos
  // enteramos acá sin tener que conectarnos a su máquina.
  router.post("/latido", express.json({ limit: "64kb" }), async (req, res) => {
    const error = typeof req.body?.error === "string" && req.body.error.trim()
      ? { en: new Date().toISOString(), mensaje: req.body.error.trim().slice(0, 600) }
      : null;
    await anotar(req, { error });
    res.json({ ok: true });
  });

  return router;
}
