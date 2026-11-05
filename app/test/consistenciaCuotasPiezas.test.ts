/**
 * CONSISTENCIA ENTRE LA POLÍTICA Y LOS TEXTOS DE LAS PIEZAS (R-45).
 *
 * La verdad comercial de las cuotas vive en `politica.cuotasSinIntereses`
 * (Sprint 4), pero los textos de pago de las piezas viven en `perfil.piezas`
 * (Sprint 1). Nadie une los dos: una pieza podría prometer «3 y 6 meses» a un
 * cliente cuya política no ofrece cuotas. Esta prueba fija el contrato: con
 * `cuotasSinIntereses: null`, ningún texto de pago de las piezas menciona
 * meses, cuotas ni diferidos. Un `[PENDIENTE]` no cuenta: nunca llega al
 * cliente (R-10).
 */
import { describe, expect, it } from "vitest";
import { DEPOT } from "../src/negocio/negocios/depot.js";
import { EJEMPLO } from "../src/negocio/negocios/ejemplo.js";
import { MUNDILLANTAS } from "../src/negocio/negocios/mundillantas.js";
import { POLITICA_DEPOT } from "../src/negocio/politicas/depot.js";
import { POLITICA_EJEMPLO } from "../src/negocio/politicas/ejemplo.js";
import { POLITICA_MUNDILLANTAS } from "../src/negocio/politicas/mundillantas.js";

const PAREJAS = [
  { perfil: DEPOT, politica: POLITICA_DEPOT },
  { perfil: EJEMPLO, politica: POLITICA_EJEMPLO },
  { perfil: MUNDILLANTAS, politica: POLITICA_MUNDILLANTAS },
];

const HABLA_DE_CUOTAS = /\bcuotas?\b|\bmeses\b|diferido/i;

describe("sin cuotas en la política, las piezas no las mencionan", () => {
  for (const { perfil, politica } of PAREJAS) {
    it(`${perfil.id} (cuotasSinIntereses: ${JSON.stringify(politica.cuotasSinIntereses)})`, () => {
      const textosDePago = [
        perfil.piezas.condiciones,
        perfil.piezas.condicionesDiaNoche,
        perfil.piezas.mediosDePago,
        perfil.piezas.mediosDePagoDiaNoche,
      ].filter((t) => Boolean(t) && !t.startsWith("[PENDIENTE]"));
      if (politica.cuotasSinIntereses) return; // Depot: sus piezas sí las dicen.
      for (const texto of textosDePago) {
        const hallado = HABLA_DE_CUOTAS.exec(texto);
        expect(hallado ? `${perfil.id}: «${texto}»` : null).toBeNull();
      }
    });
  }
});
