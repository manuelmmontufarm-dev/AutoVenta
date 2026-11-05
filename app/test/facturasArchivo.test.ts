/**
 * FACTURAS POR ARCHIVO (R-26).
 *
 * Sin API de Fénix no hay facturas automáticas: se exportan y se suben en el
 * panel. El cruce por teléfono es el mismo de Depot (`cruzar()`), así que con
 * las facturas subidas se encienden Ventas confirmadas y Métricas
 * comprobables — antes solo existían con Contífico.
 */
import express from "express";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";
delete process.env.CONTIFICO_API_KEY;
const ADMIN_KEY = "clave-de-prueba-facturas-archivo";
process.env.ADMIN_KEY = ADMIN_KEY;
process.env.NODE_ENV = "test";

const BASE = `autoventa_facturas_archivo_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const CSV = readFileSync(fileURLToPath(new URL("./fixtures/facturas-fenix-muestra.csv", import.meta.url)));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { createAdminRouter } = await import("../src/server/admin.js");
const archivo = await import("../src/services/fuentes/archivo.js");
const { fuenteDeFacturas } = await import("../src/services/fuentes/index.js");
const { resumenVentasConfirmadas, facturasLeidas } = await import("../src/services/ventasConfirmadas.js");
const { resumenComprobables } = await import("../src/services/metricasComprobables.js");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await ensureSchema();
  const app = express();
  app.use(express.json());
  app.use("/api", createAdminRouter());
  await new Promise<void>((listo) => {
    server = app.listen(0, () => listo());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server?.close(r));
  await sql.end({ timeout: 5 });
  const a = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
  await a.unsafe(`drop database if exists ${BASE} with (force)`);
  await a.end();
});

describe("agrupar el export de Fénix (puro)", () => {
  it("una fila por línea → una factura por documento; sin documento o sin fecha se descarta con motivo", async () => {
    const filas = await archivo.filasDelArchivo("facturas.csv", CSV);
    const { facturas, descartadas } = archivo.agruparFacturasSubidas(filas, archivo.MAPEO_FACTURAS_DEFECTO);
    expect(facturas.map((f) => f.documento)).toEqual([
      "001-001-000101", "001-001-000102", "001-001-000103", "001-001-000104", "001-001-000105",
    ]);
    expect(facturas.find((f) => f.documento === "001-001-000103")!.lineas).toHaveLength(2);
    expect(facturas[0]).toMatchObject({ dia: "2026-11-02", hora: 10, total: 443.9, telefonos: ["991111111"], local: "Matriz" });
    expect(descartadas).toEqual([
      { fila: 8, motivo: "sin número de documento" },
      { fila: 9, motivo: 'fecha no reconocida: "sin fecha"' },
    ]);
  });
});

describe("subir facturas por el panel (HTTP + Postgres)", () => {
  it("sin Contífico ni facturas subidas, no hay fuente de facturas", async () => {
    expect(await fuenteDeFacturas()).toBeNull();
    expect((await resumenVentasConfirmadas("todos")).disponible).toBe(false);
  });

  it("POST /ventas/import guarda en facturas_importadas y enciende la fuente", async () => {
    // El chat de CLIENTE UNO empezó antes de su factura y llegó a la medida.
    await sql`
      insert into conversations (phone, name, tire_size, created_at)
      values ('593991111111', 'Cliente Uno', '235/75R15', '2026-11-01T15:00:00Z')
    `;
    const r = await fetch(`${baseUrl}/api/ventas/import?nombre=facturas-fenix-muestra.csv`, {
      method: "POST",
      headers: { "x-admin-key": ADMIN_KEY, "Content-Type": "application/octet-stream" },
      body: CSV,
    });
    const body = await r.json();
    expect(r.status, JSON.stringify(body)).toBe(200);
    expect(body.importado.facturas).toBe(5);
    expect(body.estado).toMatchObject({ facturas: 5, ultimoDia: "2026-11-04" });
    expect((await fuenteDeFacturas())?.id).toBe("archivo");
  });

  it("las líneas de llanta se leen con 33X12.5R17, 7.00R15 y LT245/75R16; los servicios no", () => {
    const llantas = facturasLeidas().flatMap((f) => f.llantas.map((l) => l.nombre));
    expect(llantas).toEqual(expect.arrayContaining([
      "LLANTA 33X12.5R17 MT", "LLANTA 7.00R15 TRACCION", "LLANTA LT245/75R16 GRABBER X3",
    ]));
    expect(llantas).not.toContain("BALANCEO");
    expect(llantas).not.toContain("VALVULA");
  });

  it("Ventas confirmadas se enciende sin Contífico y cruza por teléfono", async () => {
    const resumen = await resumenVentasConfirmadas("todos");
    expect(resumen.disponible).toBe(true);
    expect(resumen.lectura?.llave).toBe("archivo");
    expect(resumen.ventas).toBe(1);
    expect(resumen.detalle[0]).toMatchObject({
      cliente: "CLIENTE UNO", total: 443.9, dia: "2026-11-02",
      facturas: [{ documento: "001-001-000101", dia: "2026-11-02", total: 443.9, local: "Matriz" }],
    });
  });

  it("Métricas comprobables también se encienden con la fuente de archivo", async () => {
    const m = await resumenComprobables("todos");
    expect(m.disponible).toBe(true);
    expect(m.ventas.n).toBe(1);
  });

  it("volver a subir el mismo archivo no duplica facturas", async () => {
    await fetch(`${baseUrl}/api/ventas/import?nombre=facturas-fenix-muestra.csv`, {
      method: "POST",
      headers: { "x-admin-key": ADMIN_KEY, "Content-Type": "application/octet-stream" },
      body: CSV,
    });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from facturas_importadas`;
    expect(n).toBe(5);
  });
});
