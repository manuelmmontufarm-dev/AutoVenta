/**
 * Sesiones del hub: la parte pura (firmar, verificar, caducar, permisos).
 *
 * Es un archivo corto pero es la cerradura del hub: si `verificarToken` acepta
 * algo que no firmamos nosotros, el panel con los tickets, los teléfonos de los
 * clientes y las métricas de venta queda abierto a cualquiera. Por eso las
 * pruebas que importan aquí no son las del camino feliz, son las de los tokens
 * TORCIDOS: firma cambiada, caducado, usuario que ya no existe, otro secreto.
 *
 * El cableado HTTP (quién entra por `/api/auth/login`, y que el panel central
 * siga entrando con `x-admin-key`) está en loginHub.integration.test.ts.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

// `auth.ts` congela la clave al importarse: se pone ANTES del import dinámico.
const ADMIN_KEY = "clave-de-prueba-sesiones";
process.env.ADMIN_KEY = ADMIN_KEY;
process.env.NODE_ENV = "test";

const {
  crearToken,
  listarUsuarios,
  permisosDe,
  pinValido,
  tokenDelHeader,
  usuarioPorId,
  verificarToken,
} = await import("../src/server/auth.js");

const DIA = 24 * 60 * 60 * 1000;

describe("usuarios y clave", () => {
  it("ofrece los cuatro usuarios que pidió el cliente y ninguna clave", () => {
    const usuarios = listarUsuarios();
    expect(usuarios.map((u) => u.nombre)).toEqual([
      "Manuel Montufar",
      "Andres Tamayo",
      "Joaquin Tamayo",
      "Asesor",
    ]);
    // La lista se sirve en una ruta PÚBLICA (puebla el desplegable del login):
    // que no se cuele nunca un campo con la clave dentro.
    for (const usuario of usuarios) {
      expect(Object.keys(usuario).sort()).toEqual(["id", "nombre", "rol"]);
    }
    expect(usuarios.filter((u) => u.rol === "asesor")).toHaveLength(1);
  });

  it("acepta la clave acordada y rechaza cualquier otra sin reventar", () => {
    expect(pinValido("1234")).toBe(true);
    expect(pinValido("1235")).toBe(false);
    // Distinta longitud: `timingSafeEqual` LANZA si los buffers no miden igual,
    // así que la comparación tiene que filtrarlo antes. Un throw aquí sería un
    // 500 en el login en vez de un "clave incorrecta".
    expect(pinValido("12345")).toBe(false);
    expect(pinValido("")).toBe(false);
    expect(pinValido(" 1234 ")).toBe(false);
  });

  it("no inventa usuarios", () => {
    expect(usuarioPorId("manuel")?.rol).toBe("admin");
    expect(usuarioPorId("asesor")?.rol).toBe("asesor");
    expect(usuarioPorId("andres_")).toBeNull();
    expect(usuarioPorId("")).toBeNull();
  });
});

describe("permisos", () => {
  it("hoy todos ven todo, a propósito, y el objeto no se puede contaminar", () => {
    const admin = permisosDe("admin");
    const asesor = permisosDe("asesor");
    expect(Object.values(admin).every(Boolean)).toBe(true);
    expect(asesor).toEqual(admin);

    // Se devuelve una COPIA: si alguna pantalla o endpoint le apaga un permiso
    // al objeto que recibe, el siguiente usuario no debe heredar ese apagón.
    admin.verFinanzas = false;
    expect(permisosDe("admin").verFinanzas).toBe(true);
  });
});

describe("token de sesión", () => {
  it("ida y vuelta: quien lo recibe sabe quién es y con qué rol", () => {
    const usuario = verificarToken(crearToken("joaquin"));
    expect(usuario).toEqual({ id: "joaquin", nombre: "Joaquin Tamayo", rol: "admin" });
  });

  it("caduca a los 30 días", () => {
    // Emitido hace 29 días: todavía sirve. Hace 31: ya no.
    expect(verificarToken(crearToken("manuel", Date.now() - 29 * DIA))?.id).toBe("manuel");
    expect(verificarToken(crearToken("manuel", Date.now() - 31 * DIA))).toBeNull();
  });

  it("rechaza el token al que le tocaron la firma o la fecha", () => {
    const bueno = crearToken("andres");
    const [userId, expiracion, firma] = bueno.split(".");

    // Firma cambiada.
    expect(verificarToken(`${userId}.${expiracion}.${firma.slice(0, -1)}x`)).toBeNull();
    // Fecha estirada a mano conservando la firma vieja: el clásico intento de
    // revivir una sesión caducada.
    expect(verificarToken(`${userId}.${Number(expiracion) + 10 * DIA}.${firma}`)).toBeNull();
    // Otro usuario con firma ajena: entrar como Manuel con el token del asesor.
    expect(verificarToken(`manuel.${expiracion}.${firma}`)).toBeNull();
  });

  it("rechaza un token firmado con OTRO secreto", () => {
    const payload = `manuel.${Date.now() + DIA}`;
    const impostor = `${payload}.${createHmac("sha256", "otra-clave").update(payload).digest("base64url")}`;
    expect(verificarToken(impostor)).toBeNull();
  });

  it("rechaza basura sin lanzar excepciones", () => {
    for (const basura of ["", "abc", "a.b", "a.b.c.d", "manuel..", "..", "manuel.abc.def"]) {
      expect(verificarToken(basura)).toBeNull();
    }
  });

  it("un usuario que ya no está en la lista pierde su sesión", () => {
    // Firmado por nosotros y vigente, pero el id no existe: si algún día se
    // saca a alguien de USERS, su token deja de abrir en el acto.
    const payload = `exempleado.${Date.now() + DIA}`;
    const token = `${payload}.${createHmac("sha256", ADMIN_KEY).update(payload).digest("base64url")}`;
    expect(verificarToken(token)).toBeNull();
  });
});

describe("header Authorization", () => {
  it("saca el token del Bearer y ninguna otra cosa", () => {
    expect(tokenDelHeader("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(tokenDelHeader("bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(tokenDelHeader("Basic abc")).toBeNull();
    expect(tokenDelHeader("Bearer")).toBeNull();
    expect(tokenDelHeader("Bearer ")).toBeNull();
    expect(tokenDelHeader(undefined)).toBeNull();
  });
});
