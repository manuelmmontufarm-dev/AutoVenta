import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LISTA_BLANCA, IGNORADAS, DEFINIDAS_POR_EL_SIM } from "../scripts/sim/lib/entorno-prod.mjs";
import { TABLAS_CONFIG, TABLAS_DATOS } from "../scripts/sim/lib/tablas.mjs";

/**
 * EL SIMULADOR NO SE PUEDE PUDRIR EN SILENCIO.
 *
 * `scripts/sim` levanta el bot real contra una base local y una copia de la
 * configuración de producción. Sirve mientras siga siendo fiel — y la forma en
 * que una herramienta así deja de serlo nunca es un error ruidoso: alguien
 * agrega una tabla de configuración, o un interruptor nuevo en el entorno, el
 * simulador no lo copia, y sigue funcionando. Contesta. Solo que contesta como
 * otro bot, y las pruebas que se hacen ahí dejan de decir algo del que atiende
 * a los clientes de Depot.
 *
 * Estas pruebas fallan cuando eso pasa. No revisan que el simulador ande
 * (eso es `npm run sim -- --humo`): revisan que lo que producción ganó, el
 * simulador lo haya ganado también.
 *
 * Son estáticas a propósito: sin base, sin red y sin claves, para que corran
 * en `npm test` junto a todo lo demás.
 */

const raíz = resolve(__dirname, "..");
const leer = (ruta: string) => readFileSync(resolve(raíz, ruta), "utf8");

const archivosTs = (function recorrer(dir: string): string[] {
  return readdirSync(resolve(raíz, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? recorrer(`${dir}/${e.name}`) : e.name.endsWith(".ts") ? [`${dir}/${e.name}`] : [],
  );
})("src");

describe("simulador · las tablas de configuración", () => {
  /**
   * Toda tabla del esquema tiene que estar clasificada: o es configuración (y
   * el simulador la copia de producción) o es dato de conversación (y no).
   * Una tabla nueva sin clasificar es la fuga silenciosa: el bot del
   * simulador se comporta distinto y nadie se entera.
   */
  it("toda tabla del esquema está clasificada como configuración o como dato", () => {
    const fuentes = [
      leer("src/db/schema.ts"),
      ...readdirSync(resolve(raíz, "src/db/migrations"))
        .filter((f) => f.endsWith(".ts"))
        .map((f) => leer(`src/db/migrations/${f}`)),
    ].join("\n");

    const tablas = new Set(
      [...fuentes.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)]
        .map((m) => m[1].toLowerCase()),
    );

    const clasificadas = new Set([...TABLAS_CONFIG, ...TABLAS_DATOS]);
    const sinClasificar = [...tablas].filter((t) => !clasificadas.has(t)).sort();

    expect(
      sinClasificar,
      `Tablas nuevas sin clasificar: ${sinClasificar.join(", ")}.\n` +
        "Agregalas en scripts/sim/lib/tablas.mjs: a TABLAS_CONFIG si definen CÓMO se comporta " +
        "el bot (el simulador las copia de producción) o a TABLAS_DATOS si son clientes y " +
        "conversaciones (el simulador NO las copia).",
    ).toEqual([]);
  });

  it("ninguna tabla está en las dos listas", () => {
    const dobles = TABLAS_CONFIG.filter((t) => TABLAS_DATOS.includes(t));
    expect(dobles).toEqual([]);
  });
});

