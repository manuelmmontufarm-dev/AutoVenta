/**
 * El reporte del día, en HTML.
 *
 * Es la versión que se abre desde el celular: mismo contenido que el PDF, pero
 * con los links vivos y el ancho de una pantalla. La paleta es la del hub
 * (carbón cálido, salvia para el dinero, arena para las esperas, rojo suave
 * para lo roto) sobre papel claro en vez del fondo oscuro del panel: esto se
 * lee a las ocho de la noche y a veces se imprime, y un fondo negro no sirve
 * para ninguna de las dos cosas.
 *
 * Todo va en un archivo: sin CSS externo, sin fuentes remotas, sin JS. Se sirve
 * desde el propio bot y tiene que verse igual dentro de WhatsApp, que no carga
 * casi nada de fuera.
 */
import type { FilaCliente, FilaError, FilaTecnica, ReporteDiario } from "../services/dailyReport.js";
import { resolvePalette } from "./depotDesign.js";
import { areaSemana, barrasConversaciones, barrasKanban, donaCotizado, type Fuentes } from "./reportCharts.js";

/**
 * Los gráficos escriben con las fuentes de la página, no con las del PDF.
 *
 * En el PDF son familias registradas en pdfmake; aquí son nombres CSS con sus
 * alternativas, porque este archivo no carga fuentes de fuera —tiene que verse
 * dentro de WhatsApp, que apenas descarga nada— y cae a las del sistema.
 */
const FUENTES: Fuentes = {
  texto: '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
  cifra: '"Source Serif 4", Georgia, serif',
};

