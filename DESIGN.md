# AutoVenta — Sistema de diseño Showroom GP

## 1. Idea central

**Showroom GP** es el lenguaje visual oficial de AutoVenta. Mezcla la claridad de un showroom contemporáneo con la emoción gráfica de un paddock de carreras.

La interfaz debe provocar dos sensaciones al mismo tiempo:

1. **“Entiendo inmediatamente qué hacer.”**
2. **“Qué cool se ve esto.”**

La primera sensación siempre tiene prioridad. Los elementos de carreras acompañan el producto; nunca compiten con el contenido ni se convierten en decoración ruidosa.

### Fórmula visual

- 80% showroom: blanco, orden, aire, jerarquía y superficies limpias.
- 15% racing: rojo Depot, líneas de velocidad, telemetría y placas técnicas.
- 5% emoción: carros, llantas, circuitos, animación y sonido.

## 2. Principios obligatorios

### 2.1 Una pantalla, una intención

- El título dice dónde está el usuario.
- El subtítulo explica la finalidad en una frase corta.
- Sólo hay una acción primaria roja por bloque o momento de decisión.
- Las opciones secundarias son blancas, discretas y claramente distintas.
- No se muestran controles sin propósito ni texto técnico innecesario.

### 2.2 Detalle sin desorden

- Los dibujos de carros, llantas y circuitos viven en bordes, esquinas o espacios vacíos.
- Su opacidad normal está entre 5% y 12%.
- No se colocan detrás de texto, campos, cifras o botones.
- Nunca se usa un patrón cuadriculado como fondo de contenido.
- La franja superior de pista es el único patrón repetitivo permitido.

### 2.3 Automotriz, no infantil

- Se prefieren ilustraciones lineales técnicas, placas de medidas, telemetría y formas inspiradas en talleres.
- Los emojis sólo se usan como apoyo en mensajes humanos, estados o herramientas existentes; no sustituyen el sistema de iconos.
- Las referencias a carreras deben sentirse premium, mecánicas y precisas.

### 2.4 La información gana

- Contraste AA como mínimo para texto funcional.
- Los adornos usan `aria-hidden="true"` y no reciben eventos.
- Los estados no dependen únicamente del color: incluyen texto, cifra o forma.
- El sonido siempre tiene control visible, se recuerda entre páginas y nunca es necesario para completar una tarea.

## 3. Identidad visual

### 3.1 Paleta

| Token | Valor | Uso |
| --- | --- | --- |
| `gp-bg` / `color-ink` | `#f5f6f4` | Fondo general cálido |
| `gp-card` / `color-ink2` | `#ffffff` | Tarjetas y paneles |
| `gp-ink` / `color-paper` | `#17233b` | Texto principal y placas técnicas |
| `gp-muted` | `#68717f` | Texto secundario |
| `gp-faint` | `#98a0ab` | Metadatos y ornamentos |
| `gp-line` | `#d9dfe3` | Bordes |
| `gp-red` / `color-red` | `#de2636` | Marca y acción primaria |
| `gp-red-dark` | `#b91d2a` | Presión y profundidad de botones |
| `gp-blue` | `#244d88` | Enlaces e información |
| `gp-green` | `#178d72` | En línea, éxito y avance |
| `gp-yellow` | `#f1b942` | Atención no destructiva y acentos especiales |

El rojo se reserva para marca, selección importante, alertas y acción primaria. No debe cubrir áreas grandes.

### 3.2 Tipografía

- **Archivo**: interfaz, párrafos, botones y navegación.
- **Archivo Black**: títulos cortos, cifras importantes y gestos editoriales.
- **JetBrains Mono**: medidas de llantas, telemetría, códigos, tiempos y microetiquetas técnicas.
- Títulos: compactos y directos; nunca más largos de dos líneas.
- Texto funcional: 12–14 px en escritorio y mínimo 12 px en móvil.
- Microetiquetas: 7–10.5 px, mayúsculas y espaciado de `0.12em–0.18em`.

### 3.3 Forma y profundidad

- Panel principal: radio de 20–22 px.
- Tarjeta: radio de 14–16 px.
- Controles: radio de 10–14 px.
- Chips y estados: cápsula completa.
- Sombra suave: elevación limpia, sin borde negro grueso.
- Sombra de acción: leve tinte rojo bajo botones primarios.

