import { afterEach, describe, expect, it, vi } from "vitest";

// auth.ts llega hasta config.ts por hubUsers → db/client; como en las demás
// pruebas, se satisface con valores de mentira antes del primer import.
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/test";

/**
 * R-33 — el PIN compartido del panel sale de `HUB_PIN`.
 *
 * Depot entra con «1234» desde el 14-ago y eso no puede cambiar: sin la
 * variable, el PIN sigue siendo el de siempre. Un cliente nuevo arranca con su
 * propia variable en Railway, para que el panel de Mundillantas no se abra con
 * el PIN publicado en el repo de Depot.
 *
 * `auth.ts` resuelve el PIN al cargar el módulo, así que cada caso lo importa
 * fresco con `vi.resetModules()`.
 */
async function authCon(hubPin: string | undefined) {
  vi.resetModules();
  if (hubPin === undefined) vi.stubEnv("HUB_PIN", "");
  else vi.stubEnv("HUB_PIN", hubPin);
  // Con la variable vacía el respaldo tiene que ser el de siempre: stubEnv("")
  // deja la clave definida pero vacía, que es como queda un campo sin llenar
  // en Railway, y eso también tiene que caer en "1234".
  return import("../src/server/auth.js");
}

describe("hub · PIN compartido desde HUB_PIN (R-33)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sin HUB_PIN, el PIN sigue siendo 1234 (Depot no cambia)", async () => {
    const auth = await authCon(undefined);
    expect(auth.pinValido("1234")).toBe(true);
    expect(auth.pinValido("9876")).toBe(false);
  });

  it("con HUB_PIN, solo esa clave abre", async () => {
    const auth = await authCon("9876");
    expect(auth.pinValido("9876")).toBe(true);
    expect(auth.pinValido("1234")).toBe(false);
  });

  it("HUB_PIN admite claves más largas que 4 dígitos", async () => {
    const auth = await authCon("mundi-2026");
    expect(auth.pinValido("mundi-2026")).toBe(true);
    expect(auth.pinValido("mundi-202")).toBe(false);
  });
});

/**
 * R-33 — la semilla de usuarios del panel es de cada negocio.
 *
 * Los cuatro de la reunión del 14-ago son gente de Depot: no pueden aparecer
 * en el desplegable del login de Mundillantas. Otro negocio arranca con un
 * solo administrador y crea a su gente desde Ajustes → Usuarios.
 */
async function usuariosCon(negocio: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEGOCIO", negocio ?? "");
  const hubUsers = await import("../src/services/hubUsers.js");
  hubUsers.reiniciarUsuariosHub();
  return hubUsers.usuariosHub();
}

describe("hub · usuarios sembrados por negocio (R-33)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sin NEGOCIO (Depot), los cuatro de siempre", async () => {
    const usuarios = await usuariosCon(undefined);
    expect(usuarios.map((u) => u.id)).toEqual(["manuel", "andres", "joaquin", "asesor"]);
  });

  it("con otro negocio, un solo administrador", async () => {
    const usuarios = await usuariosCon("ejemplo");
    expect(usuarios.map((u) => u.id)).toEqual(["manuel"]);
    expect(usuarios[0].rol).toBe("admin");
    // Con la clave compartida, para poder entrar el día de la entrega.
    expect(usuarios[0].claveCompartida).toBe(true);
  });
});
