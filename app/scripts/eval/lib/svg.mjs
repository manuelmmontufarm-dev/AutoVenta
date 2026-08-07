/**
 * Gráficos en SVG generados a mano.
 *
 * Por qué no una librería: el informe tiene que abrirse con doble clic desde el
 * escritorio de alguien que quizá no tiene internet en ese momento —y en Depot
 * pasa—. Cualquier `<script src="https://cdn…">` convierte el informe en una
 * página en blanco justo cuando se lo enseñas al cliente. Estas funciones
 * escupen SVG ya calculado: el HTML se abre igual dentro de seis meses.
 *
 * Nada de `xmlns` aquí: dentro de un documento HTML el SVG en línea no lo
 * necesita, y así el informe no tiene ni una URL en todo el archivo.
 */

export const esc = (t) => String(t ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const num = (n) => (Number.isFinite(n) ? n : 0);

/**
 * Barras horizontales pareadas (antes vs ahora).
 * @param {{etiqueta: string, antes: number, ahora: number, nota?: string}[]} filas
 */
export function barrasComparadas(filas, { ancho = 720, etiquetaAntes = "Antes", etiquetaAhora = "Ahora" } = {}) {
  if (filas.length === 0) return '<p class="vacio">Sin datos que graficar.</p>';
  const izquierda = 250;
  const altoFila = 44;
  const alto = filas.length * altoFila + 46;
  const util = ancho - izquierda - 60;
  const tope = Math.max(1, ...filas.map((f) => Math.max(num(f.antes), num(f.ahora))));
  const escala = (v) => Math.max(v > 0 ? 2 : 0, (num(v) / tope) * util);

  const barras = filas.map((f, i) => {
    const y = 30 + i * altoFila;
    const wA = escala(f.antes);
    const wB = escala(f.ahora);
    const mejora = num(f.ahora) < num(f.antes);
    return `
    <g>
      <text class="ejeY" x="${izquierda - 12}" y="${y + 15}" text-anchor="end">${esc(f.etiqueta)}</text>
      <rect class="barra antes" x="${izquierda}" y="${y}" width="${wA.toFixed(1)}" height="12" rx="2"/>
      <text class="valor" x="${izquierda + wA + 6}" y="${y + 11}">${num(f.antes)}</text>
      <rect class="barra ahora ${mejora ? "buena" : ""}" x="${izquierda}" y="${y + 16}" width="${wB.toFixed(1)}" height="12" rx="2"/>
      <text class="valor" x="${izquierda + wB + 6}" y="${y + 27}">${num(f.ahora)}</text>
      ${f.nota ? `<text class="nota" x="${izquierda - 12}" y="${y + 29}" text-anchor="end">${esc(f.nota)}</text>` : ""}
    </g>`;
  }).join("");

  return `<figure class="grafico">
  <svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Fallas detectadas antes y después">
    <g class="leyenda">
      <rect class="barra antes" x="${izquierda}" y="6" width="12" height="12" rx="2"/>
      <text class="valor" x="${izquierda + 18}" y="16">${esc(etiquetaAntes)}</text>
      <rect class="barra ahora" x="${izquierda + 90}" y="6" width="12" height="12" rx="2"/>
      <text class="valor" x="${izquierda + 108}" y="16">${esc(etiquetaAhora)}</text>
    </g>
    ${barras}
  </svg>
</figure>`;
}

/** Barra apilada de una sola fila, con su leyenda. Para los veredictos. */
export function barraApilada(segmentos, { ancho = 720, alto = 96 } = {}) {
  const total = segmentos.reduce((s, x) => s + num(x.valor), 0);
  if (total === 0) return '<p class="vacio">El juez no dejó veredictos.</p>';
  let x = 0;
  const trozos = segmentos.map((s) => {
    const w = (num(s.valor) / total) * ancho;
    const rect = `<rect class="seg ${s.clase}" x="${x.toFixed(1)}" y="0" width="${Math.max(0, w - 2).toFixed(1)}" height="34" rx="3"/>`;
    const etiqueta = w > 46
      ? `<text class="dentro" x="${(x + w / 2).toFixed(1)}" y="22" text-anchor="middle">${num(s.valor)}</text>`
      : "";
    x += w;
    return rect + etiqueta;
  }).join("");
  const leyenda = segmentos.map((s, i) => `
    <g transform="translate(${i * 200}, 54)">
      <rect class="seg ${s.clase}" x="0" y="0" width="12" height="12" rx="2"/>
      <text class="valor" x="18" y="11">${esc(s.etiqueta)} — ${num(s.valor)} (${total ? Math.round((num(s.valor) / total) * 100) : 0}%)</text>
    </g>`).join("");
  return `<figure class="grafico">
  <svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Veredictos del juez">${trozos}${leyenda}</svg>
</figure>`;
}

/** Histograma de notas 1–10, dos series superpuestas. */
export function histogramaNotas(serieVieja, serieNueva, { ancho = 720, alto = 260 } = {}) {
  const abajo = alto - 40;
  const arriba = 20;
  const izquierda = 34;
  const util = ancho - izquierda - 16;
  const paso = util / 10;
  const tope = Math.max(1, ...serieVieja, ...serieNueva);
  const barra = (v, i, clase, desplazamiento) => {
    const h = (num(v) / tope) * (abajo - arriba);
    const w = paso * 0.36;
    const x = izquierda + i * paso + paso * 0.08 + desplazamiento * w;
    return `<rect class="barra ${clase}" x="${x.toFixed(1)}" y="${(abajo - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>`;
  };
  const ejes = Array.from({ length: 10 }, (_, i) =>
    `<text class="ejeX" x="${(izquierda + i * paso + paso / 2).toFixed(1)}" y="${abajo + 16}" text-anchor="middle">${i + 1}</text>`).join("");
  return `<figure class="grafico">
  <svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Histograma de notas del juez">
    <line class="eje" x1="${izquierda}" y1="${abajo}" x2="${ancho - 8}" y2="${abajo}"/>
    ${serieVieja.map((v, i) => barra(v, i, "antes", 0)).join("")}
    ${serieNueva.map((v, i) => barra(v, i, "ahora", 1)).join("")}
    ${ejes}
    <text class="ejeX" x="${izquierda}" y="${alto - 6}">nota del juez (1 = ahuyenta al cliente · 10 = cierra la venta)</text>
    <g class="leyenda">
      <rect class="barra antes" x="${ancho - 210}" y="4" width="12" height="12" rx="2"/>
      <text class="valor" x="${ancho - 192}" y="14">bot viejo</text>
      <rect class="barra ahora" x="${ancho - 110}" y="4" width="12" height="12" rx="2"/>
      <text class="valor" x="${ancho - 92}" y="14">bot nuevo</text>
    </g>
  </svg>
</figure>`;
}

/** Barras verticales simples con etiqueta debajo. Para "modelo por respuesta". */
export function barrasSimples(filas, { ancho = 720, alto = 240 } = {}) {
  if (filas.length === 0) return '<p class="vacio">Sin datos.</p>';
  const abajo = alto - 46;
  const arriba = 24;
  const paso = (ancho - 20) / filas.length;
  const tope = Math.max(1, ...filas.map((f) => num(f.valor)));
  const cuerpo = filas.map((f, i) => {
    const h = (num(f.valor) / tope) * (abajo - arriba);
    const w = Math.min(120, paso * 0.5);
    const x = 10 + i * paso + (paso - w) / 2;
    return `
    <g>
      <rect class="barra ahora" x="${x.toFixed(1)}" y="${(abajo - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>
      <text class="valor" x="${(x + w / 2).toFixed(1)}" y="${(abajo - h - 6).toFixed(1)}" text-anchor="middle">${num(f.valor)}</text>
      <text class="ejeX" x="${(x + w / 2).toFixed(1)}" y="${abajo + 18}" text-anchor="middle">${esc(f.etiqueta)}</text>
      ${f.sub ? `<text class="nota" x="${(x + w / 2).toFixed(1)}" y="${abajo + 34}" text-anchor="middle">${esc(f.sub)}</text>` : ""}
    </g>`;
  }).join("");
  return `<figure class="grafico">
  <svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Respuestas por modelo">${cuerpo}</svg>
</figure>`;
}
