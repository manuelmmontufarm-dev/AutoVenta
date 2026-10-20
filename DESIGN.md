# Hub Depot Tire — reglas de diseño del rediseño

Este archivo reemplaza a `DESIGN.md` de la raíz cuando el rediseño se apruebe.
Mientras tanto vive acá para poder compararlo con lo que hay.

Sirve para dos cosas:

1. Que el Hub deje de parecer hecho por una IA.
2. Que quien lo construya (persona o modelo) tenga decisiones ya tomadas en vez
   de gusto propio. Un modelo sin restricciones no elige: promedia su entrenamiento,
   y el promedio de internet es exactamente el look que queremos matar.

---

## 1. El diagnóstico: hoy el Hub está hecho de tells

Esto no es opinión. Es lo que hay en `hub/src` a hoy, contado:

| Lo que hay | Cuenta | Por qué es un tell |
| --- | --- | --- |
| `rounded-2xl` + `rounded-3xl` | 147 | La esquina redonda por defecto de shadcn, aplicada a todo |
| Gradientes (`linear`/`radial`) | 20 | Orbes "aurora" violeta/cian/magenta de fondo |
| `--color-violet: #a78bfa` como acción primaria | — | El violeta-índigo: **el Times New Roman del diseño generado por IA** |
| `IconSparkle` | 10 usos, incluido el icono de Oportunidades | La chispita = IA. Es literalmente el tell nombrado en los catálogos |
| Inter + Space Grotesk + Space Mono + Source Serif | 4 familias | El set exacto de "fuentes gratis con buen gusto" que todo modelo elige |
| `backdrop-blur` + textura de ruido + `::selection` violeta | — | Glassmorphism decorativo |
| `useCountUp` en las cifras | — | Números que suben solos: tell de plantilla |
| `border-left: 3px solid violet` | 4 sitios | "Side tab": el tell más reconocible según el detector |

El comentario en `tokens.css` lo dice sin querer: *"tema Claude Oscuro × Aurora
Glass"*. El Hub está pintado con la paleta de la herramienta que lo escribió.
Eso es precisamente lo que un cliente nota sin saber nombrarlo.

Segundo problema, distinto: **`DESIGN.md` de la raíz describe otro producto.**
Documenta "Showroom GP" (fondo `#f5f6f4`, rojo `#de2636`, Archivo Black, franja
de pista). El código corre un tema oscuro violeta. La documentación quedó atrás
y nadie la está obedeciendo. El rediseño arregla las dos cosas o no arregla ninguna.

---

## 2. Las tres leyes

**Ley 1 — Decidir es el trabajo.**
"Limpio y moderno" no es una dirección: es el nombre del promedio. Cada eje
—color, tipografía, radio, densidad, movimiento— se decide a propósito y se
escribe acá. Lo que no está decidido acá, el modelo lo va a rellenar con el
promedio de internet.

**Ley 2 — El Hub es una herramienta, no una landing.**
Modo *operar*: el asesor está en una tarea, no admirando una pantalla. La
familiaridad es una virtud. Lo raro sin motivo (botones decorados, controles
inventados, movimiento gratis) cuesta confianza. La marca vive en la precisión
de los detalles, no en el volumen.

**Ley 3 — El diseño sale del producto, no de un estilo.**
Depot Tire vende llantas en Quito por WhatsApp desde hace 30 años. El material
del producto es: la medida (`245/40 R18`), el stock real de Contífico, la hora
del último mensaje, la ventana de 24 h de Meta, el nombre del cliente. De ahí
sale la identidad. Prueba para cada decisión: *¿la tomaría igual para cualquier
otro CRM?* Si sí, no es una decisión: es el promedio otra vez.

---

## 3. Lista negra

Nada de esto entra. No se suaviza: se reescribe el elemento.

### Color
- Gradiente violeta→azul, o violeta→magenta, en cualquier superficie.
- Orbes o halos radiales de fondo. Nada de "aurora".
- Texto con gradiente (`bg-clip-text`). El énfasis es peso o tamaño.
- Crema + terracota (la otra salida fácil: los colores de la interfaz de Claude).
- Paleta de shadcn sin tocar.
- Acentos a saturación plena en estados inactivos.

### Tipografía
- **Inter prohibida.** Igual Space Grotesk, Space Mono, Geist, Instrument Serif,
  Fraunces y Source Serif 4. Es el set que delata.
