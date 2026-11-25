import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

/**
 * LOS COLORES DE LA PIEZA, EL TEMA «NORMAL» Y LA FILA IMPAR (Manuel, 25-nov-2026):
 *  · «un lugar para elegir el color pallet de la base… crear uno nuevo y unos ya set»;
 *  · «el automático dice Black Friday; el normal debería ser normal»;
 *  · «si una está desactivada, o sea un número impar, que incluya toda la fila».
 */
process.env.NEGOCIO = "depot";
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://test@localhost/test";

const C = await import("../src/domain/coloresDePieza.js");
const T = await import("../src/domain/temaDePieza.js");
const { PiecesConfigSchema } = await import("../src/services/settings.js");
const { renderPreviewPiece } = await import("../src/render/preview.js");
const { quotePosterDiaNoche } = await import("../src/render/diaNoche.js");

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const AZUL = { id: "propia-a1", nombre: "Azul de la casa", principal: "#0a5cff", destacado: "#00e0a4" };

describe("qué paleta lleva la pieza", () => {
  it("lo guardado antes de las paletas queda en la original: no se recolorea nada", () => {
    const cfg = PiecesConfigSchema.parse({ plantilla: "diaNoche" });
    expect(cfg.colores).toEqual(C.COLORES_INICIAL);
    expect(C.parDeColores(cfg.colores)).toBeNull();
    expect(C.parDeColores(null)).toBeNull();
  });

  it("una lista y una propia devuelven sus dos colores", () => {
    expect(C.parDeColores({ id: "azulRey", propias: [] })?.principal).toBe("#1d4ed8");
    expect(C.parDeColores({ id: AZUL.id, propias: [AZUL] })).toEqual({ principal: AZUL.principal, destacado: AZUL.destacado });
  });

  it("limpia lo que viene del panel: id inventado, color inválido, nombre largo, repetidas", () => {
    const limpio = C.coloresLimpios({
      id: "inventada",
      propias: [
        { ...AZUL, nombre: "  Azul   " + "x".repeat(60) },
        { ...AZUL },
        { id: "propia-b2", nombre: "Mala", principal: "rojo", destacado: "#ffffff" },
        { id: "otra", nombre: "Sin prefijo", principal: "#000000", destacado: "#ffffff" },
      ],
    });
    expect(limpio.id).toBe("original");
    expect(limpio.propias).toHaveLength(1);
    expect(limpio.propias[0].nombre.length).toBe(C.NOMBRE_MAXIMO);
  });

  it("todas las listas tienen nombre propio y colores válidos", () => {
    const nombres = new Set(C.COLORES_LISTOS.map((l) => l.nombre));
    expect(nombres.size).toBe(C.COLORES_LISTOS.length);
    for (const l of C.COLORES_LISTOS) {
      expect(l.principal).toMatch(/^#[0-9a-f]{6}$/);
      expect(l.destacado).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("recolorear", () => {
  const arbol = {
    type: "div",
    props: {
      style: { backgroundColor: "#E52C2A", boxShadow: "0 6px 16px rgba(229,44,42,0.35)", color: "#ffc93c" },
      children: [
        { type: "div", props: { style: { color: "#211a08" }, children: "Precio #e52c2a no se toca: es texto" } },
        { type: "img", props: { src: "data:image/png;base64,#e52c2a", style: {} } },
        { type: "path", props: { d: "M229,44,42", stroke: "#ff4b3e" } },
      ],
    },
  };

  it("sin par devuelve el mismo árbol", () => {
    expect(C.recolorear(arbol, null)).toBe(arbol);
  });

  it("cambia estilos y figuras; nunca el texto, la foto ni el trazo", () => {
    const r = C.recolorear(arbol, { principal: "#0a5cff", destacado: "#00e0a4" }) as typeof arbol;
    expect(r.props.style.backgroundColor).toBe("#0a5cff");
    expect(r.props.style.boxShadow).toBe("0 6px 16px rgba(10,92,255,0.35)");
    expect(r.props.style.color).toBe("#00e0a4");
    expect(r.props.children[0].props.children).toBe("Precio #e52c2a no se toca: es texto");
    expect((r.props.children[1].props as { src: string }).src).toBe("data:image/png;base64,#e52c2a");
    expect((r.props.children[2].props as { d: string }).d).toBe("M229,44,42");
    expect((r.props.children[2].props as { stroke: string }).stroke).not.toBe("#ff4b3e");
    // El original no se muta.
    expect(arbol.props.style.backgroundColor).toBe("#E52C2A");
  });

  it("una sola pasada: el dorado viejo como principal no se vuelve a cambiar", () => {
    const r = C.recolorear(arbol, { principal: "#ffc93c", destacado: "#e52c2a" }) as typeof arbol;
    expect(r.props.style.backgroundColor).toBe("#ffc93c");
    expect(r.props.style.color).toBe("#e52c2a");
  });

  it("sobre un destacado oscuro la tinta pasa a blanco", () => {
    const r = C.recolorear(arbol, { principal: "#16161a", destacado: "#14315f" }) as typeof arbol;
    expect((r.props.children[0].props.style as { color: string }).color).toBe("#ffffff");
  });
});

describe("el tema Normal y el automático de antes", () => {
  it("Normal no muestra la franja de temporada; los demás sí", () => {
    expect(T.muestraFranjaDeTemporada({ id: "ninguno" })).toBe(false);
    expect(T.muestraFranjaDeTemporada({ id: "automatico" })).toBe(true);
    expect(T.muestraFranjaDeTemporada({ id: "blackFriday" })).toBe(true);
    expect(T.muestraFranjaDeTemporada(null)).toBe(true);
    expect(T.nombreDelTema("ninguno")).toBe("Normal");
  });

  it("el automático guardado se ve como Black Friday con la promo y como Normal sin ella", () => {
    expect(T.temaQueSeVe("automatico", true)).toBe("blackFriday");
    expect(T.temaQueSeVe("automatico", false)).toBe("ninguno");
    expect(T.temaQueSeVe("navidad", true)).toBe("navidad");
  });
});

describe("la pieza dibujada", () => {
  const base = { pieza: "cotizacion", plantilla: "diaNoche", modo: "dia", ancho: 400 } as const;

  it("la paleta original sale idéntica a no pasar colores; otra paleta cambia la imagen", async () => {
    const sin = sha(await renderPreviewPiece({ ...base }));
    const original = sha(await renderPreviewPiece({ ...base, colores: { id: "original", propias: [] } }));
    const azul = sha(await renderPreviewPiece({ ...base, colores: { id: AZUL.id, propias: [AZUL] } }));
    expect(original).toBe(sin);
    expect(azul).not.toBe(sin);
  }, 60_000);
});

describe("lo incluido: la que queda sola ocupa toda la fila", () => {
  const linea = {
    brand: "KENDA", design: "KR20", sizeLabel: "205/50R16",
    loadSpeedLabel: "87W", loadSpeedTranslation: "545 kg máx · 270 km/h máx",
    quantity: 4, unitConIva: 100, pvpConIva: 130,
    availability: "available" as const, golpesMeses: 12, fabricaAnios: 5,
    photoUri: "data:image/png;base64,iVBORw0KGgo=", tag: null, posicionamiento: null, medidaExacta: true,
  };
  const pieza = (benefits: string[]) => JSON.stringify(quotePosterDiaNoche({
    number: "COT-1", dateLabel: "25/11/2026", line: linea, total: 400, benefits,
  } as never, "dia"));

  const TRES = ["Instalación completa con alineación y balanceo", "Seguro gratuito contra golpes y cortes", "Mantenimiento gratuito cada 10.000 km"];
  // La tarjeta que ocupa la fila entera: ícono al lado del texto.
  const ANCHA = '"alignItems":"center","gap":16,"padding":"18px 18px 20px"';
  // El relleno de antes: un recuadro vacío que solo ocupaba su mitad.
  const HUECO = '{"type":"div","props":{"style":{"display":"flex","flex":1},"children":[]}}';

  it("con 3, la tercera ocupa el renglón entero y no queda un hueco", () => {
    const con3 = pieza(TRES);
    expect(con3).toContain(ANCHA);
    expect(con3).not.toContain(HUECO);
  });

  it("con 4 (número par) todo sale como antes: dos por fila", () => {
    const con4 = pieza([...TRES, "Revisión gratuita de su vehículo"]);
    expect(con4).not.toContain(ANCHA);
    expect(con4).not.toContain(HUECO);
  });

  it("con una sola, igual que antes (ya ocupaba todo el ancho)", () => {
    expect(pieza([TRES[0]])).not.toContain(ANCHA);
  });
});
