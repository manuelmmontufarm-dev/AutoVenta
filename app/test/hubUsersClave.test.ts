/**
 * La clave por usuario (reunión con Andrés, 20-ago).
 *
 * Lo que se protege: (1) que una cuenta nueva NO pueda entrar con la clave
 * compartida — su primer ingreso es crear la suya; (2) que crear clave propia
 * APAGUE la compartida para esa cuenta; (3) que el hash no sea reversible ni
 * acepte basura. Todo puro, sin base: el espejo se inyecta a mano.
 */
import { beforeEach, describe, expect, it } from "vitest";

process.env.ADMIN_KEY = "clave-de-prueba-hub-users";
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_no_se_conecta";

const {
  PERMISOS_COMPLETOS, claveCoincide, crearHashDeClave, estadoClave,
  inyectarUsuariosHub, reiniciarUsuariosHub,
} = await import("../src/services/hubUsers.js");
const { claveValidaPara } = await import("../src/server/auth.js");

const base = { rol: "asesor" as const, permisos: { ...PERMISOS_COMPLETOS }, email: null };

describe("hash de la clave propia", () => {
  it("ida y vuelta, y cada hash lleva su propia sal", () => {
    const hash = crearHashDeClave("mi-clave-larga");
    expect(claveCoincide("mi-clave-larga", hash)).toBe(true);
    expect(claveCoincide("mi-clave-largo", hash)).toBe(false);
    expect(claveCoincide("", hash)).toBe(false);
    // Dos usuarios con la misma clave no comparten hash: sin esto, un vistazo
    // a settings diría quiénes usan la misma.
    expect(crearHashDeClave("mi-clave-larga")).not.toBe(hash);
  });

  it("un hash roto en la base no abre ni revienta", () => {
    for (const basura of ["", "sin-dos-puntos", "zz:zz", "abc:", ":abc"]) {
      expect(claveCoincide("1234", basura)).toBe(false);
    }
  });
});

describe("estado de la clave", () => {
  it("compartida / pendiente / propia, en ese orden de historia", () => {
    expect(estadoClave({ claveCompartida: true, pinHash: null })).toBe("compartida");
    expect(estadoClave({ claveCompartida: false, pinHash: null })).toBe("pendiente");
    expect(estadoClave({ claveCompartida: false, pinHash: crearHashDeClave("x".repeat(4)) })).toBe("propia");
  });
});

describe("qué clave abre cada cuenta", () => {
  beforeEach(() => reiniciarUsuariosHub());

  it("los cuatro originales siguen entrando con la compartida", () => {
    expect(claveValidaPara("manuel", "1234")).toBe("ok");
    expect(claveValidaPara("manuel", "0000")).toBe("mala");
  });

  it("una cuenta nueva NO entra con la compartida: exige activación", () => {
    inyectarUsuariosHub([
      { id: "jocelyn", nombre: "Jocelyn", claveCompartida: false, pinHash: null, ...base },
    ]);
    // Ni con la clave compartida ni con ninguna otra: primero crea la suya.
    expect(claveValidaPara("jocelyn", "1234")).toBe("activacion_requerida");
    expect(claveValidaPara("jocelyn", "loquesea")).toBe("activacion_requerida");
  });

  it("con clave propia, SOLO la propia abre — la compartida queda muerta", () => {
    inyectarUsuariosHub([
      { id: "jocelyn", nombre: "Jocelyn", claveCompartida: false, pinHash: crearHashDeClave("su-clave"), ...base },
    ]);
    expect(claveValidaPara("jocelyn", "su-clave")).toBe("ok");
    expect(claveValidaPara("jocelyn", "1234")).toBe("mala");
  });

  it("usuario inexistente: mala, sin distinguirse de una clave mala", () => {
    expect(claveValidaPara("fantasma", "1234")).toBe("mala");
  });
});
