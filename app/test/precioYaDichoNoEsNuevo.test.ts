/**
 * UN PRECIO QUE YA ESTÁ EN PANTALLA NO ES UNA OFERTA NUEVA.
 *
 * El candado `guardian_no_vende_solo` existe porque el Ángel Guardián llegó a
 * inventar vitrinas enteras (27-ago, convs 11986 y 11972). Compara el borrador
 * con la corrección y, si aparece un precio que no estaba, restaura el
 * borrador.
 *
 * Para no tirar correcciones legítimas mira también «lo ya dicho en el ciclo»,
 * que incluye el metadato de la imagen de opciones — ahí viven los precios de
 * los tres escalones. Pero el extractor solo reconocía importes escritos como
 * *para el cliente* (`$143.53`, `143.53 c/u con IVA`), y en el metadato el
 * precio viaja como `"precio_con_iva":143.53`. Resultado: el precio que el
 * cliente está VIENDO en la imagen contaba como nuevo.
 *
 * Costó 7 correcciones buenas en la auditoría del 8 al 11-sep. Lo que salió en
 * su lugar fue el borrador malo:
 *
 *   conv 18871 · CLIENTE: «Juego de llantas... Que opciones tiene y precio»
 *               BORRADOR: «Quedo atento a lo que necesite. 🤝»
 *               GUARDIÁN: la respuesta con los precios de la lámina
 *               CANDADO: bloqueado por `precio_nuevo` → salió «Quedo atento»
 *
 * Igual en 5008, 17647, 18113, 18262, 18342, 18348 y 18893.
 */
import { describe, expect, it } from "vitest";
import { frenarHechosNuevosDelGuardian } from "../src/domain/guardianNoVendeSolo.js";

/** El metadato tal como lo guarda `preparar_opciones`. */
const METADATO_DE_LA_LAMINA = JSON.stringify({
  piece: "options",
  codes: ["350214", "307FB637"],
  escalones: {
    premium: { codigo: "350214", nombre: "FALKEN WILDPEAK A/T TRAIL", precio_con_iva: 143.53 },
    economica: { codigo: "307FB637", nombre: "KENDA KR33A", precio_con_iva: 98.4 },
  },
});

describe("el precio de la lámina ya es conocido", () => {
  it("conv 18871: la corrección con los precios de la imagen NO se bloquea", () => {
    const r = frenarHechosNuevosDelGuardian(
      "Quedo atento a lo que necesite. 🤝",
      "La *FALKEN WILDPEAK A/T TRAIL* está en *$143.53 c/u con IVA* y la *KENDA KR33A* en *$98.40*.",
      [],
      `Opciones enviadas: FALKEN WILDPEAK A/T TRAIL · KENDA KR33A\n${METADATO_DE_LA_LAMINA}`,
    );
    expect(r.bloqueado).toBe(false);
    expect(r.texto).toContain("143.53");
  });

  it("pero un precio que NO está en ninguna parte sigue frenado", () => {
    const r = frenarHechosNuevosDelGuardian(
      "Quedo atento a lo que necesite. 🤝",
      "Le dejo la *KENDA KR20* en *$82.42 c/u con IVA*.",
      [],
      `Opciones enviadas: FALKEN WILDPEAK A/T TRAIL\n${METADATO_DE_LA_LAMINA}`,
    );
    expect(r.bloqueado).toBe(true);
    expect(r.motivos).toContain("precio_nuevo");
    expect(r.texto).toBe("Quedo atento a lo que necesite. 🤝");
  });

  it("el precio escrito al cliente también sigue contando como conocido", () => {
    const r = frenarHechosNuevosDelGuardian(
      "Con gusto.",
      "Esa queda en *$143.53 c/u con IVA*.",
      [],
      "Es la única que tengo: *FALKEN WILDPEAK A/T TRAIL* — $143.53 c/u con IVA.",
    );
    expect(r.bloqueado).toBe(false);
  });

  it("una medida dentro del metadato no se confunde con un precio", () => {
    // `sizeLabel: "215/65R16"` y `"quantity":4` no son importes: si contaran,
    // el candado dejaría pasar cualquier precio que terminara en esos dígitos.
    const meta = JSON.stringify({ piece: "quote", sizeLabel: "215/65R16", quantity: 4 });
    const r = frenarHechosNuevosDelGuardian(
      "Con gusto.",
      "Le dejo la KENDA KR20 en *$215.65 c/u con IVA*.",
      [],
      `Cotización enviada\n${meta}`,
    );
    expect(r.bloqueado).toBe(true);
  });
});