## 4. Estructura de pantalla

### 4.1 Franja de salida

Una franja fija de 7 px recorre la parte superior:

`navy → blanco → rojo → blanco`

Es la firma de Showroom GP. No se replica dentro del contenido.

### 4.2 Navegación

- Escritorio: rail blanco flotante con borde superior rojo.
- Móvil: barra inferior flotante.
- Estado activo: superficie navy tenue o borde rojo; siempre acompañado de icono y nombre accesible.
- Logo DT: rojo, compacto y con profundidad mecánica.

### 4.3 Encabezado

- Título alineado a la izquierda.
- Subtítulo breve debajo.
- Acciones y estado del bot a la derecha.
- Telemetría ambiental centrada sólo cuando exista espacio suficiente.
- Ningún texto ornamental puede cruzarse con el título.

### 4.4 Contenido

- Márgenes mínimos: 16 px móvil, 24 px escritorio.
- Separación entre tarjetas: 10–14 px.
- Máximo de cuatro métricas por fila.
- Formularios de lectura vertical y grupos de opciones claramente rotulados.
- Documentos con columna legible, tablas limpias y barra superior consistente.

## 5. Componentes oficiales

### 5.1 Tarjeta Showroom

- Fondo blanco.
- Borde gris de 1 px.
- Sombra suave.
- Radio de 16–22 px.
- Pequeña marca roja/blanca de 28 px en el borde superior derecho.
- Puede contener un número técnico o microetiqueta, pero no decoración detrás del contenido.

### 5.2 Botones

**Primario**

- Fondo rojo Depot.
- Texto blanco.
- Borde rojo oscuro.
- Sombra roja contenida.
- Leve desplazamiento al presionar.

**Secundario**

- Fondo blanco.
- Texto navy.
- Borde gris.
- Sin mayúsculas forzadas salvo acciones cortas de sistema.

**Destructivo**

- Rojo sólo cuando la acción sea realmente destructiva.
- Debe expresar la consecuencia con texto.

### 5.3 Campos

- Fondo blanco, borde gris y radio de 10–12 px.
- Foco rojo de 2 px.
- Etiqueta visible encima; el placeholder no reemplaza la etiqueta.
- Mensaje de ayuda inmediatamente debajo cuando sea necesario.

### 5.4 Chips y placas

- Estados: fondo tonal claro, texto oscuro y punto de color.
- Medidas de llanta: placa navy, texto blanco monoespaciado y línea roja lateral.
- Tiempos y cifras: números tabulares.

### 5.5 Estados vacíos y carga

- Skeletons; nunca un spinner aislado.
- Estado vacío con icono simple, explicación corta y una única salida accionable.
- No usar ilustraciones enormes ni mensajes genéricos.

### 5.6 Modales y acceso protegido

- Scrim navy semitransparente.
- Caja blanca de máximo 420 px.
- Título, explicación, campo y acción en ese orden.
- El foco debe entrar al modal y el contenido de fondo no compite visualmente.

## 6. Lenguaje racing

### 6.1 Ornamentos permitidos

- Silueta lateral de auto deportivo.
- Auto pequeño de línea técnica.
- Llanta/rin con banda de rodamiento roja.
- Trazado de circuito.
- Líneas de velocidad inclinadas.
- Medida técnica como `245/40 R18`.
- Marcas de boxes: `DT—01`, `PIT SYSTEM`, `UI / 01`.
- Hitos breves: `30+ AÑOS EN PISTA`, `QUITO · ECU`.

### 6.2 Colocación

- Auto grande: esquina inferior derecha, 5–8% de opacidad.
- Auto pequeño: esquina superior derecha cuando no interfiera con acciones.
- Llanta: lateral derecho o esquina inferior, 6–10% de opacidad.
- Circuito: esquina inferior izquierda, 5–7% de opacidad.
- Telemetría: parte superior central en escritorio; oculta en pantallas estrechas.
- Marcas técnicas: exteriores del área principal.

### 6.3 Límites

- Máximo de un auto grande, un auto pequeño, dos llantas y un circuito por viewport.
- En móvil se conservan sólo uno o dos detalles.
- Si una pantalla está llena, se reducen u ocultan ornamentos.
- Los elementos racing no se animan continuamente; la interfaz debe permanecer tranquila.

