/**
 * ¿La conversación ya está en cierre comercial aunque no haya PDF en `quotes`?
 *
 * Conv 13909 (Oswaldo, 1-sep): opciones enviadas, «Premium» elegido, precio
 * dado, local elegido, pregunta del día hecha — y cero filas en `quotes` porque
 * `generar_cotizacion` se bloqueó en turnos anteriores. El candado de insistir
 * solo miraba `quotes` y se callaba; el guardián interpretó «Gracias» como cierre.
 *
 * Señales conservadoras: solo cuenta en etapas de cierre (`cotizacion_enviada` /
 * `seguimiento_venta` — eso lo filtra quien llama) y cuando ya hubo elección
 * explícita (pieza de opciones, producto o cantidad registrados).
 */
export interface SenalesDeCompromiso {
  hayCotizacionFormal: boolean;
  hayPiezaDeOpciones: boolean;
  productoElegido: boolean;
  cantidadElegida: boolean;
}

export function hayCompromisoDeCierre(senales: SenalesDeCompromiso): boolean {
  if (senales.hayCotizacionFormal) return true;
  return (
    senales.hayPiezaDeOpciones
    || senales.productoElegido
    || senales.cantidadElegida
  );
}
