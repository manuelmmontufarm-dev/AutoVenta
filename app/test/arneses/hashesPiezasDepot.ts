/**
 * ARNÉS: LAS PIEZAS Y TEXTOS DE DEPOT, EN SHA256.
 *
 * Renderiza con el perfil de Depot (`NEGOCIO` sin definir), fecha fija y un
 * catálogo de muestra fijo las 7 piezas que ve el cliente (cotización clásica
 * y día y noche en los dos modos, comparativa, opciones clásica y día y noche,
 * guía de medida), 5 mensajes en texto y la garantía de 4 marcas, y devuelve el
 * sha256 de cada salida.
 *
 * Existe para cumplir la regla número uno del plan multicliente —Depot sale
 * byte a byte igual— con algo que se pueda re-correr, no con una captura. La
 * línea base (`hashes-depot.json`) se sacó de `origin/main` = `dc50dab`, antes
 * de cualquier cambio multicliente; `test/hashesPiezasDepot.test.ts` la vigila.
 *
 * Uso suelto, para comparar dos checkouts:
 *   npx tsx test/arneses/hashesPiezasDepot.ts salida.json [--raiz <app de otro checkout>]
 *
 * Si un cambio le cambia una pieza a Depot A PROPÓSITO (aprobado por el
 * cliente), se regenera la línea base en el mismo commit y se dice en el PR.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** El `app/` de este checkout. */
const APP_PROPIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const FECHA_DE_LAS_MUESTRAS = "04 / 11 / 2026";

const sha = (contenido: Buffer | string) => createHash("sha256").update(contenido).digest("hex");

/**
 * Los hashes de Depot del `app/` dado (por defecto, este). El entorno tiene
 * que estar puesto ANTES de llamarla: los módulos leen `NEGOCIO` y la config
 * al importarse.
 */
export async function hashesDePiezasDepot(raizApp = APP_PROPIO): Promise<Record<string, string>> {
  const desde = (relativo: string) => import(pathToFileURL(path.join(raizApp, relativo)).href);
  const { renderQuoteImage, renderCompareImage, renderOptionsImage, renderMedidaGuideImage, toRenderLine } =
    await desde("src/render/quoteImage.ts");
  const { normalizeContificoProduct } = await desde("src/domain/catalog.ts");
  const qm = await desde("src/services/quoteMessages.ts");

  const producto = (codigo: string, nombre: string, marca: string, pvp1: number, stock: number) =>
    normalizeContificoProduct(
      { id: codigo, codigo, nombre, marca_nombre: marca, estado: "A", tipo: "P", pvp1, porcentaje_iva: 15, cantidad_stock: stock },
      "pvp1",
    );
  // Las tres marcas de Depot y una que no tiene en la tabla de garantías.
  const catalogo = [
    producto("AZENIS", "205/55R16 91W AZENIS FK510", "FALKEN", 84.2, 3),
    producto("KR203", "205/55R16 91V KOMET PLUS KR203", "KENDA", 55.5, 14),
    producto("R380", "205/55R16 91V R380 WINRUN", "WINRUN", 43.0, 9),
    producto("GENERICA", "205/55R16 91V UHP X", "SAILUN", 39.0, 5),
  ];
  const lineas = await Promise.all(catalogo.map((p) => toRenderLine(p, 4)));
  const fecha = FECHA_DE_LAS_MUESTRAS;
  // El reloj de las piezas, FUERA de toda promo de temporada: el sello de la
  // vitrina de Black Friday (nov-2026) sale solo en sus fechas, y esta línea
  // base es la de Depot sin promo. Sin fijarlo, el hash cambiaría según el mes.
  const ahora = new Date("2026-10-15T12:00:00-05:00");
  const cotizacion = { number: "COT-BASE", dateLabel: fecha, lines: [lineas[0]], subtotal: 292.87, iva: 43.93, total: 336.8 };
  const opciones = { dateLabel: fecha, sizeLabel: "205/55R16", products: lineas, cantidad: 4, codigoRecomendado: catalogo[1].code, ahora };

  const salida: Record<string, string> = {};
  salida["cotizacion-clasica"] = sha(await renderQuoteImage({ ...cotizacion, benefits: ["Instalación completa"] }));
  salida["cotizacion-dianoche-dia"] = sha(await renderQuoteImage({ ...cotizacion, plantilla: "diaNoche", modo: "dia" }));
  salida["cotizacion-dianoche-noche"] = sha(await renderQuoteImage({ ...cotizacion, plantilla: "diaNoche", modo: "noche" }));
  salida["comparativa"] = sha(await renderCompareImage({ dateLabel: fecha, products: lineas.slice(0, 3), ahora }));
  salida["opciones"] = sha(await renderOptionsImage(opciones));
  salida["opciones-dianoche-dia"] = sha(await renderOptionsImage({ ...opciones, plantilla: "diaNoche", modo: "dia" }));
  salida["guia-medida"] = sha(await renderMedidaGuideImage({ dateLabel: fecha }));

  salida["texto-comparativa"] = sha(qm.buildComparisonMessageDetallado(catalogo.slice(0, 3)));
  salida["texto-cotizacion"] = sha(qm.buildSingleQuoteMessageDetallado({ product: catalogo[0], quantity: 4 }));
  salida["texto-cotizacion-descuento"] = sha(qm.buildSingleQuoteMessageDetallado(
    { product: catalogo[1], quantity: 4 }, "",
    { amount: 10, finalTotal: 245, condition: "pago en efectivo", expiresAt: new Date("2026-11-06T22:00:00Z") },
  ));
  salida["texto-opciones-sailun"] = sha(qm.buildCustomerOptionsMessageDetallado([catalogo[3]]));
  salida["texto-opciones-detallado"] = sha(qm.buildCustomerOptionsMessageDetallado(catalogo));
  for (const marca of ["FALKEN", "Kenda", "winrun", "SAILUN"]) {
    salida[`garantia-${marca}`] = sha(JSON.stringify(qm.warrantyForBrand(marca)));
  }
  return salida;
}

/** El entorno de mentira que piden `config.ts` y `db/client.ts` al cargar, con Depot. */
export function entornoDeDepot(): void {
  for (const clave of ["OPENAI_API_KEY", "WHATSAPP_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_PHONE_ID", "SELLER_PHONE"]) {
    process.env[clave] ||= "test";
  }
  process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
  delete process.env.NEGOCIO;
}

// Uso suelto por línea de comandos.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  entornoDeDepot();
  const args = process.argv.slice(2);
  const iRaiz = args.indexOf("--raiz");
  const raiz = iRaiz >= 0 ? path.resolve(args[iRaiz + 1]) : APP_PROPIO;
  const archivo = args.find((a, i) => !a.startsWith("--") && i !== iRaiz + 1) ?? "hashes-depot.json";
  const hashes = await hashesDePiezasDepot(raiz);
  writeFileSync(archivo, `${JSON.stringify(hashes, null, 2)}\n`);
  console.log(`${Object.keys(hashes).length} hashes de Depot → ${archivo}`);
}