- Nada de fuentes declaradas y no cargadas.
- Nada de tipografía fluida (`clamp`) en UI de producto.
- Monoespaciada sólo para dato, medida, código y tiempo. Nunca como disfraz de
  "técnico".

### Forma
- `rounded-2xl shadow-lg` como reflejo. El radio se decide una vez, por familia
  de componente, y se respeta.
- Glass y `backdrop-blur` como decoración. Sólo si hay algo real detrás que deba
  verse.
- Borde de color lateral de más de 1 px en tarjetas, ítems o avisos (*side tab*).
- Sombras sin desplazamiento. Un halo de color centrado no es profundidad: es adorno.
- Icono dentro de cuadradito redondeado, en fila.
- Tarjetas anidadas. Una tarjeta dentro de otra siempre está mal.
- La tarjeta como estructura de la página. La tarjeta es para contenido que se
  acciona por separado; agrupar se hace con aire, proximidad y tipografía.

### Composición
- Chip-píldora arriba de un título (*kicker* / *eyebrow*). Prohibido sin excepción.
- Rejilla de tres tarjetas iguales como sección.
- La plantilla cifra-grande + etiqueta-chica + acento, repetida.
- Números de sección (01 / 02 / 03) si la secuencia no informa nada.
- Modal para una tarea que no necesita interrumpir.
- Sparklines, anillos de progreso y rectángulos con sombra como relleno donde
  debería haber contenido.

### Movimiento
- La misma entrada `fade-up` en todas las secciones.
- Easing con rebote.
- Cifras que suben solas al cargar (`useCountUp`).
- Secuencias de carga coreografiadas. El producto abre en una tarea.
- Ignorar `prefers-reduced-motion`.

### Iconos y copy
- **La chispita de IA.** `IconSparkle` sale del producto, empezando por el icono
  de Oportunidades.
- Emojis y glifos sueltos (`✓`, `✕`, `★`, `⚖`) como iconos. Todo icono es SVG
  dibujado, un solo grosor, una sola familia.
- Puntitos de color de estado que no significan un estado definido.
- "Potenciá", "Impulsá", "Sin fricción", "Empezar". El copy nombra la acción.

---

## 4. El mundo visual

**Dirección elegida: A — «Taller»** (24-sep-2026). Las otras dos se descartaron.

Las tres comparten estas restricciones:

- **Una sola familia tipográfica** para toda la UI, más una monoespaciada sólo
  para medidas, precios, horas y códigos.
- **Fuentes auto-hospedadas** (`@fontsource/*`), no `<link>` a Google Fonts. El
  Hub abre en un taller con internet de taller.
- **Cuatro a seis colores con rol**, y el acento reservado para acción primaria,
  selección actual e indicador de estado. Nunca para decorar.
- **Una escala de tamaños fija en `rem`**, razón 1.125–1.2, sin `clamp`.
- **Piso de 11 px** para todo texto que haya que leer para trabajar.
- **Numerales tabulares** en toda cifra que se compare en columna.

### Dirección A — "Taller"

Claro, papel cálido, una tinta, una señal. La herencia de Depot sin el disfraz
de carreras: el rojo se queda, pero apagado a ladrillo para que sobreviva sobre
blanco y sólo aparezca donde hay que actuar.

- Tipografía: **Archivo** (ya está en el proyecto) + **JetBrains Mono**.
- Fondo `#f7f6f3`, superficie `#ffffff`, tinta `#1c1b19`, apagado `#6f6b64`,
  línea `rgba(28,27,25,.10)`.
- Señal única: ladrillo `#b4453a`. Positivo `#2f6f4f`. Aviso `#a8731f`.
- Radio: panel 10 px, tarjeta 8 px, control 6 px, chip cápsula.
- Por qué: es un CRM que se usa a la luz del día, junto a un mostrador. Claro
  es la decisión correcta por la escena de uso, no por categoría.

## 5. El detalle firma

Un producto reconocible tiene **un** gesto propio, derivado de su material. Acá
es la **placa de medida**: `245/40 R18` compuesto en la monoespaciada, con
numerales tabulares, una línea de pelo debajo y el rin como única cifra en peso
mayor. Aparece en la lista, en la ficha, en la cotización y en la imagen que
sale por WhatsApp. Siempre igual. Es lo único que se permite repetir como firma.