function esc(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(valor: number | null): string {
  if (valor == null) return "—";
  return `$${valor.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** «3 d», «7 h», «22 min» — cuánto lleva esperando, en el mínimo de caracteres. */
export function espera(desde: string | null, ahora: Date): string {
  if (!desde) return "";
  const minutos = Math.max(0, Math.floor((ahora.getTime() - new Date(desde).getTime()) / 60_000));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `${horas} h`;
  return `${Math.floor(horas / 24)} d`;
}

function filaCliente(fila: FilaCliente, ahora: Date): string {
  const espera_ = espera(fila.esperaDesde, ahora);
  const chips = [
    fila.medida ? `<span class="chip">${esc(fila.medida)}</span>` : "",
    fila.local ? `<span class="chip">📍 ${esc(fila.local)}</span>` : "",
    espera_ ? `<span class="chip">⏱ ${espera_}</span>` : "",
  ].join("");
  const cuando = fila.cuando
    ? `<span class="cuando ${fila.vencida ? "vencida" : ""}">🗓 ${esc(fila.cuando)}${fila.vencida ? " · no vino" : ""}</span>`
    : "";
  return `
    <a class="fila ${fila.vencida ? "urgente" : ""}" href="${esc(fila.link)}">
      <div class="fila-cab">
        <span class="nombre">${esc(fila.nombre)}</span>
        <span class="monto">${money(fila.monto)}</span>
      </div>
      <p class="motivo">${esc(fila.motivo)}</p>
      <div class="pie">
        <div class="chips">${cuando}${chips}</div>
        <span class="abrir">abrir chat →</span>
      </div>
    </a>`;
}

function filaError(fila: FilaError): string {
  return `
    <a class="fila error" href="${esc(fila.link)}">
      <div class="fila-cab">
        <span class="nombre">${esc(fila.nombre)}</span>
        <span class="abrir">abrir chat →</span>
      </div>
      <p class="motivo">${esc(fila.motivo)}</p>
    </a>`;
}

function filaTecnica(fila: FilaTecnica): string {
  return `<li><span class="tel">${esc(fila.telefono)}</span> <span class="tec-et">${esc(fila.etiqueta)}</span>${fila.veces > 1 ? `<span class="veces">×${fila.veces}</span>` : ""}</li>`;
}

function seccion(input: {
  icono: string;
  titulo: string;
  sub: string;
  total: number;
  vacio: string;
  cuerpo: string;
  mostradas: number;
}): string {
  return `
  <section class="bloque">
    <div class="bloque-cab">
      <h2>${input.icono} ${esc(input.titulo)}</h2>
      <span class="conteo">${input.total}</span>
    </div>
    <p class="sub">${esc(input.sub)}</p>
    ${input.total === 0 ? `<p class="vacio">${esc(input.vacio)}</p>` : input.cuerpo}
    ${input.total > input.mostradas ? `<p class="mas">y ${input.total - input.mostradas} más en el panel</p>` : ""}
  </section>`;
}

/** Tarjeta del tablero: rótulo, explicación y el gráfico dentro. */
function grafico(titulo: string, sub: string, ...svg: string[]): string {
  return `
  <figure class="grafico">
    <figcaption>
      <h3>${esc(titulo)}</h3>
      <p>${esc(sub)}</p>
    </figcaption>
    ${svg.join("")}
  </figure>`;
}

export function renderDailyReportHtml(r: ReporteDiario): string {
  const ahora = new Date(r.generadoEn);
  const m = r.resumen;
  const s = r.semana;
  const tarjetas: Array<[string, string, string]> = [
    ["Clientes nuevos", String(m.clientesNuevos), ""],
    ["Escribieron", String(m.clientesQueEscribieron), `${s.escribieron} en la semana`],
    // Sin cotizaciones no se escribe «$0.00»: un cero con dos decimales se lee
    // como un dato y es sólo la ausencia del dato.
    ["Cotizaciones", String(m.cotizacionesEnviadas), m.cotizacionesEnviadas ? money(m.montoCotizado) : ""],
    ["Dijeron cuándo vienen", String(m.visitasAgendadas), ""],
    ["Ventas cerradas", String(m.ventasGanadas), m.ventasGanadas ? money(m.montoGanado) : ""],
  ];
  // Aparte de las cinco del día: no mira hacia atrás, dice cuánta plata cotizada
  // sigue sobre la mesa esperando un empujón.
  const enJuego = `$${Math.round(Number.isFinite(m.montoEnJuego) ? m.montoEnJuego : 0).toLocaleString("en-US")}`;

  // Los gráficos son exactamente los mismos del PDF —mismo módulo, misma
  // paleta del negocio— y no una versión web aparte: si el reporte impreso y el
  // que se abre en el teléfono dibujaran distinto, uno de los dos mentiría.
  const p = resolvePalette(r.paleta);
  const punto = (valor: (dia: typeof s.dias[number]) => number) =>
    s.dias.map((dia) => ({ etiqueta: dia.etiqueta, esHoy: dia.esHoy, valor: valor(dia) }));

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.negocio)} — reporte del ${esc(r.dia)}</title>
<style>
  :root {
    --ink: #262624; --ink-2: #55534d; --faint: #8a877e;
    --paper: #f7f4ec; --card: #fffdf7; --line: rgba(38, 38, 36, .1);
    --salvia: #5f7a52; --arena: #9a7b34; --rojo: #b3554c; --violeta: #6f56c4;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px 48px; background: var(--paper); color: var(--ink);
    font: 15px/1.5 "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .hoja { max-width: 720px; margin: 0 auto; }
  header { border-bottom: 2px solid var(--ink); padding-bottom: 14px; margin-bottom: 22px; }
  .marca { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--faint); font-weight: 700; }
  h1 { font: 700 27px/1.15 "Source Serif 4", Georgia, serif; margin: 6px 0 4px; }
  .periodo { font-size: 12px; color: var(--ink-2); margin: 0; }

  /* Tres por fila incluso en un teléfono estrecho: los números son el resumen,
     no el reporte, y si ocupan la primera pantalla entera el asesor tiene que
     hacer scroll para llegar a lo único que puede accionar. */
  .tarjetas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 24px; }
  @media (min-width: 560px) { .tarjetas { grid-template-columns: repeat(6, 1fr); } }
  .tarjeta.destacada { border-color: color-mix(in srgb, var(--salvia) 45%, transparent); }
  .tarjeta.destacada .n { color: var(--salvia); font-size: 17px; }
  .tarjeta { background: var(--card); border: 1px solid var(--line); border-radius: 11px; padding: 8px 9px; }
  /* Las dos alturas mínimas son las que dejan las cinco tarjetas parejas: sin
     ellas, las que no llevan monto quedan medio vacías y las de etiqueta larga
     empujan la fila entera hacia abajo. */
  .tarjeta .et { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--faint); font-weight: 700; line-height: 1.25; min-height: 2.5em; }
  .tarjeta .n { font: 700 21px/1.05 "Source Serif 4", Georgia, serif; margin-top: 3px; }
  .tarjeta .extra { font-size: 10px; color: var(--salvia); font-weight: 700; min-height: 1.3em; }

  /* Dos columnas en pantalla ancha, una en el teléfono. El gráfico de la
     semana ocupa la fila entera porque es una serie de siete días: partido a
     media pantalla, los días se apelmazan y deja de leerse la tendencia. */
  .tablero { display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 26px; }
  @media (min-width: 620px) {
    .tablero { grid-template-columns: 1fr 1fr; }
    .tablero .ancho { grid-column: 1 / -1; }
  }
  /* Los gráficos se quedan sobre papel claro también en modo oscuro: llevan sus
     colores dentro del SVG —los de la marca, los mismos del PDF— y sobre fondo
     negro los ejes y las etiquetas desaparecerían. Es una hoja impresa dentro
     de la página, y se lee como tal. */
  .grafico { background: #fffdf6; border: 1px solid var(--line); border-radius: 14px; padding: 13px 14px 14px; margin: 0; }
  .grafico figcaption { border-bottom: 1px solid #e6dfcd; padding-bottom: 9px; margin-bottom: 10px; }
  .grafico h3 { font: 800 11px/1.2 "Inter", sans-serif; letter-spacing: .09em; text-transform: uppercase; color: #23262b; margin: 0; }
  .grafico figcaption p { font-size: 11px; color: #8b8778; margin: 3px 0 0; }
  .grafico svg { display: block; width: 100%; height: auto; }
  .grafico svg + svg { margin-top: 4px; }

  .bloque { margin-bottom: 26px; }
  .bloque-cab { display: flex; align-items: center; gap: 9px; }
  .bloque-cab h2 { font: 700 16px/1.2 "Inter", sans-serif; margin: 0; }
  .conteo { font-size: 11.5px; font-weight: 800; background: rgba(38,38,36,.07); border-radius: 999px; padding: 2px 9px; }
  .sub { font-size: 11.5px; color: var(--faint); margin: 3px 0 11px; }
  .vacio { font-size: 13px; color: var(--faint); font-style: italic; background: var(--card); border: 1px dashed var(--line); border-radius: 12px; padding: 14px; margin: 0; }
  .mas { font-size: 11.5px; color: var(--faint); margin: 9px 0 0; }

  .fila {
    display: block; text-decoration: none; color: inherit; background: var(--card);
    border: 1px solid var(--line); border-left: 3px solid var(--salvia);
    border-radius: 12px; padding: 11px 13px; margin-bottom: 7px;
  }
  .fila.error, .fila.urgente { border-left-color: var(--rojo); }
  .fila-cab { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .nombre { font-weight: 700; font-size: 14.5px; }
  .monto { font-weight: 800; font-size: 14.5px; color: var(--salvia); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .abrir { font-size: 11.5px; font-weight: 700; color: var(--violeta); white-space: nowrap; }
  .motivo { font-size: 12.5px; color: var(--ink-2); margin: 4px 0 0; }
  /* El "abrir chat" va en TODAS las tarjetas: la tarjeta entera ya era un
     enlace, pero nada lo indicaba y el asesor no iba a descubrirlo. */
  .pie { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; margin-top: 7px; }
  .pie .chips { margin-top: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
  .chip, .cuando { font-size: 10.5px; font-weight: 700; border-radius: 999px; padding: 2px 8px; background: rgba(38,38,36,.06); color: var(--ink-2); }
  .cuando { background: rgba(95,122,82,.13); color: var(--salvia); }
  .cuando.vencida { background: rgba(179,85,76,.13); color: var(--rojo); }

  .tecnico { background: rgba(38,38,36,.04); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .tecnico ul { list-style: none; margin: 8px 0 0; padding: 0; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12.5px; }
  .tecnico li { padding: 3px 0; display: flex; gap: 9px; align-items: baseline; }
  .tel { font-weight: 700; }
  .tec-et { color: var(--faint); font-size: 11.5px; font-family: "Inter", sans-serif; }
  .veces { color: var(--rojo); font-weight: 700; font-size: 11.5px; }

  .cta { display: block; text-align: center; background: var(--ink); color: var(--paper); text-decoration: none;
    font-weight: 700; font-size: 14px; border-radius: 12px; padding: 13px; margin: 30px 0 16px; }
  footer { text-align: center; font-size: 11px; color: var(--faint); }

  @media (prefers-color-scheme: dark) {
    :root { --ink: #f5f4ee; --ink-2: #bdbab2; --faint: #8f8c84; --paper: #262624; --card: #30302e;
            --line: rgba(245,244,238,.1); --salvia: #a9c39d; --arena: #cdb989; --rojo: #c96b62; --violeta: #a78bfa; }
    header { border-bottom-color: var(--line); }
    .conteo, .chip { background: rgba(245,244,238,.08); }
    .tecnico { background: rgba(245,244,238,.04); }
    .cta { background: var(--paper); color: var(--ink); border: 1px solid var(--line); }
  }
</style>
</head>
<body>
<div class="hoja">
  <header>
    <p class="marca">${esc(r.negocio)} · reporte del día</p>
    <h1>${esc(r.dia)}</h1>
    <p class="periodo">${esc(r.periodo)}</p>
  </header>

  <div class="tarjetas">
    ${tarjetas.map(([et, n, extra]) => `
    <div class="tarjeta">
      <p class="et">${esc(et)}</p>
      <p class="n">${esc(n)}</p>
      <p class="extra">${esc(extra)}</p>
    </div>`).join("")}
    <div class="tarjeta destacada">
      <p class="et">En juego sin cerrar</p>
      <p class="n">${esc(enJuego)}</p>
      <p class="extra">${r.cotizados.total} cotizados pendientes</p>
    </div>
  </div>

  <div class="tablero">
    ${grafico(
      "Cuánto se cotizó",
      "Hoy dentro de la semana, y la semana dentro de todo",
      donaCotizado({ hoy: m.montoCotizado, semana: s.montoCotizado, total: r.acumulado.montoCotizado }, p, FUENTES),
    )}
    ${grafico(
      "Movimiento del kanban",
      "Cuánta gente entró a cada columna esta semana",
      barrasKanban(
        r.fases.map((fase) => ({ nombre: fase.corto, hoy: fase.hoy, semana: fase.semana, perdido: fase.etapa === "perdido" })),
        p, FUENTES,
      ),
    )}
    <div class="ancho">${grafico(
      "La semana, día por día",
      "Plata cotizada arriba; cuántos clientes escribieron abajo",
      areaSemana(punto((dia) => dia.monto), p, FUENTES),
      barrasConversaciones(punto((dia) => dia.escribieron), p, FUENTES),
    )}</div>
  </div>

  ${seccion({
    icono: "💰", titulo: "Cotizados — a un empujón",
    sub: "Ya tienen precio. Primero los que prometieron venir y no aparecieron.",
    total: r.cotizados.total, mostradas: r.cotizados.filas.length,
    vacio: "Nadie con cotización pendiente.",
    cuerpo: r.cotizados.filas.map((f) => filaCliente(f, ahora)).join(""),
  })}

  ${seccion({
    icono: "🙋", titulo: "Piden asesor",
    sub: "Pidieron hablar con alguien, van a llamar o el bot no alcanzó. Ordenados por quién espera hace más.",
    total: r.pidenAsesor.total, mostradas: r.pidenAsesor.filas.length,
    vacio: "Nadie esperando un asesor.",
    cuerpo: r.pidenAsesor.filas.map((f) => filaCliente(f, ahora)).join(""),
  })}

  ${seccion({
    icono: "⚠️", titulo: "Errores en la conversación",
    sub: "El bot se rompió dentro del chat. Abre y responde a mano.",
    total: r.errores.total, mostradas: r.errores.filas.length,
    vacio: "Ningún chat se rompió hoy.",
    cuerpo: r.errores.filas.map(filaError).join(""),
  })}

  ${r.tecnicos.total === 0 ? "" : `
  <section class="bloque">
    <div class="bloque-cab">
      <h2>🔧 Problemas técnicos</h2>
      <span class="conteo">${r.tecnicos.total}</span>
    </div>
    <p class="sub">No son tareas del asesor: esto lo revisa el desarrollador. Van sólo los números afectados.</p>
    <div class="tecnico">
      <ul>${r.tecnicos.filas.map(filaTecnica).join("")}</ul>
    </div>
  </section>`}

  <a class="cta" href="${esc(r.linkOportunidades)}">Abrir Oportunidades y gestionar →</a>
  <footer>Generado automáticamente por el bot · ${esc(r.negocio)}</footer>
</div>
</body>
</html>`;
}
