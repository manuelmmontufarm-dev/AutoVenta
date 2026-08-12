#!/usr/bin/env node
// Cruza las cotizaciones del bot contra las facturas de Contifico usando el
// telefono como llave. Responde una sola pregunta: de todo lo que el bot cotizo,
// cuanto termino efectivamente facturado.
//
//   node scripts/cruce-facturas/extraer.mjs      # baja los documentos
//   node scripts/cruce-facturas/cruce.mjs        # cruza y reporta
//
// El telefono es la unica llave posible: quotes no guarda telefono (se llega por
// conversation_id) y Contifico no conoce el numero de cotizacion del bot.

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ENTRADA = path.join(AQUI, "datos", "documentos.json");
const SALIDA = path.join(AQUI, "datos", "cruce.json");

/**
 * La BD guarda el wa_id de Meta (593982801766) y Contifico el numero local
 * (0982801766). Los ultimos 9 digitos son lo unico que ambos comparten: es el
 * numero nacional sin el 0 de marcado y sin el 593.
 */
function llaveTelefono(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return digitos.length >= 9 ? digitos.slice(-9) : null;
}

/** Contifico deja varios telefonos en un solo campo, separados a mano. */
function llavesDelCliente(telefonos) {
  return [
    ...new Set(
      String(telefonos ?? "")
        .split(/[^\d]+/)
        .map(llaveTelefono)
        .filter(Boolean),
    ),
  ];
}

/** fecha_emision viene como DD/MM/YYYY. */
function aFecha(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto ?? "").trim());
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function cargarEnv() {
  const ruta = path.join(AQUI, "..", "..", ".env");
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
    if (!linea.includes("=") || linea.trim().startsWith("#")) continue;
    const i = linea.indexOf("=");
    const clave = linea.slice(0, i).trim();
    if (!process.env[clave]) process.env[clave] = linea.slice(i + 1).trim();
  }
}