No hay un segundo gesto. Dos firmas no son firma.

---

## 6. Densidad, espaciado, ritmo

- Escala de 4 px. Grupos apretados, separación generosa entre grupos.
- Más aire arriba de un título que abajo. El título pertenece a lo que sigue.
- Prosa a 65–75 caracteres. Las tablas pueden ir a 120+.
- Margen mínimo: 16 px en móvil, 24 px en escritorio.
- El espaciado es **regular, no monótono**: si todos los huecos miden igual, no
  hay agrupación y el ojo no encuentra dónde empezar.

## 7. Color con significado

Regla dura: **si más de un tercio de las tarjetas de una vista están pintadas,
el color dejó de significar algo.** (Esta regla viene del `DESIGN.md` viejo y es
de lo poco que hay que conservar entero: era correcta.)

- Fondo tonal: sólo para lo que exige actuar hoy.
- "Sin fecha", "Programado", "En seguimiento" son texto. Se distinguen por icono
  y peso.
- Un contador no es una alarma. Once cotizaciones abiertas son trabajo.
- Ningún estado depende sólo del color: siempre hay texto, cifra o forma.

## 8. Movimiento

- 150–250 ms en casi todo. El usuario está en flujo.
- Un solo momento con intención por pantalla, no efectos repartidos.
- Salida exponencial desde un estado ya visible. Nada entra desde la nada.
- El movimiento comunica estado: cambio, feedback, carga, revelado. Nada más.
- El arrastre del Kanban y el gesto de la baraja de Oportunidades son
  funcionalidad y se conservan tal cual.
- `prefers-reduced-motion` respetado en todo.

## 9. Los siete estados

Ningún componente interactivo se da por terminado sin: **normal, hover, foco de
teclado, activo, deshabilitado, cargando, error**. Falta uno, no está hecho.

- Carga: esqueleto con la forma de lo que va a llegar. Nunca un spinner suelto
  en medio del contenido.
- Vacío: enseña la pantalla y ofrece **una** salida. Los vacíos del Hub hoy ya
  son buenos ("Todo al día", "Ningún chat roto"): se conservan textuales.
- Error: qué pasó y qué puede hacer la persona. Los mensajes concretos que ya
  existen no se cambian por un toast genérico.

## 10. Las superficies que no dibujaste

El tell más barato de todos, y el que los modelos saltan siempre. Todo esto se
tematiza desde la paleta:

- Selección de texto (`::selection`).
- El cursor de escritura (`caret-color`).
- Barras de desplazamiento.
- Anillo de foco (`:focus-visible`) y su separación.
- Desplazamiento del subrayado de los enlaces.
- Numerales tabulares en tablas y cifras (`font-variant-numeric: tabular-nums`).

## 11. Copy

- En español, corto, natural, sin jerga interna.
- El botón nombra su acción: "Copiar cotización", no "Continuar".
- El error nombra el problema y la salida.
- El copy actual del Hub es bueno y está en la voz del negocio. **Se conserva
  literal** salvo que haya una razón concreta. Reescribirlo "más lindo" es
  introducir voz de IA donde no la había.

## 12. Accesibilidad

- Contraste 4.5:1 en texto y placeholder; 3:1 en texto grande.
- Texto secundario sobre superficie de color se tiñe de ese tono, nunca gris.
- Iconos decorativos con `aria-hidden="true"`.
- Botón que es sólo icono lleva `aria-label`.
- Objetivo táctil mínimo 40 px.
- Jerarquía de encabezados sin saltos.

---

## 13. Criterio de aceptación

Antes de dar una pantalla por hecha:

1. ¿Se entiende para qué sirve en menos de cinco segundos?
2. ¿Hay **una** acción primaria por momento de decisión?
3. ¿Cada componente interactivo tiene los siete estados?
4. ¿Lo urgente **se ve** urgente, y lo normal no está pintado?
5. ¿Menos de un tercio de las tarjetas llevan fondo tonal?
6. ¿Ningún texto funcional baja de 11 px, tampoco en móvil?
7. ¿Selección, caret, scrollbar y foco están tematizados?
8. ¿Las cifras que se comparan usan numerales tabulares?
9. ¿No hay un solo emoji fuera del mensaje que escribió el cliente?
10. ¿No queda ninguna chispita, ningún gradiente violeta, ningún halo radial?
11. ¿Funciona en móvil sin texto encimado y con el teclado?
12. ¿Se parece a la pantalla de al lado? La consistencia es la virtud acá.

