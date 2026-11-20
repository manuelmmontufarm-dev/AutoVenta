/**
 * EL CONECTOR DE FÉNIX, de punta a punta.
 *
 * Fénix corre en el servidor del cliente y no tiene API. El conector
 * (`app/conector-fenix/`) es un programa que vive en esa máquina, lee la base
 * de Fénix con consultas de SOLO LECTURA y entrega inventario y facturas al
 * bot por `/conector/*`, que los pasa por la misma importación que usa el
 * panel cuando Jenny sube el Excel a mano.
 *
 * Acá no hay un Fénix de verdad: hay una base Postgres armada con la forma que
 * suele tener un sistema contable (artículos, existencias por bodega, facturas
 * con su detalle, clientes). Lo que se prueba es todo lo que NO depende de
 * cómo se llamen las tablas del cliente: que lo leído llega bien al bot, que
 * una venta en Fénix baja el stock que el bot cotiza, que un inventario dudoso
 * no reemplaza al bueno, que el conector no puede escribir en la base ajena y
 * que su clave no abre el panel.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
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
delete process.env.CATALOG_SHEET_ID;
const ADMIN_KEY = "clave-de-prueba-del-panel-conector";
const CONECTOR_KEY = "clave-de-prueba-del-conector-fenix";
process.env.ADMIN_KEY = ADMIN_KEY;
process.env.CONECTOR_KEY = CONECTOR_KEY;
process.env.NODE_ENV = "test";

const BASE = `autoventa_conector_${process.pid}`;
const FENIX = `fenix_de_mentira_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
for (const base of [BASE, FENIX]) {
  await admin.unsafe(`drop database if exists ${base}`);
  await admin.unsafe(`create database ${base}`);
}
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { createAdminRouter } = await import("../src/server/admin.js");
const { createConectorRouter, estadoDelConector } = await import("../src/server/conector.js");
const archivo = await import("../src/services/fuentes/archivo.js");
const catalog = await import("../src/services/catalog.js");
const { fuenteDeFacturas } = await import("../src/services/fuentes/index.js");
const { facturasLeidas } = await import("../src/services/ventasConfirmadas.js");

// El conector es JavaScript suelto (corre con un node.exe en Windows, sin compilar).
// @ts-expect-error sin tipos: es .mjs
const { correrCiclo } = await import("../conector-fenix/src/ciclo.mjs");
// @ts-expect-error sin tipos: es .mjs
const { validarConfig } = await import("../conector-fenix/src/config.mjs");
// @ts-expect-error sin tipos: es .mjs
const { validarSoloLectura, conDesde, diaDeHace } = await import("../conector-fenix/src/consultas.mjs");
// @ts-expect-error sin tipos: es .mjs
const { aCsv, numeroComoTexto, tandasPorDocumento } = await import("../conector-fenix/src/csv.mjs");
// @ts-expect-error sin tipos: es .mjs
const { buscarValor, listarTablas, muestraDeTabla } = await import("../conector-fenix/src/explorar.mjs");
// @ts-expect-error sin tipos: es .mjs
const { abrirMotor } = await import("../conector-fenix/src/motores/index.mjs");

/** El «Fénix» de la prueba: nombres de tabla y columna como los de un sistema contable cualquiera. */
const fenix = postgres(`postgresql://manue@localhost/${FENIX}`, { prepare: false, max: 1, onnotice: () => undefined });

const LLANTAS: Array<[string, string, string, number, number, number, number]> = [
  // código, nombre, categoría, A, B, C, D
  ["A0100", "HAIDA 235/75R15LT AT HD818 LN 10PR", "LLANTAS RIN 15 CAMIONETA", 139.99, 125, 118, 112],
  ["A0101", "KENDA 235/75R15LT KR29 MT 6PR", "LLANTAS RIN 15 CAMIONETA", 161, 150, 140, 135],
  ["A0102", "FALKEN 205/65R15 SN832 94H", "LLANTAS RIN 15", 96, 92, 88, 80],
  ["A0103", "WINRUN 185/65R15 R330 88H", "LLANTAS RIN 15", 58, 55, 52, 47],
  ["A0104", "MAXXIS 195/55R15 MAP5 85V", "LLANTAS RIN 15", 84, 80, 76, 70],
  ["A0105", "KENDA 205/55R16 KR203 91V", "LLANTAS RIN 16", 92, 88, 84, 78],
  ["A0106", "FALKEN 215/60R16 ZE310 95H", "LLANTAS RIN 16", 118, 112, 108, 99],
  ["A0107", "WINRUN 265/70R16 MAXCLAW AT", "LLANTAS RIN 16", 132, 126, 120, 110],
  ["A0108", "MAXXIS 225/45R17 VS5 94Y", "LLANTAS RIN 17", 149, 142, 136, 125],
  ["A0109", "KENDA 265/65R17 KR28 AT", "LLANTAS RIN 17", 171, 163, 156, 144],
  ["A0110", "FALKEN 225/65R17 AT3W 102H", "LLANTAS RIN 17", 188, 180, 172, 160],
  ["A0111", "HAIDA 245/70R16 HD828 AT", "LLANTAS RIN 16", 121, 115, 110, 101],
];