async function main() {
  cargarEnv();
  if (!fs.existsSync(ENTRADA)) {
    throw new Error("Faltan los documentos. Corre primero: node scripts/cruce-facturas/extraer.mjs");
  }
  const { documentos, personas = [] } = JSON.parse(fs.readFileSync(ENTRADA, "utf8"));

  // --- Lado Contifico -------------------------------------------------------
  // FAC = factura. Lo demas (PRE proforma, CUO cuota, NCT nota de credito) no es
  // una venta facturada y no cuenta. Las anuladas tampoco.
  const facturas = documentos.filter((d) => d.tipo_documento === "FAC" && !d.anulado);

  const porTelefono = new Map();
  for (const factura of facturas) {
    for (const llave of llavesDelCliente(factura.cliente?.telefonos)) {
      if (!porTelefono.has(llave)) porTelefono.set(llave, []);
      porTelefono.get(llave).push(factura);
    }
  }

  // Cualquier documento (incluida la proforma) sirve para saber si la persona
  // existe en Contifico, aunque todavia no le hayan facturado. El padron suma los
  // clientes creados que aun no tienen ningun documento emitido.
  const conAlgunDocumento = new Set([
    ...documentos.flatMap((d) => llavesDelCliente(d.cliente?.telefonos)),
    ...personas.flatMap((p) => llavesDelCliente(p.telefonos)),
  ]);

  // --- Lado bot -------------------------------------------------------------
  const sql = postgres(process.env.DATABASE_URL, {
    ssl: process.env.PGSSL === "disable" ? false : "require",
    prepare: false,
    max: 2,
    onnotice: () => {},
  });

  const cotizados = await sql`
    select
      c.phone,
      c.name,
      count(q.id)::int              as cotizaciones,
      min(q.created_at)             as primera,
      max(q.created_at)             as ultima,
      max(q.total)::float           as mayor_total
    from quotes q
    join conversations c on c.id = q.conversation_id
    group by c.phone, c.name
    order by max(q.created_at) desc
  `;
  await sql.end();

  // --- Cruce ----------------------------------------------------------------
  const filas = cotizados.map((fila) => {
    const llave = llaveTelefono(fila.phone);
    const facturasDelTelefono = (llave && porTelefono.get(llave)) || [];
    // Solo cuenta como venta del bot la factura emitida el mismo dia de la
    // cotizacion o despues. Una factura anterior es un cliente que ya compraba.
    const diaCotizacion = new Date(fila.primera);
    diaCotizacion.setHours(0, 0, 0, 0);
    const posteriores = facturasDelTelefono.filter((f) => {
      const fecha = aFecha(f.fecha_emision);
      return fecha && fecha >= diaCotizacion;
    });
    return {
      telefono: fila.phone,
      nombre: fila.name,
      cotizaciones: fila.cotizaciones,
      primera_cotizacion: fila.primera,
      ultima_cotizacion: fila.ultima,
      mayor_total_cotizado: fila.mayor_total,
      existe_en_contifico: llave ? conAlgunDocumento.has(llave) : false,
      facturas_total: facturasDelTelefono.length,
      facturas_despues_de_cotizar: posteriores.length,
      monto_facturado_despues: Number(
        posteriores.reduce((acc, f) => acc + Number(f.total ?? 0), 0).toFixed(2),
      ),
      documentos: posteriores.map((f) => ({
        documento: f.documento,
        fecha: f.fecha_emision,
        total: Number(f.total),
        cliente: f.cliente?.razon_social ?? null,
      })),
    };
  });

  const conFacturaPosterior = filas.filter((f) => f.facturas_despues_de_cotizar > 0);
  const conFacturaAlguna = filas.filter((f) => f.facturas_total > 0);
  const enContifico = filas.filter((f) => f.existe_en_contifico);

  const resumen = {
    documentos_contifico: documentos.length,
    personas_contifico: personas.length,
    facturas_contifico: facturas.length,
    telefonos_cotizados: filas.length,
    cotizaciones: filas.reduce((a, f) => a + f.cotizaciones, 0),
    existen_en_contifico: enContifico.length,
    con_factura_alguna_vez: conFacturaAlguna.length,
    con_factura_despues_de_cotizar: conFacturaPosterior.length,
    monto_facturado_despues: Number(
      conFacturaPosterior.reduce((a, f) => a + f.monto_facturado_despues, 0).toFixed(2),
    ),
    monto_cotizado: Number(filas.reduce((a, f) => a + (f.mayor_total_cotizado ?? 0), 0).toFixed(2)),
  };

  fs.writeFileSync(SALIDA, JSON.stringify({ resumen, filas }, null, 2));

  const pct = (n) => (resumen.telefonos_cotizados ? ((n / resumen.telefonos_cotizados) * 100).toFixed(1) : "0.0");
  console.log(`
CRUCE COTIZACIONES ↔ FACTURAS CONTIFICO
────────────────────────────────────────────────────────────
Documentos en Contifico          ${resumen.documentos_contifico}
  de los cuales facturas (FAC)   ${resumen.facturas_contifico}
Personas en el padrón            ${resumen.personas_contifico}

Teléfonos cotizados por el bot   ${resumen.telefonos_cotizados}  (${resumen.cotizaciones} cotizaciones)
  existen en Contifico           ${resumen.existen_en_contifico}  (${pct(resumen.existen_en_contifico)}%)
  con factura alguna vez         ${resumen.con_factura_alguna_vez}  (${pct(resumen.con_factura_alguna_vez)}%)
  CON FACTURA TRAS COTIZAR       ${resumen.con_factura_despues_de_cotizar}  (${pct(resumen.con_factura_despues_de_cotizar)}%)

Monto cotizado                   $${resumen.monto_cotizado}
Monto facturado tras cotizar     $${resumen.monto_facturado_despues}
────────────────────────────────────────────────────────────`);

  if (conFacturaPosterior.length) {
    console.log("\nFacturados después de cotizar:");
    for (const fila of conFacturaPosterior) {
      const docs = fila.documentos.map((d) => `${d.documento} ${d.fecha} $${d.total}`).join(" | ");
      console.log(`  ${fila.telefono}  ${(fila.nombre ?? "sin nombre").slice(0, 22).padEnd(22)}  ${docs}`);
    }
  }
  console.log(`\nDetalle completo: ${SALIDA}`);
}

main().catch((err) => {
  console.error("Fallo el cruce:", err.message);
  process.exit(1);
});