### Comprobación mecánica

```bash
# 1. Tells de IA, en el código
node ~/.claude/skills/impeccable/scripts/detect.mjs hub/src

# 2. Tells de IA, en el render (requiere: npm i -D puppeteer)
node ~/.claude/skills/impeccable/scripts/detect.mjs "http://localhost:5199/#/inbox"
node ~/.claude/skills/impeccable/scripts/detect.mjs "http://localhost:5199/#/inbox" --viewport 390x844

# 3. Restos concretos del mundo viejo
grep -rn "IconSparkle\|a78bfa\|aurora\|backdrop-blur\|useCountUp" hub/src
grep -rn "Inter\|Space Grotesk\|Space Mono\|Source Serif" hub/index.html hub/src

# 4. Emojis fuera del contenido
grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' hub/src --include="*.tsx"
```

El detector lee este archivo: si acá están declarados los colores, fuentes,
tamaños y radios del sistema, las reglas `design-system-color`,
`design-system-font`, `design-system-font-size` y `design-system-radius`
marcan cualquier valor que se salga. Por eso la sección 4 tiene que quedar con
**una sola** dirección y sus valores exactos.

---

# Parte II — Alcance y claridad (decisiones del 24-sep-2026)

Esta parte manda sobre la Parte I donde choquen. La Parte I dice cómo se ve;
ésta dice **qué hay** y **qué tan fácil tiene que ser seguirlo**.

## 14. La idea en una frase

Que alguien que nunca vio el Hub entienda en cinco segundos qué está pasando
con las ventas de hoy, y en diez qué tiene que hacer. Nada brillante, nada
«crazy», nada que haya que descubrir. Simple, directo, se sigue con el dedo.

## 15. Lectura de la referencia (monday CRM)

Se compartió una captura de monday CRM como inspiración. Lo que hay que tomar
de ahí y lo que no, dicho con nombre:

**Tomar**
- Cada bloque tiene **un título en lenguaje llano** («Deal stages», «Deal info»)
  y hace **una sola cosa**. Se entiende sin leer el contenido.
- La barra de etapas horizontal como columna vertebral: se ve dónde está el
  trato sin abrirlo.
- Campos etiqueta / valor en dos columnas, alineados, sin decoración. La
  información se lee como un formulario impreso.
- Mucho aire entre bloques, texto grande, jerarquía por tamaño y peso.

**No tomar**
- Las chispitas «AI» y sus iconos arcoíris. Son exactamente el tell de la Parte I.
- Las barras de color en el borde izquierdo de las tarjetas (*side tab*).
- El vidrio rosado con brillo y la sombra de color del panel flotante.
- Los iconos dentro de cuadraditos redondeados de colores.

La referencia sirve por su **claridad estructural**, no por su piel.

## 16. Principios de claridad que se aplican

De la investigación sobre paneles claros, lo que aplica acá y cómo:

1. **Divulgación progresiva** (Nielsen Norman): tres capas. Arriba, la cifra
   que importa. Debajo, la tendencia que le da contexto. El detalle fila por
   fila, sólo al pedirlo. Nunca las tres capas a la vez en el mismo bloque.
2. **Razón dato-tinta** (Tufte): si un píxel no informa, se borra. Fuera
   gradientes de fondo, marcos dobles, leyendas que repiten lo que ya dice el
   título.
3. **Reconocer antes que recordar** (heurística 6 de Nielsen): todo lo que hay
   que saber para actuar está en pantalla. No hay que acordarse de en qué
   pestaña estaba la cosa.
4. **Estética y diseño minimalista** (heurística 8): cada elemento extra
   compite con los que sí importan. Una pantalla con menos cosas se entiende
   más rápido que una con más cosas bien ordenadas.
5. **Un gráfico se lee solo:** ejes con valores visibles, unidades, y el valor
   exacto al pasar el cursor. Un gráfico sin ejes es decoración, no dato.
6. **Cada dato con su dibujo:** todo bloque de información numérica lleva al
   menos un gráfico que ayude a leerlo. No para adornar: para que la cifra
   tenga escala.

## 17. Qué queda, qué se va, qué se mueve

Esto redefine el inventario funcional. Lo que no aparece acá como «se va» o
«se mueve» sigue tal cual.