async function armarFenix() {
  await fenix.unsafe(`
    create table inv_articulo (
      art_codigo char(10) primary key, art_nombre varchar(120) not null, cat_nombre varchar(60),
      art_precio_a numeric(14,4), art_precio_b numeric(14,4), art_precio_c numeric(14,4), art_precio_d numeric(14,4),
      art_activo boolean default true
    );
    create table inv_existencia (art_codigo char(10), bod_codigo int, exi_cantidad numeric(12,3));
    create table ven_cliente (cli_codigo int primary key, cli_nombre varchar(120), cli_telefono varchar(30));
    create table ven_factura (
      fac_numero varchar(20) primary key, fac_fecha timestamp not null, cli_codigo int,
      fac_subtotal numeric(14,2), fac_total numeric(14,2), fac_anulada boolean default false, bod_nombre varchar(40)
    );
    create table ven_factura_det (fac_numero varchar(20), art_codigo char(10), det_cantidad numeric(12,3), det_precio numeric(14,4));
  `);
  for (const [codigo, nombre, categoria, a, b, c, d] of LLANTAS) {
    await fenix`insert into inv_articulo values (${codigo}, ${nombre}, ${categoria}, ${a}, ${b}, ${c}, ${d})`;
    // Dos bodegas: el stock que cotiza el bot es la suma (Jenny, 18-nov: un solo stock grande).
    await fenix`insert into inv_existencia values (${codigo}, 1, 6), (${codigo}, 2, 2)`;
  }
  await fenix`insert into ven_cliente values (1, 'CLIENTE UNO', '0991111111'), (2, 'CLIENTE DOS', '593 99 222 2222'), (3, 'CONSUMIDOR FINAL', null)`;
}

/** Una factura en «Fénix», con sus líneas. `haceDias` = cuándo se emitió. */
async function facturar(numero: string, haceDias: number, cliente: number, lineas: Array<[string, number, number]>, anulada = false) {
  const subtotal = lineas.reduce((s, [, cantidad, precio]) => s + cantidad * precio, 0);
  await fenix`
    insert into ven_factura values (
      ${numero}, date_trunc('day', now()) - ${haceDias} * interval '1 day' + interval '10 hours 15 minutes',
      ${cliente}, ${subtotal}, ${Math.round(subtotal * 115) / 100}, ${anulada}, 'COMPE'
    )
  `;
  for (const [codigo, cantidad, precio] of lineas) {
    await fenix`insert into ven_factura_det values (${numero}, ${codigo}, ${cantidad}, ${precio})`;
    await fenix`update inv_existencia set exi_cantidad = exi_cantidad - ${cantidad} where art_codigo = ${codigo} and bod_codigo = 1`;
  }
}

/** Lo que una persona escribiría en config.json después de mirar las tablas del cliente. */
const SQL_INVENTARIO = `
  select a.art_codigo as "código", a.art_nombre as "articulo", a.cat_nombre as "categoria",
         a.art_precio_a as "precio a", a.art_precio_b as "precio b", a.art_precio_c as "precio c", a.art_precio_d as "precio d",
         coalesce(sum(e.exi_cantidad), 0) as "existencia"
  from inv_articulo a
  left join inv_existencia e on e.art_codigo = a.art_codigo
  where a.art_activo
  group by a.art_codigo, a.art_nombre, a.cat_nombre, a.art_precio_a, a.art_precio_b, a.art_precio_c, a.art_precio_d
  order by a.art_codigo
`;
const SQL_FACTURAS = `
  select f.fac_numero as "num factura", to_char(f.fac_fecha, 'YYYY-MM-DD') as "fecha", to_char(f.fac_fecha, 'HH24:MI') as "hora",
         f.fac_total as "total", f.fac_subtotal as "subtotal", c.cli_nombre as "cliente", c.cli_telefono as "telefono",
         'LLANTA ' || a.art_nombre as "producto", d.det_cantidad as "cantidad", d.det_precio as "precio", f.bod_nombre as "local"
  from ven_factura f
  join ven_factura_det d on d.fac_numero = f.fac_numero
  join inv_articulo a on a.art_codigo = d.art_codigo
  left join ven_cliente c on c.cli_codigo = f.cli_codigo
  where f.fac_fecha >= {desde} and not f.fac_anulada
`;

