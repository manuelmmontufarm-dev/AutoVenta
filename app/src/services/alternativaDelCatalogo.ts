/**
 * LA ALTERNATIVA QUE EL GUARDIÁN NOMBRA DEL CATÁLOGO DE HOY (auditoría 9-nov,
 * sprint 5d).
 *
 *   40017 · CLIENTE «En labrado mixto» (tenía cotizada la Falken ZIEX CT60
 *           A/S, H/T). El Guardián (`tipo_negado_con_stock`) ofreció la WINRUN
 *           MAXCLAW A/T con stock a $124.76 —lo correcto—, `guardian_no_vende_solo`
 *           podó producto y precio por «nuevos» y salió «La Falken que ya le
 *           coticé es H/T…; no es A/T.», sin alternativa ni pregunta.
 *
 * Cuando el hallazgo es `tipo_negado_con_stock` o `stock_prometido`, una llanta
 * del catálogo de HOY que es de la MEDIDA de la conversación, del TIPO pedido y
 * con stock para el JUEGO es un hecho que el Guardián recibió: puede nombrarse,
 * con SU precio dicho por el helper único (`precioDelProducto`). Cualquier otra
 * sigue siendo una vitrina inventada (11986) y se poda como siempre.
 *
 * Si lo que queda no termina en pregunta, sale un respaldo fijo con el hecho
 * (el tipo de lo que tenía) y una pregunta.
 */
import { sql } from "../db/client.js";
import type { CatalogItem } from "../domain/catalog.js";
import { mencionaProducto } from "../domain/guardianNoVendeSolo.js";
import { JUEGO_COMPLETO, mismaMedida, tipoSolicitadoEn } from "../domain/opcionesCandados.js";
import type { OpcionDeLamina } from "../domain/ofertaVigente.js";
import { precioDelProducto } from "../domain/promocionDeTemporada.js";
import { tipoDeProducto } from "../domain/tireTypes.js";
import { extractTireSizes } from "../domain/tireSize.js";
import { tiposPrincipalesDelUso, usoDeLosTextos } from "../domain/usoYTipo.js";
import { politica } from "../negocio/politica.js";
import { findByCode, searchBySize } from "./catalog.js";
import { cantidadDelCliente } from "./lineasConPromo.js";

/** Las categorías del Guardián bajo las que una alternativa del catálogo cuenta como hecho. */
export const CATEGORIAS_CON_ALTERNATIVA: ReadonlySet<string> = new Set(["tipo_negado_con_stock", "stock_prometido"]);

export interface AlternativaDelCatalogo {
  medida: string;
  /** Los tipos que pidió («A/T», «R/T»); vacío si no pidió ninguno. */
  tiposPedidos: readonly string[];
  /** Las llantas nombradas en la corrección que cuentan como hecho. */
  permitidas: CatalogItem[];
  /** «WINRUN MAXCLAW A/T — $124.76 c/u con IVA», una por línea: se suma a lo ya dicho. */
  hecho: string;
  /** Las permitidas como lámina, para leer la oferta del texto que sale. */
  lamina: OpcionDeLamina[];
  /** El texto fijo cuando la poda no dejó nada: el hecho de lo que tenía y la pregunta. */
  respaldo: string;
  /** Solo la pregunta: va como bloque al final de lo podado que no terminaba en pregunta. */
  pregunta: string;
}

const tipoDe = (p: { code: string; design: string }) => tipoDeProducto(p.code, p.design);

export async function alternativaDelCatalogo(
  conversationId: number,
  correccion: string,
  mencionados: readonly CatalogItem[],
  textoDelCliente?: string | null,
): Promise<AlternativaDelCatalogo | null> {
  const [ficha] = await sql<{ tire_size: string | null; selected_product_code: string | null; current_cycle: number }[]>`
    select tire_size, selected_product_code, current_cycle from conversations where id = ${conversationId}
  `;
  if (!ficha) return null;
  const elegida = ficha.selected_product_code ? findByCode(ficha.selected_product_code) ?? null : null;
  const medida = ficha.tire_size ?? elegida?.sizeLabel ?? null;
  const tamano = medida ? extractTireSizes(medida)[0] : null;
  if (!medida || !tamano) return null;

  // Lo que pidió, del mensaje más nuevo al más viejo: el tipo escrito («AT») o el
  // uso («labrado mixto» → A/T, R/T).
  const filas = await sql<{ content: string | null }[]>`
    select content from messages
    where conversation_id = ${conversationId} and cycle = ${ficha.current_cycle} and direction = 'inbound'
    order by created_at desc, id desc limit 6
  `;
  const textos = [textoDelCliente ?? "", ...filas.map((f) => f.content ?? "")].filter(Boolean);
  const escrito = tipoSolicitadoEn(textos);
  const tiposPedidos = escrito ? [escrito] : tiposPrincipalesDelUso(usoDeLosTextos(textos));
  const delTipo = (p: CatalogItem) => !tiposPedidos.length || tiposPedidos.includes(tipoDe(p) ?? "");

  const juego = (await cantidadDelCliente(conversationId, textoDelCliente)).cantidad ?? JUEGO_COMPLETO;
  const permitidas = mencionados.filter((p) =>
    mencionaProducto(correccion, p)
    && mismaMedida(p.sizeLabel, medida)
    && delTipo(p)
    && (p.stock ?? 0) >= juego);

  const hecho = permitidas
    .map((p) => `${p.brand} ${p.design} ${p.sizeLabel} — ${precioDelProducto(politica.promocionDeTemporada, p, juego).texto}`)
    .join("\n");
  const lamina = permitidas.map((p) => ({ codigo: p.code, marca: p.brand, diseno: p.design, medida: p.sizeLabel }));

  // El respaldo: el hecho de lo que tenía y la pregunta que mueve la venta.
  const tipoPedido = tiposPedidos[0] ?? null;
  const tipoDeLaElegida = elegida ? tipoDe(elegida) : null;
  // Con stock para el JUEGO, como `permitidas` (revisión ronda 1, m5).
  const hayDelTipo = searchBySize(tamano).some((p) => mismaMedida(p.sizeLabel, medida) && delTipo(p) && (p.stock ?? 0) >= juego);
  const hechoDeLaElegida = elegida && tipoDeLaElegida && tipoPedido && !tiposPedidos.includes(tipoDeLaElegida)
    ? `En ${medida} la *${elegida.brand} ${elegida.design}* es *${tipoDeLaElegida}*.`
    : null;
  const pregunta = tipoPedido
    ? hayDelTipo
      ? `¿Le muestro las ${tipoPedido} que tengo en ${medida}?`
      : `En ${medida} hoy no tengo ${tipoPedido} para el juego de ${juego}. ¿Le muestro otras opciones en esa medida?`
    : `¿Le muestro las opciones que tengo en ${medida}?`;
  const respaldo = [hechoDeLaElegida, pregunta].filter(Boolean).join(" ");

  return { medida, tiposPedidos, permitidas, hecho, lamina, respaldo, pregunta };
}
