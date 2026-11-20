/**
 * AJUSTES → AVISOS: CADA TIPO DE MENSAJE ES SU PROPIA CASILLA (Manuel, 19-nov-2026).
 *
 * Hoy los niveles agrupan avisos por categoría y hay que abrir el grupo para
 * elegir uno por uno. Manuel quiere ver cada tipo de mensaje que mandamos, con
 * su nombre en castellano llano y una línea de qué es, y elegir uno por uno qué
 * recibe cada nivel. Los avisos que hoy salen sin pasar por los niveles, que
 * pasen: el de «un asesor se queda sin la ventana de 24 h» salía por el canal
 * de «prendieron/apagaron el bot» y ahora es su propia casilla.
 *
 * DEPOT NO CAMBIA: con su configuración guardada (foto del 19-nov, sin datos
 * personales) cada aviso llega exactamente a los mismos que antes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const m = await import("../src/services/advisorNotifications.js");

const leer = (archivo: string) => JSON.parse(readFileSync(new URL(`./fixtures/${archivo}`, import.meta.url), "utf8"));
const DEPOT = leer("avisos-depot-19nov.json") as { aviso_niveles: unknown; asesores: Array<{ id: number; rol: string }> };
const ESPERADO = leer("avisos-depot-19nov.esperado.json") as Record<string, number[]>;

describe("cada aviso es una casilla con nombre y explicación", () => {
  it("todos los avisos de chat tienen nombre y una línea de qué es", () => {
    for (const e of m.EVENTOS_AVISO) {
      expect(m.NOMBRE_DE_EVENTO[e], e).toBeTruthy();
      expect(m.DESCRIPCION_DE_EVENTO[e], e).toMatch(/\S.{15,}/);
    }
  });

  it("los generales también, y «un asesor se queda sin ventana» es uno de ellos", () => {
    expect(m.AVISOS_GENERALES).toContain("ventana_del_asesor");
    for (const g of m.AVISOS_GENERALES) {
      expect(m.NOMBRE_DE_AVISO_GENERAL[g], g).toBeTruthy();
      expect(m.DESCRIPCION_DE_AVISO_GENERAL[g], g).toMatch(/\S.{15,}/);
    }
  });

  it("el catálogo que lee el panel trae cada aviso suelto, con su explicación", () => {
    const { avisos } = m.catalogoDeAvisos();
    const ids = avisos.map((a) => a.id);
    expect(ids).toEqual([...m.EVENTOS_AVISO.map((e) => `evento:${e}`), ...m.AVISOS_GENERALES.map((g) => `general:${g}`)].sort((a, b) => ids.indexOf(a) - ids.indexOf(b)));
    expect(new Set(ids).size).toBe(m.EVENTOS_AVISO.length + m.AVISOS_GENERALES.length);
    for (const a of avisos) {
      expect(a.nombre).toBeTruthy();
      expect(a.descripcion).toBeTruthy();
      expect(a.grupo).toBeTruthy();
    }
  });
});

describe("Depot: su configuración guardada reparte igual que antes", () => {
  const niveles = m.completarEventosNuevos(m.NivelesSchemaParaPruebas.parse(DEPOT.aviso_niveles));
  const quienes = (filtro: (rol: string) => boolean) => DEPOT.asesores.filter((a) => filtro(a.rol)).map((a) => a.id);

  for (const e of m.EVENTOS_AVISO) {
    it(`evento ${e}`, () => {
      expect(quienes((rol) => m.recibeEvento(rol, e, niveles))).toEqual(ESPERADO[`evento:${e}`]);
    });
  }
  it("reporte diario y bot prendido/apagado", () => {
    expect(quienes((rol) => m.recibeGeneral(rol, "reporte_diario", niveles))).toEqual(ESPERADO["general:reporte_diario"]);
    expect(quienes((rol) => m.recibeGeneral(rol, "bot_prendido_apagado", niveles))).toEqual(ESPERADO["general:bot_prendido_apagado"]);
  });
  it("«un asesor se queda sin ventana» llega a los mismos que hoy (los de bot prendido/apagado)", () => {
    expect(quienes((rol) => m.recibeGeneral(rol, "ventana_del_asesor", niveles))).toEqual(ESPERADO.ventana_del_asesor);
  });
});

describe("un aviso general nuevo y lo que se guarda desde el panel", () => {
  it("guardado desde el panel con la casilla nueva desmarcada: no le llega", () => {
    const niveles = m.completarEventosNuevos([
      { id: "admin", nombre: "TODO", eventos: [], generales: ["bot_prendido_apagado"], generalesVistos: [...m.AVISOS_GENERALES] },
    ]);
    expect(m.recibeGeneral("admin", "ventana_del_asesor", niveles)).toBe(false);
  });

  it("los niveles por defecto (Competimotor no guardó nada) mandan todo el general al Nivel 1", () => {
    expect(m.recibeGeneral("admin", "ventana_del_asesor")).toBe(true);
    expect(m.recibeGeneral("asesor", "ventana_del_asesor")).toBe(false);
  });
});

describe("el aviso de ventana del asesor pasa por su propia casilla", () => {
  it("revisarVentanasDeAsesores avisa por «ventana_del_asesor», no por «bot prendido/apagado»", async () => {
    vi.resetModules();
    const llamadas: Array<string | undefined> = [];
    vi.doMock("../src/services/advisorNotifications.js", async (orig) => ({
      ...(await orig<object>()),
      avisarAsesoresGlobal: vi.fn(async (_texto: string, general?: string) => { llamadas.push(general); return { enviados: 1 }; }),
    }));
    vi.doMock("../src/db/client.js", () => {
      const sql = Object.assign(
        vi.fn(async (partes: TemplateStringsArray) => partes.join("").includes("select nombre")
          ? [{ nombre: "Asesor", telefono: "593900000000", ventana_hasta: null, ventana_avisada_en: null }]
          : []),
        { json: (v: unknown) => v },
      );
      return { sql };
    });
    const { revisarVentanasDeAsesores } = await import("../src/services/advisorWindow.js");
    await revisarVentanasDeAsesores(new Date("2026-11-19T15:00:00Z"));
    expect(llamadas).toEqual(["ventana_del_asesor"]);
    vi.doUnmock("../src/services/advisorNotifications.js");
    vi.doUnmock("../src/db/client.js");
  });
});
