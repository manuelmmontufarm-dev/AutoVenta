import { describe, expect, it } from "vitest";
import { anuncioDelReferral, hechoDelAnuncio } from "../src/domain/anuncio.js";

/**
 * El anuncio se guarda COMPLETO como hecho (R-07, 23-oct): el título casi
 * siempre es «Depot Tire», así que sin `source_id` no hay cómo separar una ola
 * de anuncios de otra ni decir cuál trajo las ventas. Lo que lee el vendedor
 * no cambia para los anuncios con texto.
 */

/** Forma real de un referral de anuncio de feed «clic a WhatsApp» (ids cambiados). */
const deFeed = {
  source_url: "https://fb.me/2kQx8Ab1c",
  source_id: "120212345678900123",
  source_type: "ad",
  headline: "Depot Tire",
  body: "¿Buscas agarre, duración y seguridad en cualquier terreno? La Kenda Klever KR601 es la llanta ideal para tu próxima aventura.",
  media_type: "image",
  image_url: "https://scontent.xx.fbcdn.net/v/t45.1600-4/abc.jpg",
  ctwa_clid: "ARAkLkA8rmlFeiCktEJQ-QTwRiyYHAFDLMNDBH0CD3qpjd0HR4irJ6LEkR7JwFF4XvnO2E4Nx0-eM-GABDLOPaOdRMv-_zfUQ2a",
};

/** «Anuncio en estados»: llega sin `ctwa_clid` y a veces sin título ni texto. */
const deEstados = {
  source_url: "https://www.facebook.com/100089999999999/posts/987654321",
  source_id: "120212345678900456",
  source_type: "ad",
  media_type: "video",
  video_url: "https://video.xx.fbcdn.net/v/abc.mp4",
};

describe("el anuncio se guarda completo", () => {
  it("feed: título, texto, url, id, tipo, click y medio", () => {
    expect(anuncioDelReferral(deFeed)).toEqual({
      titulo: "Depot Tire",
      texto: deFeed.body,
      url: "https://fb.me/2kQx8Ab1c",
      sourceId: "120212345678900123",
      sourceType: "ad",
      ctwaClid: deFeed.ctwa_clid,
      mediaType: "image",
    });
  });

  it("estados: sin título, texto ni ctwa_clid ya NO se descarta: el id es el dato", () => {
    expect(anuncioDelReferral(deEstados)).toEqual({
      titulo: null,
      texto: null,
      url: deEstados.source_url,
      sourceId: "120212345678900456",
      sourceType: "ad",
      ctwaClid: null,
      mediaType: "video",
    });
  });

  it("recorta espacios y largos; lo que no es texto queda en null", () => {
    const a = anuncioDelReferral({ source_id: "  123  ", source_type: 7, headline: "  Depot   Tire " })!;
    expect(a.sourceId).toBe("123");
    expect(a.sourceType).toBeNull();
    expect(a.titulo).toBe("Depot Tire");
    expect(anuncioDelReferral({ source_id: "x".repeat(500) })!.sourceId).toHaveLength(100);
  });

  it("sin título, texto ni id: null, como antes", () => {
    expect(anuncioDelReferral(undefined)).toBeNull();
    expect(anuncioDelReferral({ source_type: "ad", media_type: "image" })).toBeNull();
    expect(anuncioDelReferral({ source_id: "   " })).toBeNull();
  });
});

describe("lo que lee el vendedor", () => {
  it("con texto, el mismo hecho de siempre (los campos nuevos no entran)", () => {
    const hecho = hechoDelAnuncio(anuncioDelReferral(deFeed)!);
    expect(hecho).toContain("«Depot Tire — ¿Buscas agarre");
    expect(hecho).toContain("KR601");
    expect(hecho).not.toContain("120212345678900123");
    expect(hecho).not.toContain("ARAkLk");
    expect(hecho).toBe(hechoDelAnuncio({ ...anuncioDelReferral(deFeed)!, sourceId: null, sourceType: null, ctwaClid: null, mediaType: null }));
  });

  it("solo con id: no inventa una llanta ni va vacío", () => {
    const hecho = hechoDelAnuncio(anuncioDelReferral(deEstados)!);
    expect(hecho).not.toBe("");
    expect(hecho).not.toContain("«»");
    expect(hecho).toContain("No supongas");
  });
});

describe("hechoDelAnuncio con los anuncios que cargó el negocio (26-oct)", () => {
  const kenda = { id: "a1", link: "https://fb.me/2kQx8Ab1c", descripcion: "Kenda Klever KR601, camioneta, rin 15–17", activo: true, hasta: null };

  it("sin anuncios cargados el hecho es el de siempre", () => {
    expect(hechoDelAnuncio(anuncioDelReferral(deFeed)!, [])).toBe(hechoDelAnuncio(anuncioDelReferral(deFeed)!));
  });

  it("con el anuncio cargado y el mismo link, dice cuál es", () => {
    const h = hechoDelAnuncio(anuncioDelReferral(deFeed)!, [kenda]);
    expect(h).toContain("Kenda Klever KR601, camioneta, rin 15–17");
    expect(h).toContain("El cliente llegó por el anuncio 1");
  });
});
