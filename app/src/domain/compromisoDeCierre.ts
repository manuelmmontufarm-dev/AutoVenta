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
 * explícita (producto o cantidad registrados).
 *
 * Una lámina de opciones SOLA no es elección (auditoría 9-nov, 39769 y 39887):
 * el cliente vio el menú, no eligió nada, y el candado le pegaba «¿A cuál local
 * le queda mejor ir…?» a quien solo estaba comparando precios. La pieza se
 * sigue reportando para quien la quiera leer, pero no decide.
 */
export interface SenalesDeCompromiso {
  hayCotizacionFormal: boolean;
  hayPiezaDeOpciones: boolean;
  productoElegido: boolean;
  cantidadElegida: boolean;
}

export function hayCompromisoDeCierre(senales: SenalesDeCompromiso): boolean {
  if (senales.hayCotizacionFormal) return true;
  return senales.productoElegido || senales.cantidadElegida;
}