describe("simulador · las variables de entorno", () => {
  /**
   * Cada variable que el bot lee tiene que estar clasificada en
   * `lib/entorno-prod.mjs`: se copia de producción, se ignora por ser
   * credencial/infraestructura, o la define el simulador. Un interruptor nuevo
   * sin clasificar (como pasó con AI_COMPACT_PROMPT_ENABLED, que cambia el
   * prompt ENTERO del vendedor) hace que el simulador corra otro bot.
   */
  it("toda variable que el bot lee está clasificada", () => {
    const leídas = new Set<string>();
    for (const archivo of archivosTs) {
      const texto = leer(archivo);
      for (const m of texto.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) leídas.add(m[1]);
      for (const m of texto.matchAll(/process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g)) leídas.add(m[1]);
      for (const m of texto.matchAll(/\benvOr?\(\s*["']([A-Z][A-Z0-9_]*)["']/g)) leídas.add(m[1]);
    }

    const clasifica = (clave: string) =>
      LISTA_BLANCA.some((re: RegExp) => re.test(clave)) ||
      IGNORADAS.some((re: RegExp) => re.test(clave)) ||
      DEFINIDAS_POR_EL_SIM.includes(clave);

    const sinClasificar = [...leídas].filter((k) => !clasifica(k)).sort();

    expect(
      sinClasificar,
      `Variables de entorno que el bot lee y el simulador no sabe qué hacer con ellas: ${sinClasificar.join(", ")}.\n` +
        "En scripts/sim/lib/entorno-prod.mjs: a LISTA_BLANCA si cambia el COMPORTAMIENTO " +
        "(el simulador la copia del servicio de producción), a IGNORADAS si es credencial o " +
        "infraestructura, o a DEFINIDAS_POR_EL_SIM si el simulador la pone él.",
    ).toEqual([]);
  });

  it("ninguna credencial cruza a la lista blanca", () => {
    // Doble llave: aunque alguien agregue un patrón amplio a LISTA_BLANCA, una
    // clave o un token no puede quedar del lado que SÍ se copia.
    const peligrosas = ["OPENAI_API_KEY", "CONTIFICO_API_KEY", "WHATSAPP_TOKEN", "DATABASE_URL", "ADMIN_KEY", "OWNER_KEY", "INTERBOT_PASSWORD"];
    for (const clave of peligrosas) {
      expect(LISTA_BLANCA.some((re: RegExp) => re.test(clave)), `${clave} no puede estar en LISTA_BLANCA`).toBe(false);
    }
  });
});

describe("simulador · sigue siendo el bot de verdad", () => {
  const sim = leer("scripts/sim/sim.mjs");

  it("arranca el binario real, no una versión instrumentada", () => {
    expect(sim).toContain('spawn("node", ["dist/index.js"]');
  });

  it("no sustituye ningún módulo de src/ (a diferencia del replay del eval)", () => {
    // El harness de evaluación reemplaza src/wa/client.ts por un stub con un
    // hook de resolución. El simulador NO: WhatsApp se neutraliza por la URL
    // de la Graph, y todo lo demás es el código de producción tal cual.
    expect(sim).not.toMatch(/loader-hooks|wa-stub|module\.register|--import\s/);
  });

  it("el webhook entra firmado como el de Meta", () => {
    // Si esto se reemplazara por una llamada directa al pipeline, el
    // simulador dejaría de probar la puerta por la que entra un cliente real.
    expect(sim).toContain("deliverWebhook");
    expect(sim).toContain("buildInboundPayload");
  });

  it("no puede mandarle nada a Meta ni a un cliente real", () => {
    expect(sim).toContain("GRAPH_BASE_URL: `http://127.0.0.1:${PUERTO_GRAPH}`");
    // El channel_config copiado de producción se pisa con credenciales falsas.
    expect(sim).toMatch(/insert into settings \(key, value\) values \('channel_config'/);
    // Teléfonos del rango no asignado en Ecuador.
    expect(sim).toMatch(/TELEFONO_CLIENTE\s*=\s*valor\("telefono",\s*"5939000/);
  });

  it("borra OPENAI_BASE_URL heredada: si no, las respuestas no son del modelo configurado", () => {
    expect(sim).toContain("delete mezcla.OPENAI_BASE_URL");
  });

  it("exige una clave de OpenAI de pruebas, para no cobrarle al cliente", () => {
    expect(sim).toContain("con-clave-de-produccion");
    expect(sim).toContain(".env.sim");
  });
});

describe("simulador · la Graph de mentira cubre lo que el bot usa", () => {
  /**
   * Canario: si `wa/client.ts` empieza a llamar un endpoint nuevo de la Graph
   * (un tipo de mensaje interactivo, una plantilla con media, un borrado),
   * esta prueba falla y obliga a mirar `lib/graph-sim.mjs`. Sin esto, el
   * camino nuevo se cae en silencio dentro del simulador y parece un bug del
   * bot.
   */
  it("los endpoints de la Graph que usa el bot son los que el stub atiende", () => {
    const cliente = leer("src/wa/client.ts");
    const rutas = new Set(
      [...cliente.matchAll(/\$\{GRAPH\}\/([^`"']*)/g)].map((m) => m[1].replace(/\$\{[^}]+\}/g, "«var»")),
    );
    expect([...rutas].sort()).toEqual([
      "«var»",              // GET metadato de media entrante  → graph-sim lo responde con {url, mime_type}
      "«var»/media",        // subida de piezas                 → graph-sim guarda los bytes
      "«var»/messages",     // envío y «escribiendo…»           → graph-sim registra el envío
    ]);
  });
});
