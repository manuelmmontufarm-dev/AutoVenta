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
export const VERSION = "v0.12.3";

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
    version: "v0.12.3",
    fecha: "9 de agosto de 2026",
    titulo: "El panel se instala como app — chat pegado al teclado",
    puntos: [
      "Desde Safari: Compartir → \"Añadir a pantalla de inicio\". El panel abre a pantalla completa, sin la barra del navegador — la dirección esa que se colaba entre el chat y el teclado desaparece.",
      "El composer del chat queda pegado al teclado: se quitó la franja blanca muerta que aparecía debajo al escribir.",
      "Ojo: la app instalada guarda su propia sesión — la primera vez pide la clave administrativa de nuevo.",
    ],
  },
  {
    version: "v0.12.2",
    fecha: "9 de agosto de 2026",
    titulo: "Chat de la baraja sin fugas en iPhone + kanban móvil sin arrastres",
    puntos: [
      "Al escribir en la baraja ya no se puede 'scrollear' y ver la tarjeta vieja detrás: el chat sigue al teclado de iPhone y ocupa siempre exactamente lo visible.",
      "Ahora se decide sin salir del chat: botones ✕ (perdida) y ✓ (ganada / para después) en la cabecera.",
      "Kanban en el celular: ver es scroll y mover es un botón — '⇄ Mover de etapa' abre una lista de etapas para tocar, en vez del arrastre que se peleaba con el dedo.",
    ],
  },
  {
    version: "v0.12.1",
    fecha: "9 de agosto de 2026",
    titulo: "Responder desde la baraja ahora es una pantalla completa",
    puntos: [
      "Tocar \"Responder\" en la baraja abre el chat a pantalla completa, como una app de mensajes: la conversación ocupa todo, el teclado no tapa nada y el campo queda listo para escribir.",
      "Al enviar, el chat pasa automáticamente a ustedes y el bot se pausa; el botón de arriba lo devuelve al bot cuando terminen.",
      "Arreglado el 'zoom fantasma' del celular: las animaciones ya no agrandan la pantalla hasta recargar.",
    ],
  },
  {
    version: "v0.12.0",
    fecha: "9 de agosto de 2026",
    titulo: "Oportunidades reorganizado: cuadrícula, baraja y Para después",
    puntos: [
      "Tres vistas grandes: Cotizados (fecha de visita, monto, ubicación, medida y llanta de un vistazo), Piden asesor y Errores del bot.",
      "Revisar uno por uno: baraja estilo swipe — izquierda perdida, derecha ganada o \"para después\" — con el chat adentro para responder sin salir.",
      "Banda \"Para después\": lo que revisaste y va bien queda arriba de todo hasta que lo cierres.",
      "En el celular ya se ven las 6 pestañas de abajo (Métricas y Ajustes quedaban fuera de la pantalla).",
    ],
  },
  {
    version: "v0.11.0",
    fecha: "5 de agosto de 2026",
    titulo: "Medidas en pulgadas y la imagen deja de ser opcional",
    puntos: [
      "El bot ya entiende medidas como 30x9.5R15. Antes no las reconocía y decía que no había stock aunque sí hubiera.",
      "30x9.5 y 30x9.50 pasan a ser la misma medida: el catálogo las trae escritas de las dos formas y media bodega quedaba invisible.",
      "El bot tiene prohibido escribir las opciones como lista de precios en el chat: siempre manda la imagen.",
      "Tu chat de prueba volvió al bot (estaba tomado por un humano, por eso no te contestaba).",
    ],
  },
  {
    version: "v0.10.0",
    fecha: "5 de agosto de 2026",
    titulo: "Tipos de llanta, 3 opciones y las piezas visibles en el chat",
    puntos: [
      "El bot ya sabe el tipo de cada modelo (H/T, A/T, R/T, M/T, turismo, comercial): ahora entiende «quiero una R17 A/T».",
      "Manda 3 opciones y no 6 — una premium, una de equilibrio y una económica.",
      "En el chat del panel se ve la imagen que se le mandó al cliente, con aviso claro si no le llegó.",
      "Los avisos salen a varios asesores, no a uno solo; se administran desde Ajustes.",
      "Arreglado: el bot escribía **negrita** de Markdown, que en WhatsApp se ve con los asteriscos.",
    ],
  },
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
