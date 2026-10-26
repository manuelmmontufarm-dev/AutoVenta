import { describe, expect, it } from "vitest";
import {
  AnunciosActivosSchema,
  coincide,
  hechoDeAnunciosActivos,
  podarVencidos,
  vigentes,
  type AnuncioActivo,
} from "../src/domain/anunciosActivos.js";
import { anuncioDelReferral, hechoDelAnuncio, hechoParaElChat } from "../src/domain/anuncio.js";

/**
 * Los anuncios que el negocio carga a mano (26-oct-2026): el título de Meta casi
 * siempre es «Depot Tire», así que lo único fiable para saber qué muestra «la
 * del anuncio» es lo que Depot escribe. Todo puro: la hora la pone quien llama.
 */

const kenda: AnuncioActivo = {
  id: "a1",
  link: "https://fb.me/2kQx8Ab1c",
  descripcion: "Kenda Klever KR601, camioneta, rin 15–17, promoción 3x4",
  activo: true,
  hasta: null,
};
const deFeed = anuncioDelReferral({
  source_url: "https://fb.me/2kQx8Ab1c",
  source_id: "120212345678900123",
  source_type: "ad",
  headline: "Depot Tire",
  body: "La Kenda Klever KR601 es la llanta ideal para tu próxima aventura.",
})!;

describe("vigentes", () => {
  it("deja fuera los apagados y los vencidos; 'hasta' vale ese mismo día", () => {
    const lista: AnuncioActivo[] = [
      kenda,
      { ...kenda, id: "a2", activo: false },
      { ...kenda, id: "a3", hasta: "2026-10-25" },
      { ...kenda, id: "a4", hasta: "2026-10-26" },
    ];
    expect(vigentes(lista, "2026-10-26").map((a) => a.id)).toEqual(["a1", "a4"]);
  });
});

describe("coincide", () => {
  it("por sourceId contenido en el link, y gana sobre el link", () => {
    const porId = { ...kenda, link: "https://www.facebook.com/ads/library/?id=120212345678900123" };
    expect(coincide(porId, deFeed)).toBe(true);
  });
  it("por link normalizado (sin protocolo, www, query ni barra final)", () => {
    expect(coincide({ ...kenda, link: "HTTP://www.fb.me/2kQx8Ab1c/?utm=1" }, deFeed)).toBe(true);
  });
  it("sin link o con otro anuncio no coincide", () => {
    expect(coincide({ ...kenda, link: null }, deFeed)).toBe(false);
    expect(coincide({ ...kenda, link: "https://fb.me/otro" }, deFeed)).toBe(false);
    expect(coincide(kenda, null)).toBe(false);
  });
});

describe("hechoDeAnunciosActivos", () => {
  it("sin activos es null: el prompt no crece", () => {
    expect(hechoDeAnunciosActivos([], null)).toBeNull();
    expect(hechoDeAnunciosActivos([{ ...kenda, activo: false }], null)).toBeNull();
  });
  it("lista numerada y regla para el vendedor", () => {
    const h = hechoDeAnunciosActivos([kenda], null)!;
    expect(h).toContain("ANUNCIOS VIGENTES (cargados por el negocio)");
    expect(h).toContain("1) Kenda Klever KR601, camioneta, rin 15–17, promoción 3x4");
    expect(h).toContain("«la del anuncio»");
    expect(h).not.toContain("llegó por el anuncio");
  });
  it("con varios y sin coincidencia manda preguntar cuál", () => {
    const h = hechoDeAnunciosActivos([kenda, { ...kenda, id: "a2", link: null, descripcion: "Llantas de auto rin 14 desde $60" }], null)!;
    expect(h).toContain("2) Llantas de auto rin 14");
    expect(h).toContain("pregunta cuál");
  });
  it("si el referral coincide dice cuál", () => {
    const otro = { ...kenda, id: "a0", link: null, descripcion: "Llantas de auto rin 14 desde $60" };
    expect(hechoDeAnunciosActivos([otro, kenda], deFeed)).toContain("El cliente llegó por el anuncio 2");
  });
  it("es estable: mismo input, mismo texto", () => {
    expect(hechoDeAnunciosActivos([kenda], deFeed)).toBe(hechoDeAnunciosActivos([kenda], deFeed));
  });
});

describe("hechoDelAnuncio con activos", () => {
  it("sin activos queda exactamente como hoy", () => {
    expect(hechoDelAnuncio(deFeed, [])).toBe(hechoDelAnuncio(deFeed));
  });
  it("con activos agrega la lista tras el hecho del referral", () => {
    const h = hechoDelAnuncio(deFeed, [kenda]);
    expect(h.startsWith(hechoDelAnuncio(deFeed))).toBe(true);
    expect(h).toContain("El cliente llegó por el anuncio 1");
  });
});

describe("hechoParaElChat", () => {
  it("sin referral y sin activos: null", () => {
    expect(hechoParaElChat(null, [])).toBeNull();
  });
  it("sin referral pero con activos: solo la lista", () => {
    expect(hechoParaElChat(null, [kenda])).toBe(hechoDeAnunciosActivos([kenda], null));
  });
  it("referral solo con id (sin título ni texto) y sin activos: null, como hoy", () => {
    const soloId = anuncioDelReferral({ source_id: "999" })!;
    expect(hechoParaElChat(soloId, [])).toBeNull();
  });
  it("referral solo con id y activos: la lista, sin inventar coincidencia", () => {
    const soloId = anuncioDelReferral({ source_id: "999" })!;
    expect(hechoParaElChat(soloId, [kenda])).toBe(hechoDeAnunciosActivos([kenda], soloId));
  });
});

describe("esquema", () => {
  it("la descripción es obligatoria (10–400)", () => {
    expect(AnunciosActivosSchema.safeParse([{ ...kenda, descripcion: "" }]).success).toBe(false);
    expect(AnunciosActivosSchema.safeParse([{ ...kenda, descripcion: "corta" }]).success).toBe(false);
    expect(AnunciosActivosSchema.safeParse([{ ...kenda, descripcion: "x".repeat(401) }]).success).toBe(false);
    expect(AnunciosActivosSchema.safeParse([kenda]).success).toBe(true);
  });
  it("máximo 20 anuncios y 'hasta' con forma de fecha", () => {
    expect(AnunciosActivosSchema.safeParse(Array.from({ length: 21 }, (_, i) => ({ ...kenda, id: `x${i}` }))).success).toBe(false);
    expect(AnunciosActivosSchema.safeParse([{ ...kenda, hasta: "mañana" }]).success).toBe(false);
  });
  it("un link vacío se guarda como null", () => {
    const r = AnunciosActivosSchema.parse([{ ...kenda, link: "  " }]);
    expect(r[0].link).toBeNull();
  });
});

describe("podarVencidos", () => {
  it("quita los vencidos hace más de 30 días y deja el resto", () => {
    const lista = [
      { ...kenda, id: "viejo", hasta: "2026-09-20" },
      { ...kenda, id: "reciente", hasta: "2026-10-10" },
      kenda,
    ];
    expect(podarVencidos(lista, "2026-10-26").map((a) => a.id)).toEqual(["reciente", "a1"]);
  });
});