let server: Server;
let baseUrl: string;
let config: Record<string, any>;
const sinEspera = { opcionesDeEnvio: { intentos: 1, pausaMs: 1 } };

const pedir = (ruta: string, headers: Record<string, string> = {}, init: RequestInit = {}) =>
  fetch(`${baseUrl}${ruta}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });

beforeAll(async () => {
  await ensureSchema();
  await armarFenix();
  const app = express();
  app.use("/api", createAdminRouter());
  app.use("/conector", createConectorRouter());
  await new Promise<void>((listo) => {
    server = app.listen(0, () => listo());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config = validarConfig({
    servidor: baseUrl,
    clave: CONECTOR_KEY,
    motor: "postgres",
    conexion: { host: "localhost", puerto: 5432, base: FENIX, usuario: "manue", clave: "secreto-de-la-base" },
    inventario: { sql: SQL_INVENTARIO },
    facturas: { sql: SQL_FACTURAS, dias: 3 },
  });
});

afterAll(async () => {
  await new Promise((r) => server?.close(r));
  await sql.end({ timeout: 5 });
  await fenix.end({ timeout: 5 });
  const a = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
  for (const base of [BASE, FENIX]) await a.unsafe(`drop database if exists ${base} with (force)`);
  await a.end();
});

describe("solo lectura: la consulta de config.json no puede escribir en Fénix", () => {
  it.each([
    "select * from articulos",
    "  SELECT a.codigo, a.update_fecha from articulos a where a.nombre <> 'delete'  ;",
    "with t as (select 1 as x) select x from t",
    'select [set] as "into" from articulos -- drop table articulos',
  ])("acepta %s", (consulta) => {
    expect(() => validarSoloLectura(consulta)).not.toThrow();
  });

  it.each([
    ["update articulos set precio = 1", /empezar con SELECT/],
    ["select 1; delete from articulos", /más de una instrucción/],
    ["select * into copia from articulos", /INTO/],
    ["with x as (delete from articulos returning *) select * from x", /DELETE/],
    ["select * from articulos; ", null],
    ["exec sp_borrar_todo", /empezar con SELECT/],
    ["", /vacía/],
  ])("%s", (consulta, motivo) => {
    if (motivo) expect(() => validarSoloLectura(consulta)).toThrow(motivo);
    else expect(validarSoloLectura(consulta)).toBe("select * from articulos");
  });

  it("y aunque alguien se salte esa revisión, la base rechaza la escritura", async () => {
    const motor = await abrirMotor(config);
    try {
      await expect(motor.consultar("update inv_articulo set art_precio_a = 1")).rejects.toThrow(/read-only/);
      await expect(motor.consultar("delete from ven_factura")).rejects.toThrow(/read-only/);
      const { filas } = await motor.consultar("select art_precio_a from inv_articulo where art_codigo = 'A0100'");
      expect(filas[0][0]).toBe("139.99");
    } finally {
      await motor.cerrar();
    }
  });

  it("la fecha {desde} es obligatoria en las facturas y se escribe como texto fijo", () => {
    expect(conDesde("select 1 where fecha >= {desde}", "2026-11-17")).toBe("select 1 where fecha >= '2026-11-17'");
    expect(() => conDesde("select 1", "2026-11-17")).toThrow(/\{desde\}/);
    expect(() => conDesde("select 1 where f >= {desde}", "'; drop table x; --")).toThrow(/inválida/);
    expect(diaDeHace(3, new Date(2026, 10, 20, 9, 0))).toBe("2026-11-17");
    expect(diaDeHace(25, new Date(2026, 10, 20, 23, 59))).toBe("2026-10-26");
  });
});

describe("config.json: los errores se dicen en una frase", () => {
  const buena = () => ({
    servidor: "https://ejemplo.up.railway.app/", clave: CONECTOR_KEY, motor: "postgres",
    conexion: { base: "fenix" }, inventario: { sql: "select 1" }, facturas: { sql: "select 1 where f >= {desde}" },
  });
  it("una buena pasa, con 3 días de facturas por defecto y sin la barra final", () => {
    const c = validarConfig(buena());
    expect(c.servidor).toBe("https://ejemplo.up.railway.app");
    expect(c.facturas).toMatchObject({ dias: 3, columnaDocumento: "num factura" });
  });
  it.each([
    [{ servidor: "http://ejemplo.com" }, /https/],
    [{ clave: "corta" }, /CONECTOR_KEY/],
    [{ motor: "oracle" }, /motor/],
    [{ inventario: { sql: "delete from x" } }, /inventario tiene que empezar con SELECT/],
    [{ facturas: { sql: "select 1" } }, /\{desde\}/],
  ])("%j", (cambio, motivo) => {
    expect(() => validarConfig({ ...buena(), ...cambio })).toThrow(motivo);
  });
  it("se puede prender solo el inventario", () => {
    expect(validarConfig({ ...buena(), facturas: { activo: false } }).facturas).toBeNull();
  });
});

describe("de la base al CSV sin que un número se lea mal", () => {
  it.each([
    ["4.000", "4"], ["139.9900", "139.99"], ["12.345", "12.3450"], ["0.125", "0.1250"],
    ["1500.5", "1500.5"], ["-2.000", "-2"], ["17", "17"], ["A0100", "A0100"], ["", ""],
  ])("%s → %s", (crudo, esperado) => {
    expect(numeroComoTexto(crudo)).toBe(esperado);
  });

  it("lo que sale del conector, el lector del bot lo lee con el mismo valor", () => {
    for (const crudo of ["4.000", "139.9900", "12.345", "1.500", "1234.000", "999.990"]) {
      expect(archivo.numeroDelArchivo(numeroComoTexto(crudo)), crudo).toBe(Number(crudo));
    }
    // Sin ese cuidado, un stock de 4 guardado con tres decimales serían cuatro mil llantas.
    expect(archivo.numeroDelArchivo("4.000")).toBe(4000);
  });

  it("comas, comillas y saltos de línea dentro de un nombre no rompen el CSV", async () => {
    const csv = aCsv(["código", "articulo"], [["A1 ", 'LLANTA 7.50R16, "LISA"\n14PR'], [null, new Date(2026, 10, 20, 0, 0, 0)]]);
    expect(csv).toBe('código,articulo\nA1,"LLANTA 7.50R16, ""LISA"" 14PR"\n,2026-11-20\n');
    const filas = await archivo.filasDelArchivo("x.csv", Buffer.from(csv));
    expect(filas[0]).toMatchObject({ "código": "A1", articulo: 'LLANTA 7.50R16, "LISA" 14PR' });
  });

  it("una factura nunca queda partida entre dos envíos", () => {
    const filas = ["F1", "F1", "F2", "F2", "F2", "F3", "F4"].map((d, i) => [d, i]);
    const tandas = tandasPorDocumento(filas, 0, 3) as unknown[][][];
    expect(tandas.map((t) => t.map((f) => f[0]))).toEqual([["F1", "F1", "F2", "F2", "F2"], ["F3", "F4"]]);
    expect(tandas.flat()).toHaveLength(filas.length);
  });
});

describe("la puerta del conector tiene su propia clave", () => {
  it("sin clave o con otra clave no entra; la del panel tampoco sirve acá", async () => {
    expect((await pedir("/conector/estado")).status).toBe(401);
    expect((await pedir("/conector/estado", { "x-conector-key": "otra-clave-cualquiera-de-largo" })).status).toBe(401);
    expect((await pedir("/conector/estado", { "x-conector-key": ADMIN_KEY, "x-admin-key": ADMIN_KEY })).status).toBe(401);
    expect((await pedir("/conector/estado", { "x-conector-key": CONECTOR_KEY })).status).toBe(200);
  });

  it("la clave del conector NO abre el panel: desde el servidor del cliente no se lee un chat ni un ajuste", async () => {
    for (const ruta of ["/api/catalog/archivo", "/api/catalog/mapeo", "/api/ventas/archivo"]) {
      const r = await pedir(ruta, { "x-admin-key": CONECTOR_KEY, "x-conector-key": CONECTOR_KEY, Authorization: `Bearer ${CONECTOR_KEY}` });
      expect(r.status, ruta).toBe(401);
    }
  });

  it("un servicio sin CONECTOR_KEY (Depot) contesta 404 a todo", async () => {
    delete process.env.CONECTOR_KEY;
    try {
      expect((await pedir("/conector/estado", { "x-conector-key": CONECTOR_KEY })).status).toBe(404);
      expect((await pedir("/conector/inventario", { "x-conector-key": "" }, { method: "POST", body: "a,b\n1,2\n" })).status).toBe(404);
    } finally {
      process.env.CONECTOR_KEY = CONECTOR_KEY;
    }
  });
});

describe("--probar: se ve qué pasaría sin tocar el catálogo del bot", () => {
  it("el bot cuenta lo que leería y no guarda nada", async () => {
    await facturar("001-001-000101", 1, 1, [["A0100", 4, 121.73]]);
    const r = await correrCiclo(config, { ensayo: true, ...sinEspera });
    expect(r.error).toBeUndefined();
    expect(r.inventario.cuerpo).toMatchObject({ ok: true, ensayo: true, llantas: 12, aros: 0, decision: { tipo: "ok" }, faltantes: [] });
    // 12 llantas × 8 unidades, menos las 4 de la factura.
    expect(r.inventario.cuerpo.unidades).toBe(92);
    expect(r.facturas.cuerpo).toMatchObject({ ok: true, ensayo: true, facturas: 1, conTelefono: 1, conLlantas: 1 });
    expect(await archivo.hayCatalogoArchivo()).toBe(false);
    expect(await archivo.hayFacturasImportadas()).toBe(false);
    expect(await estadoDelConector()).toBeNull();
  });

  it("si a la consulta le falta una columna, el ensayo dice cuál", async () => {
    const sinStock = validarConfig({ ...config, inventario: { sql: SQL_INVENTARIO.replace('as "existencia"', 'as "saldo"') }, facturas: { activo: false } });
    const r = await correrCiclo(sinStock, { ensayo: true, ...sinEspera });
    expect(r.inventario.cuerpo.decision.tipo).toBe("rechazar");
    expect(r.inventario.cuerpo.faltantes.join(" ")).toMatch(/columna del stock \(«existencia»\)/);
  });
});

describe("una pasada de verdad: Fénix → bot", () => {
  it("el inventario queda cargado y el bot cotiza con él", async () => {
    const mensajes: string[] = [];
    const r = await correrCiclo(config, { estado: {}, log: (m: string) => mensajes.push(m), ...sinEspera });
    expect(r, mensajes.join("\n")).toMatchObject({ ok: true });
    expect(catalog.catalogStatus()).toMatchObject({ items: 12, source: "archivo", error: null });
    const haida = catalog.findByCode("A0100")!;
    expect(haida).toMatchObject({ brand: "HAIDA", stock: 4 }); // 8 menos las 4 facturadas
    // Precio A ya trae IVA (mapeo por defecto de Fénix): al cliente se le cotiza ese.
    expect(haida.customerPriceWithTax).toBeCloseTo(139.99, 2);
    expect(catalog.findByCode("A0105")!.stock).toBe(8); // 6 + 2: se suman las dos bodegas
  });

  it("las facturas llegan con teléfono, hora y local, y encienden la fuente de facturas", async () => {
    expect((await fuenteDeFacturas())?.id).toBe("archivo");
    // Las facturas se leen desde el primer chat: sin chats no hay nada que cruzar.
    await sql`insert into conversations (phone, name, tire_size, created_at) values ('593991111111', 'Cliente Uno', '235/75R15', now() - interval '5 days')`;
    await correrCiclo(config, { estado: {}, ...sinEspera });
    const [f] = await sql<any[]>`select * from facturas_importadas`;
    expect(f).toMatchObject({ documento: "001-001-000101", hora: 10, cliente: "CLIENTE UNO", telefonos: ["991111111"], local: "COMPE" });
    expect(Number(f.total)).toBeCloseTo(559.96, 2);
    expect(f.lineas).toEqual([{ nombre: "LLANTA HAIDA 235/75R15LT AT HD818 LN 10PR", cantidad: 4, precio: 121.73 }]);
    expect(facturasLeidas().map((x) => x.documento)).toEqual(["001-001-000101"]);
  });

  it("el panel ve que el conector está vivo y cómo le fue", async () => {
    const r = await pedir("/api/catalog/archivo", { "x-admin-key": ADMIN_KEY });
    const body = await r.json();
    expect(body.porArchivo).toBe(true);
    expect(body.archivo).toMatchObject({ nombreArchivo: "fenix-inventario.csv", llantas: 12, unidades: 92 });
    expect(body.conector).toMatchObject({
      inventario: { ok: true, mensaje: "Sin cambios (12 llantas)" },
      facturas: { ok: true, mensaje: "1 facturas recibidas" },
      error: null,
      version: "1.0.0",
    });
    expect(body.conector.equipo).toBeTruthy();
  });
});

describe("las pasadas siguientes", () => {
  const estado: Record<string, unknown> = {};

  it("sin cambios en Fénix no se recarga nada, pero consta que el inventario está al día", async () => {
    await correrCiclo(config, { estado, ...sinEspera });
    const antes = (await archivo.estadoCatalogoArchivo())!.subidoEn;
    await new Promise((r) => setTimeout(r, 15));
    const mensajes: string[] = [];
    const r = await correrCiclo(config, { estado, log: (m: string) => mensajes.push(m), ...sinEspera });
    expect(r.ok).toBe(true);
    expect(r.inventario.cuerpo).toMatchObject({ sinCambios: true, llantas: 12 });
    expect(mensajes).toContain("Inventario: sin cambios.");
    expect(mensajes).toContain("Facturas: sin cambios.");
    const despues = (await archivo.estadoCatalogoArchivo())!.subidoEn;
    expect(new Date(despues).getTime()).toBeGreaterThan(new Date(antes).getTime());
    expect((await estadoDelConector())!.inventario).toMatchObject({ ok: true, mensaje: "Sin cambios (12 llantas)" });
  });

  it("se vende en el local → en la pasada siguiente el bot ya cotiza con el stock nuevo y ve la factura", async () => {
    expect(catalog.findByCode("A0102")!.stock).toBe(8);
    await facturar("001-001-000102", 0, 2, [["A0102", 4, 83.48], ["A0103", 2, 50.43]]);
    const r = await correrCiclo(config, { estado, ...sinEspera });
    expect(r.ok).toBe(true);
    expect(catalog.findByCode("A0102")!.stock).toBe(4);
    expect(catalog.findByCode("A0103")!.stock).toBe(6);
    const filas = await sql<any[]>`select documento, telefonos, jsonb_array_length(lineas) as n from facturas_importadas order by documento`;
    expect(filas).toEqual([
      { documento: "001-001-000101", telefonos: ["991111111"], n: 1 },
      { documento: "001-001-000102", telefonos: ["992222222"], n: 2 },
    ]);
  });

  it("una factura anulada en Fénix no se manda; una sin teléfono llega igual (no se cruza con ningún chat)", async () => {
    await facturar("001-001-000103", 0, 3, [["A0104", 1, 73.04]]);
    await facturar("001-001-000104", 0, 1, [["A0105", 4, 80]], true);
    await correrCiclo(config, { estado, ...sinEspera });
    const filas = await sql<any[]>`select documento, telefonos from facturas_importadas order by documento`;
    expect(filas.map((f) => f.documento)).toEqual(["001-001-000101", "001-001-000102", "001-001-000103"]);
    expect(filas[2].telefonos).toEqual([]);
  });

  it("las facturas viejas quedan fuera de la ventana de 3 días; --historial las trae", async () => {
    await facturar("001-001-000090", 20, 1, [["A0106", 2, 102.6]]);
    await correrCiclo(config, { estado, ...sinEspera });
    expect(await sql`select 1 from facturas_importadas where documento = '001-001-000090'`).toHaveLength(0);
    await correrCiclo(config, { estado: {}, dias: 60, ...sinEspera });
    expect(await sql`select 1 from facturas_importadas where documento = '001-001-000090'`).toHaveLength(1);
  });
});

describe("cuando algo sale mal, el catálogo bueno sigue vivo y nos enteramos", () => {
  it("la consulta devuelve un tercio del inventario (una actualización de Fénix movió algo) → no se carga solo", async () => {
    const antes = catalog.catalogStatus().items;
    await fenix`update inv_articulo set art_activo = false where art_codigo > 'A0103'`;
    try {
      const mensajes: string[] = [];
      const r = await correrCiclo(config, { estado: {}, log: (m: string) => mensajes.push(m), ...sinEspera });
      expect(r.ok).toBe(false);
      expect(r.inventario.status).toBe(409);
      expect(r.inventario.cuerpo).toMatchObject({ ok: false, confirmable: true });
      expect(r.inventario.cuerpo.error).toMatch(/trae 4 llantas y el cargado tiene 12/);
      expect(catalog.catalogStatus().items).toBe(antes);
      expect(catalog.findByCode("A0110")).toBeTruthy();
      expect((await estadoDelConector())!.inventario).toMatchObject({ ok: false });
      expect(mensajes.join("\n")).toMatch(/Inventario NO cargado \(409\)/);
    } finally {
      await fenix`update inv_articulo set art_activo = true`;
    }
  });

  it("la consulta no devuelve nada → error, y no se manda un inventario vacío", async () => {
    await fenix`update inv_articulo set art_activo = false`;
    try {
      const r = await correrCiclo(config, { estado: {}, ...sinEspera });
      expect(r).toMatchObject({ ok: false, error: "La consulta de inventario no devolvió ninguna fila." });
      expect(catalog.catalogStatus().items).toBe(12);
      expect((await estadoDelConector())!.error).toMatchObject({ mensaje: "La consulta de inventario no devolvió ninguna fila." });
    } finally {
      await fenix`update inv_articulo set art_activo = true`;
    }
  });

  it("Fénix apagado o la clave cambiada → el bot lo sabe, y el mensaje no lleva la clave de la base", async () => {
    const rota = { ...config, conexion: { ...config.conexion, base: `${FENIX}_no_existe_secreto-de-la-base` } };
    const r = await correrCiclo(rota, { estado: {}, ...sinEspera });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/does not exist/);
    expect(r.error).not.toContain("secreto-de-la-base");
    const estado = (await estadoDelConector())!;
    expect(estado.error!.mensaje).toBe(r.error);
    expect(catalog.catalogStatus().items).toBe(12);
  });

  it("cuando vuelve, el error se limpia solo", async () => {
    const r = await correrCiclo(config, { estado: {}, ...sinEspera });
    expect(r.ok).toBe(true);
    expect((await estadoDelConector())!.error).toBeNull();
  });

  it("el bot caído no rompe nada del lado del cliente: el conector lo cuenta y sale", async () => {
    const mensajes: string[] = [];
    const r = await correrCiclo({ ...config, servidor: "http://127.0.0.1:9" }, { estado: {}, log: (m: string) => mensajes.push(m), ...sinEspera });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No pude llegar al bot/);
    expect(r.error).not.toContain(CONECTOR_KEY);
  });
});

describe("explorar: encontrar las tablas de un Fénix que nadie nos documentó", () => {
  it("lista las tablas con sus columnas, primero las que parecen de artículos y facturas", async () => {
    const motor = await abrirMotor(config);
    try {
      const tablas = await listarTablas(motor);
      expect(tablas.map((t: any) => t.tabla).sort()).toEqual(["inv_articulo", "inv_existencia", "ven_cliente", "ven_factura", "ven_factura_det"]);
      const articulo = tablas.find((t: any) => t.tabla === "inv_articulo");
      expect(articulo.columnas.map((c: any) => c.nombre)).toContain("art_precio_a");
    } finally {
      await motor.cerrar();
    }
  });

  it("--buscar dice en qué tabla y columna está un código que se ve en la pantalla de Fénix", async () => {
    const motor = await abrirMotor(config);
    try {
      const deCodigo = await buscarValor(motor, "A0107");
      expect(deCodigo.map((h: any) => `${h.tabla}.${h.columna}`).sort()).toEqual(["public.inv_articulo.art_codigo", "public.inv_existencia.art_codigo"]);
      const deFactura = await buscarValor(motor, "001-001-000102");
      expect(deFactura.map((h: any) => `${h.tabla}.${h.columna}`).sort()).toEqual(["public.ven_factura.fac_numero", "public.ven_factura_det.fac_numero"]);
      expect(await buscarValor(motor, "100%_no'existe")).toEqual([]);
      const { columnas, filas } = await muestraDeTabla(motor, "ven_cliente", 2);
      expect(columnas).toEqual(["cli_codigo", "cli_nombre", "cli_telefono"]);
      expect(filas).toHaveLength(2);
    } finally {
      await motor.cerrar();
    }
  });
});

describe("el programa, lanzado como lo lanza el Programador de tareas de Windows", () => {
  const ENTRADA = fileURLToPath(new URL("../conector-fenix/src/entrada.mjs", import.meta.url));
  let carpeta: string;
  const correr = (...args: string[]) =>
    new Promise<{ codigo: number; salida: string }>((listo) => {
      execFile(process.execPath, [ENTRADA, "--config", path.join(carpeta, "config.json"), ...args], { timeout: 60_000 }, (error, stdout, stderr) => {
        listo({ codigo: error ? Number((error as any).code ?? 1) : 0, salida: `${stdout}${stderr}` });
      });
    });

  beforeAll(() => {
    carpeta = mkdtempSync(path.join(tmpdir(), "conector-fenix-"));
    writeFileSync(path.join(carpeta, "config.json"), JSON.stringify({
      servidor: baseUrl, clave: CONECTOR_KEY, motor: "postgres",
      conexion: { host: "localhost", puerto: 5432, base: FENIX, usuario: "manue", clave: "" },
      inventario: { sql: SQL_INVENTARIO }, facturas: { sql: SQL_FACTURAS, dias: 3 },
    }));
  });
  afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

  it("--probar cuenta en palabras lo que el bot leería y avisa que no guardó nada", async () => {
    const antes = (await archivo.estadoCatalogoArchivo())!.subidoEn;
    const { codigo, salida } = await correr("--probar");
    expect(codigo, salida).toBe(0);
    expect(salida).toMatch(/Conexión con el bot: bien/);
    expect(salida).toMatch(/Columnas: código, articulo, categoria, precio a, precio b, precio c, precio d, existencia/);
    expect(salida).toMatch(/El bot leería 12 llantas y 0 aros/);
    expect(salida).toMatch(/→ Se cargaría sin preguntar\./);
    expect(salida).toMatch(/El bot leería \d+ facturas .*: \d+ con teléfono, \d+ con llantas\./);
    expect(salida).toMatch(/Esto fue un ensayo: no se guardó nada en el bot\./);
    expect((await archivo.estadoCatalogoArchivo())!.subidoEn).toBe(antes);
  });

  it("una pasada normal sale con 0, deja su registro y recuerda qué facturas ya mandó", async () => {
    const primera = await correr();
    expect(primera.codigo, primera.salida).toBe(0);
    const segunda = await correr();
    expect(segunda.codigo, segunda.salida).toBe(0);
    const log = readFileSync(path.join(carpeta, "conector.log"), "utf8");
    expect(log).toMatch(/Inventario: 12 filas leídas de Fénix\./);
    expect(log).toMatch(/Facturas: sin cambios\./);
    expect(JSON.parse(readFileSync(path.join(carpeta, "estado.json"), "utf8"))).toMatchObject({ ok: true });
  });

  it("con la clave del conector mal puesta, --probar lo dice y sale con error", async () => {
    writeFileSync(path.join(carpeta, "mala.json"), JSON.stringify({
      servidor: baseUrl, clave: "esta-no-es-la-clave-del-conector", motor: "postgres",
      conexion: { base: FENIX, usuario: "manue" }, inventario: { sql: SQL_INVENTARIO },
    }));
    const r = await new Promise<{ codigo: number; salida: string }>((listo) => {
      execFile(process.execPath, [ENTRADA, "--config", path.join(carpeta, "mala.json"), "--probar"], (error, stdout) => {
        listo({ codigo: error ? Number((error as any).code ?? 1) : 0, salida: stdout });
      });
    });
    expect(r.codigo).toBe(1);
    expect(r.salida).toMatch(/El bot no aceptó la clave \(401\)/);
  });

  it("un config.json con una consulta que escribe no llega a correr", async () => {
    writeFileSync(path.join(carpeta, "config.json"), JSON.stringify({
      servidor: baseUrl, clave: CONECTOR_KEY, motor: "postgres", conexion: { base: FENIX, usuario: "manue" },
      inventario: { sql: "update inv_articulo set art_precio_a = 0" },
    }));
    const { codigo, salida } = await correr();
    expect(codigo).toBe(2);
    expect(salida).toMatch(/inventario tiene que empezar con SELECT/);
    const [{ a }] = await fenix`select art_precio_a as a from inv_articulo where art_codigo = 'A0100'`;
    expect(Number(a)).toBe(139.99);
  });
});
