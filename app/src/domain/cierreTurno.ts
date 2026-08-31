import { isExplicitPurchaseConfirmation } from "./salesIntent.js";

const normalizar = (texto: string) =>
  (texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const CIERRE_SUAVE =
  /^(?:no\s+(?:muchas\s+)?gracias(?:[\s,]+(?:esto|esta|queda)\s+fuera\s+de\s+mi\s+presupuesto)?|no\s+por\s+el\s+momento(?:[\s,]+gracias)?|por\s+ahora\s+no|mejor\s+no|dejeme\s+pensar(?:lo)?|lo\s+pienso|despues\s+le\s+aviso|luego\s+le\s+aviso|ya\s+tengo\s+una\s+oferta(?:\s+de\s+llantas)?(?:\s+\d{3}\s*[/ -]\s*\d{2}\s*(?:[/ -]\s*|r)\s*\d{2})?|sin\s+compromiso[^.!?]{0,40}gracias|bueno\s+gracias)[\s.,!¡🙏🤝]*$/;

/**
 * Un "no" puede traer información que sí hay que conservar: "205 muy ancha,
 * roza cargado" rechaza una medida, no toda la conversación. Esos mensajes
 * siguen al agente para que anote la restricción; los cierres breves no.
 */
const TRAE_RESTRICCION_DE_LLANTA =
  /\b(?:anch[ao]s?|angost[ao]s?|delgad[ao]s?|roz\w*|perfil|bache\w*|consumo|cargad\w*|calce)\b/;

const ACUSE = /^(?:ok|oka|okay|okey|listo|perfecto|bueno|bien|gracias|muy\s+gentil(?:[\s,]+gracias)?|👍|🤝)[\s.,!👍🤝]*$/;
const INFORMA_OFERTA_AJENA =
  /^ya\s+tengo\s+una\s+oferta(?:\s+de\s+llantas)?(?:\s+\d{3}\s*[/ -]\s*\d{2}\s*(?:[/ -]\s*|r)\s*\d{2})?[\s.,!]*$/;

function esRechazoSuave(textoNormalizado: string): boolean {
  return CIERRE_SUAVE.test(textoNormalizado)
    && !TRAE_RESTRICCION_DE_LLANTA.test(textoNormalizado);
}

export type CierreDelTurno =
  | "compra_terminada"
  | "oferta_ajena"
  | "rechazo_suave"
  | "acuse_del_cierre";

export function tipoDeCierreDelTurno(
  texto: string,
  anteriorDelCliente: string | null = null,
): CierreDelTurno | null {
  const actual = normalizar(texto);
  if (!actual) return null;
  if (isExplicitPurchaseConfirmation(actual)) return "compra_terminada";
  if (INFORMA_OFERTA_AJENA.test(actual)) return "oferta_ajena";
  if (esRechazoSuave(actual)) {
    return "rechazo_suave";
  }
  if (ACUSE.test(actual)) {
    const anterior = normalizar(anteriorDelCliente ?? "");
    if (anterior && (isExplicitPurchaseConfirmation(anterior) || esRechazoSuave(anterior))) {
      return "acuse_del_cierre";
    }
  }
  return null;
}

export function esCierreComercialDelTurno(texto: string): boolean {
  return tipoDeCierreDelTurno(texto) !== null;
}

export function respuestaDeCierreDelTurno(tipo: CierreDelTurno): string {
  if (tipo === "compra_terminada") {
    return "Gracias por avisarnos. Me alegra que ya haya resuelto su compra. Quedamos a las órdenes para otra ocasión. 🤝";
  }
  if (tipo === "oferta_ajena") {
    return "Gracias por contarnos. Me alegra que ya tenga una alternativa para comparar. Quedamos a las órdenes si más adelante nos necesita. 🤝";
  }
  if (tipo === "acuse_del_cierre") return "Con gusto. Quedamos a las órdenes. 🤝";
  return "Entendido, gracias por avisar. Quedamos a las órdenes si más adelante lo necesita. 🤝";
}