## 7. Movimiento y sonido

### 7.1 Movimiento

- Entrada de pantalla: 180–350 ms, opacidad y desplazamiento máximo de 14 px.
- Presión de botón: escala aproximada `0.94–0.98`.
- Hover: elevación máxima de 2 px.
- Estado en línea: pulso lento de 1.8 s.
- Respetar `prefers-reduced-motion`.

### 7.2 Sonido

La preferencia se guarda en `localStorage` con la clave:

`autoventa_sound_enabled`

Sonidos oficiales:

- **Botón:** doble clic mecánico muy corto y bajo.
- **Notificación:** tres notas ascendentes.
- **Nueva actividad:** variante breve de confirmación.
- **Demo:** encendido/apagado con gesto sonoro distinguible.

Reglas:

- El control `Sonido / Silenciado` debe estar visible en todas las superficies oficiales.
- El estado se comparte entre hub, herramientas, documentos y demo.
- El primer sonido sólo ocurre después de interacción del usuario.
- Volumen bajo; nunca reproducir audio largo, música o motor continuo.
- Con sonido apagado, toda la funcionalidad y feedback visual permanecen completos.

## 8. Responsive

### Escritorio

- Rail lateral y paneles amplios.
- Telemetría, circuito y auto grande disponibles.
- Acciones importantes visibles sin menú adicional.

### Tablet

- Reducir telemetría y ornamentos superiores.
- Mantener tarjetas, auto de fondo y una llanta.
- Permitir scroll horizontal sólo en Kanban.

### Móvil

- Navegación inferior.
- Ocultar circuito, especificaciones verticales y marcas secundarias.
- Auto ambiental con opacidad menor y fuera del texto.
- El control de sonido puede mostrar sólo el icono si falta espacio.
- Objetivos táctiles de al menos 40 px.

## 9. Accesibilidad y contenido

- `:focus-visible` rojo de 2 px con separación.
- Texto principal navy sobre blanco.
- Iconos decorativos con `aria-hidden="true"`.
- Botones de icono con `aria-label`.
- Animación reducida cuando el sistema lo solicita.
- Mensajes de error concretos: qué pasó y qué puede hacer el usuario.
- Lenguaje corto, natural y en español.
- Evitar “configuración avanzada”, abreviaturas internas o jerga cuando exista una frase simple.

## 10. Aplicación por superficie

| Superficie | Aplicación |
| --- | --- |
| Hub principal | Hero limpio, producto oficial destacado, tarjetas Showroom y ambiente GP |
| Inbox | Lista simple, estados claros, medidas en placa y notificación sonora |
| Pipeline | Columnas limpias, cabeceras técnicas y movimiento limitado al drag |
| Conversación | Chat sin patrón de cuadros, panel lateral ordenado y acción primaria única |
| Métricas | Cifras grandes, gráficos contenidos y detalles de telemetría discretos |
| Mensajes reales | Misma superficie, estados del bot legibles y compositor limpio |
| Configuración IA | Un bloque por decisión, selección evidente y guardado persistente |
| Tester | Formulario centrado, una acción principal y ayuda breve |
| Documentación | Barra superior, columna legible, tablas y código Showroom |
| Galería de estilos | El contenedor usa Showroom GP; las muestras históricas conservan su diseño para comparación |
| Demos históricas | Se consideran referencias archivadas; el demo oficial siempre es Showroom GP |

## 11. Criterio de aceptación

Antes de publicar una pantalla:

- ¿Se entiende su propósito en menos de cinco segundos?
- ¿Existe una sola acción primaria visible por momento?
- ¿No hay patrón cuadriculado detrás del contenido?
- ¿Los carros y llantas están presentes sin tapar información?
- ¿Las tarjetas, botones y campos coinciden con los tokens oficiales?
- ¿El control de sonido es accesible y recuerda su estado?
- ¿Funciona en móvil sin texto superpuesto?
- ¿La reducción de movimiento y el foco de teclado funcionan?
- ¿La pantalla se siente como parte del mismo producto?

Si alguna respuesta es “no”, la pantalla todavía no cumple Showroom GP.
