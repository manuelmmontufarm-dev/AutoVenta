/**
 * Versión visible del panel y qué trajo cada una.
 *
 * Existe porque no había forma de saber, mirando el panel, si un cambio ya
 * había entrado o seguías viendo el build anterior. El badge de arriba muestra
 * la versión; al tocarlo se ve qué cambió.
 *
 * `COMMIT` lo inyecta Vite al compilar (ver vite.config.ts). Si el commit que
 * responde el servidor no coincide con este, el panel avisa: significa que una
 * mitad se desplegó y la otra no.
 */
export const VERSION = "v0.9.0";

/** SHA corto del commit con el que se compiló este panel. */
export const COMMIT: string =
  typeof __GIT_SHA__ === "string" && __GIT_SHA__ ? __GIT_SHA__ : "local";

export interface Cambio {
  version: string;
  fecha: string;
  titulo: string;
  puntos: string[];
}

/** Más reciente primero. Cada entrada es lo que el negocio nota, no el diff. */
export const CAMBIOS: Cambio[] = [
  {
    version: "v0.9.0",
    fecha: "5 de agosto de 2026",
    titulo: "Dos tableros por ventana de 24 h, y puesta al día del pipeline",
    puntos: [
      "El Pipeline se parte en dos: arriba lo que el bot todavía puede contestar (dentro de 24 h) y abajo lo que ya solo puedes contestar tú.",
      "Botón para poner al día las tarjetas que quedaron atrás cuando el bot estuvo apagado, moviendo solo las que tienen medida o visita ya identificada.",
      "Botón para que el bot conteste lo que quedó sin respuesta, únicamente dentro de la ventana de 24 h.",
      "Este badge de versión: al tocarlo ves qué trajo cada actualización.",
      "Arreglado: al cambiar de pantalla, la anterior se quedaba montada encima.",
    ],
  },
  {
    version: "v0.8.0",
    fecha: "4 de agosto de 2026",
    titulo: "Piezas nuevas y pestaña Ajustes",
    puntos: [
      "Cotización, comparativa y opciones con el diseño aprobado.",
      "Pestaña Ajustes: promociones, colores, tipografía y qué dice el bot de cada marca, con vista previa en vivo.",
      "El logo DT lleva a Configuración técnica; Ajustes queda solo con lo del negocio.",
      "Arreglado: la pantalla de Ajustes no dejaba bajar.",
    ],
  },
  {
    version: "v0.7.0",
    fecha: "4 de agosto de 2026",
    titulo: "Mensajes cortos: la imagen es el mensaje",
    puntos: [
      "El bot dejó de repetir en texto lo que la imagen ya muestra.",
      "Manda varios mensajes cortos seguidos en vez de uno largo.",
      "Siempre recomienda una opción y explica por qué.",
      "Volvió el bloque INCLUYE después de cada precio.",
      "Contador en Métricas de piezas enviadas contra fallidas.",
    ],
  },
];
