/**
 * EL CLIENTE QUE NO ESTÁ EN QUITO.
 *
 * Familia más grande de la auditoría del 8 al 11-sep: 31 errores. El patrón es
 * siempre el mismo — el cliente dice dónde está, el bot lo entiende y contesta
 * bien, y un segundo después le pega igual «¿A cuál local le queda mejor ir,
 * Cumbayá o Quito Sur?».
 *
 *   conv 18106: «Estoy en guayaquil»
 *   BOT: «En Guayaquil no tenemos local de atención…»
 *   BOT: «¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍»
 *
 * Pasó igual en 17934 (Guayaquil), 18025 (Tulcán), 18234 (Loja), 18302 (Santo
 * Domingo), 18417 (Ibarra), 17668 (Esmeraldas) y 18262 (San Lorenzo, donde
 * además había pedido envío por Servientrega).
 *
 * Pero «fuera de Quito» no siempre significa que no venga. Dos chats de la
 * misma semana lo muestran: 18821 («Soy de Santo Domingo» … «Yo el lunes voy a
 * estar en quito») y 18221 («Yo les aviso el día que suba a la ciudad de
 * Quito»). Ahí el local SÍ corresponde: viene él.
 *
 * Por eso son tres estados y no dos.
 */
import { describe, expect, it } from "vitest";
import { dondeEstaElCliente } from "../src/domain/fueraDeCobertura.js";

describe("dónde está el cliente", () => {
  it("los chats de la semana: fuera de cobertura y sin plan de venir", () => {
    const casos: [string, string][] = [
      ["Soy de Guayaquil", "Guayaquil"],
      ["Estoy en guayaquil", "Guayaquil"],
      ["Soy de TULCÁN ya le molestare gracias", "Tulcán"],
      ["Yo soy de la provincia de Loja", "Loja"],
      ["Yo vivo en santo domingo", "Santo Domingo"],
      ["Vivo en esmeraldas", "Esmeraldas"],
      ["En Sto. Domingo", "Santo Domingo"],
      ["Talvez disponen local en la ciudad de Ibarra", "Ibarra"],
      ["para San Lorenzo, provincia Esmeralda", "Esmeraldas"],
    ];
    for (const [texto, ciudad] of casos) {
      const r = dondeEstaElCliente(texto);
      expect(r?.estado, texto).toBe("fuera");
      expect(r?.ciudad, texto).toBe(ciudad);
    }
  });

  it("«no vivo en Quito» y «no viajo a Quito» son fuera, aunque nombren Quito (conv 18603)", () => {
    expect(dondeEstaElCliente("Estamos jodudos no vivo en Quito")?.estado).toBe("fuera");
    expect(dondeEstaElCliente("No viajo a Quito")?.estado).toBe("fuera");
  });

  it("el que viene a Quito SÍ puede coordinar local (convs 18821 y 18221)", () => {
    expect(dondeEstaElCliente("Yo el lunes voy a estar en quito")?.estado).toBe("viene");
    expect(dondeEstaElCliente("Yo les aviso el día que suba a la siudad de Quito")?.estado).toBe("viene");
    expect(dondeEstaElCliente("la próxima semana subo a Quito")?.estado).toBe("viene");
  });

  it("el que ya está en cobertura no es «fuera»", () => {
    for (const t of ["Soy de Quito", "estoy en Cumbayá", "vivo en el valle de los chillos", "por el sur de Quito"]) {
      expect(dondeEstaElCliente(t)?.estado, t).not.toBe("fuera");
    }
  });

  it("un mensaje sin lugar no dice nada", () => {
    for (const t of ["205/55R16", "Gracias", "¿cuánto cuesta?", "quiero 4 llantas"]) {
      expect(dondeEstaElCliente(t), t).toBeNull();
    }
  });

  it("una medida o una marca no se confunde con una ciudad", () => {
    // «Manta» es ciudad y también parte de «le monta»; «Loja» aparece en textos
    // largos. Se exige la forma en que la gente dice dónde está.
    expect(dondeEstaElCliente("esa llanta le monta bien")).toBeNull();
    expect(dondeEstaElCliente("la Kenda KR29 en 245/75R16")).toBeNull();
  });
});