### Navegación
Pasa de seis a **cuatro** entradas: **Inbox · Pipeline · Cotizador · Métricas**,
más **Ajustes** como engranaje, no como pestaña de primer nivel.

### Inbox
- **Se va** el filtro «Alertas del bot». Nadie lo usa.
- **Se va** el filtro Abiertos / Cerrados / Todos. Son demasiados para que
  importe la distinción. Queda **una lista** con el buscador.
- La lista se ordena por lo que exige acción primero (regla §7) y se lee de un
  vistazo: nombre, medida, último mensaje, hora, quién atiende.

### Oportunidades
- **Se va entera.** Incluida la baraja de «Revisar uno por uno» (`SwipeReview`,
  el «Tinder»). Lo que esa pantalla ordenaba (cotizados por cerrar, visita
  agendada, piden asesor) ya está en Inbox y Pipeline.

### Pipeline
- Se queda la **barra de progreso / embudo** como cabecera: una franja
  horizontal con las etapas y cuántos tickets hay en cada una.
- **No hace falta hacer clic** para ver los tickets. Debajo de cada etapa se
  ven **unas pocas tarjetas** (tres o cuatro) y, si hay más, se desplaza
  **dentro de la caja**, sin que la pantalla crezca.
- La tarjeta dice lo justo para decidir sin abrirla: nombre, medida, último
  mensaje, hora.
- El arrastre entre etapas se conserva.

### Cotizador
- Funciona perfecto. **No se toca la función**; sólo se le aplica la piel nueva.
- Las piezas que genera (PDF, imagen para WhatsApp) salen con la identidad nueva.

### Métricas
- Los KPIs están bien y se quedan.
- **«Conversaciones por día»** y **«¿A qué hora contestan más?»**: hoy no se
  entiende qué muestran. Van con **eje X y eje Y rotulados con valores**, y al
  pasar el cursor por un punto se ve **el valor exacto** (día y cantidad; hora
  y cantidad).
- **Toda sección** («Impacto de descuentos autorizados», «Inventario real»,
  «Tokens y cuenta del servicio», y las demás) lleva **al menos un gráfico**
  que ayude a leer el dato. Mismas reglas: ejes, unidades, valor al pasar.
- Fuera sparklines sin ejes, anillos decorativos y cifras que suben solas.

### Ajustes (hoy «Ajustes» / lo que el equipo llama «Opciones»)
- Funciona bien. Se le aplica la piel nueva.
- **Recibe** desde Configuración técnica:
  - **Negocio** (sucursales, horario del negocio).
  - **Seguimientos → Horarios** (zona horaria, inicio, fin, días).
  - **Seguimientos → tiempos**: primer retraso, antes del cierre, separación
    mínima, días con plantilla, hora diaria, recomendar cierre. Son cosas que
    el equipo sí puede querer cambiar.

### Configuración técnica (`Settings`)
- **Se va** la pestaña «IA por etapa».
- **Se van** Seguimientos y Negocio (se mudan a Ajustes, arriba).
- **Se queda** «Manual base del bot».
- **Se queda** la conexión de WhatsApp (`WhatsAppSetup`) y el encendido/apagado
  del bot. Es lo mínimo técnico.
- Todo lo demás de esa pantalla **se descarta**: no se estaba usando.

### Tour
- **Sólo la primera vez** que alguien se conecta. Después no aparece nunca más
  y no tiene botón en la interfaz.

## 18. Criterio de aceptación de la Parte II

1. ¿Hay cuatro entradas de navegación y un engranaje, y nada más?
2. ¿El Inbox es una sola lista con buscador, sin pestañas de filtro?
3. ¿Oportunidades y la baraja desaparecieron del código, no sólo del menú?
4. ¿En Pipeline se ven tickets debajo de cada etapa sin hacer clic, y la caja
   se desplaza por dentro sin agrandar la pantalla?
5. ¿Cada gráfico tiene ejes con valores y muestra el valor exacto al pasar?
6. ¿Cada sección de Métricas tiene al menos un gráfico?
7. ¿Negocio y los tiempos de seguimiento están en Ajustes y no en Configuración?
8. ¿Configuración quedó con WhatsApp, encendido y Manual base, nada más?
9. ¿El tour sólo aparece en la primera conexión?
10. ¿Alguien que nunca lo vio entiende cada pantalla en cinco segundos?
