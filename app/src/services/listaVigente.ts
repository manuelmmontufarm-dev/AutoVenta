/**
 * LA LISTA VIGENTE DE LA PIEZA (auditoría 9-nov-2026, familia 2a).
 *
 * `listaDeLaPieza` devuelve la lista TAL COMO el cliente la vio: sirve al turno
 * normal (qué quiso decir con «la 2») pero NO a un recordatorio que sale horas
 * o días después. El seguimiento copiaba esos precios guardados: 26
 * seguimientos en 17 chats dijeron «KENDA KR601 $194.85 c/u · 4 = $779.40» el
 * 7-nov cuando ya valía «2 × $259.80 + 2 × $103.92 = $727.44», y el Guardián
 * los daba por buenos porque los recibía como «dato duro». El 1-dic habría
 * pasado al revés: «(−60 % en la 2.ª llanta)» con la promo apagada.
 *
 * Esta función conserva de la pieza lo que es HECHO de la lámina —los códigos,
 * la cantidad, el orden y los nombres (la «1, 2, 3» que el cliente leyó)— y
 * vuelve a pedir lo que cambia con los días: el precio de hoy al catálogo y la
 * promo de HOY, dicha con el helper único de `promocionDeTemporada` (fechas y
 * compuerta incluidas). Si un código ya no tiene stock para el juego o precio,
 * o el catálogo no está cargado, NO hay precios: la lista es `null` y quedan
 * los nombres (nunca se cae a lo guardado).
 *
 * La usan los DOS lectores del seguimiento —la plantilla (`followUps.ts`) y el
 * Guardián en su rama de seguimiento (`guardian.ts`)— para que vean la misma
 * lista. El turno normal sigue usando `listaDeLaPieza`.
 */
import { listaDeLaPieza, type LineaDeLista } from "../domain/listaDeOpciones.js";
import { precioDelProducto } from "../domain/promocionDeTemporada.js";
import { politica } from "../negocio/politica.js";
import { catalogStatus, findByCode } from "./catalog.js";

export interface ListaVigente {
  /** Con el precio y la promo de hoy; `null` si no se puede decir un precio fiable. */
  lista: LineaDeLista[] | null;
  /** Los nombres en el orden que el cliente leyó (1, 2, 3), siempre que la pieza los tenga. */
  nombres: string[];
  cantidad: number;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

export function listaVigenteDeLaPieza(
  metadata: { escalones?: unknown; cantidad?: unknown } | null | undefined,
  ahora: Date = new Date(),
): ListaVigente | null {
  const guardada = listaDeLaPieza(metadata);
  if (!guardada) return null;
  const { lista, cantidad } = guardada;
  const nombres = lista.map((l) => l.nombre);
  const sinPrecios: ListaVigente = { lista: null, nombres, cantidad };
  if (catalogStatus().items === 0) return sinPrecios;

  const vigente: LineaDeLista[] = [];
  for (const linea of lista) {
    const producto = linea.codigo ? findByCode(linea.codigo) : undefined;
    const precio = Number(producto?.minimumPriceWithTax);
    if (!producto || !(precio > 0) || !(Number(producto.stock) >= cantidad)) return sinPrecios;
    const { segunda } = precioDelProducto(politica.promocionDeTemporada, producto, cantidad, { ahora });
    vigente.push({
      n: linea.n,
      codigo: linea.codigo ?? null,
      nombre: linea.nombre,
      precio: centavos(precio),
      total: segunda ? segunda.totalConIva : centavos(precio * cantidad),
      ...(segunda ? { segundaLlanta: segunda } : {}),
    });
  }
  return { lista: vigente, nombres, cantidad };
}
