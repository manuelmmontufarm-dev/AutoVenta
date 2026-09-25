# Prompt para Claude Design — mockups del Hub antes de construir

Este prompt es para el lienzo de diseño (Claude Design), no para Fable. Sirve
para **ver las pantallas dibujadas y aprobarlas** antes de que nadie escriba
código. Orden: primero esto, después `PROMPT-FABLE.md`.

Claude Design no ve el repo: por eso el prompt lleva las reglas adentro, en vez
de decir «leé DESIGN.md». Dirección ya fijada: A — Taller.

---

## El prompt

```
Vas a dibujar las pantallas del Hub de Depot Tire: el panel que usa el equipo
de una llantera en Quito para atender ventas que entran por WhatsApp. Lo usan
tres o cuatro personas, de día, junto al mostrador, en una laptop y a veces en
el celular. No son gente de software.

La idea en una frase: que alguien que nunca lo vio entienda en cinco segundos
qué está pasando con las ventas de hoy, y en diez qué tiene que hacer. Simple,
directo, se sigue con el dedo. Nada brillante, ningún detalle «crazy».

## El mundo visual (ya decidido, no lo discutas)

Se llama «Taller». Claro, papel cálido, una tinta, una señal.
- Tipografía: Archivo para toda la interfaz. JetBrains Mono SÓLO para medidas,
  precios, horas y códigos. Ninguna otra fuente. Inter prohibida.
- Fondo #f7f6f3 · superficie #ffffff · tinta #1c1b19 · texto apagado #6f6b64 ·
  líneas rgba(28,27,25,.10).
- Señal única: ladrillo #b4453a, sólo para la acción primaria, la selección y lo
  que exige actuar hoy. Positivo #2f6f4f. Aviso #a8731f. Ningún otro color.
- Radios: panel 10 px, tarjeta 8 px, control 6 px, chips en cápsula.
- Sombras con desplazamiento real y blur suave, muy pocas. Nunca halos.
- Texto funcional mínimo 11 px. Numerales tabulares en toda cifra en columna.
- Jerarquía por peso y espacio, no por color. Si más de un tercio de las filas
  de una lista están pintadas, el color dejó de significar algo.
- Un solo gesto propio: la placa de medida (punto 9 abajo). Nada más se repite
  como firma.

## La referencia y qué tomar de ella

Se tomó como inspiración la claridad estructural de monday CRM: cada bloque con
un título en lenguaje llano que hace una sola cosa, la barra de etapas horizontal
como columna vertebral, campos etiqueta/valor en dos columnas, mucho aire, texto
grande. Tomá ESO.

No tomes su piel: nada de chispitas «AI», iconos arcoíris, barras de color en el
borde izquierdo de las tarjetas, vidrio rosado, ni iconos dentro de cuadraditos
de colores. Todo eso está en la lista negra de DESIGN.md §3.

## Qué dibujar

Un artboard por pantalla, a 1440 de ancho, más una versión a 390 de las dos
primeras. Con datos reales de llantera (medidas como 245/40 R18, nombres
ecuatorianos, precios en dólares), nunca lorem ni «John Doe».

1. **Armazón.** Cuatro entradas: Inbox, Pipeline, Cotizador, Métricas. Ajustes
   como engranaje. Estado del bot (encendido/apagado) y sonido visibles pero
   discretos. Sin tour, sin chispitas.

2. **Inbox.** Una sola lista con buscador arriba. Sin pestañas de filtro. Cada
   fila: nombre, medida (la placa de medida de DESIGN.md §5), último mensaje,
   hora, quién atiende (bot o persona). La fila que exige acción hoy es la única
   pintada; las demás son texto. Máximo un tercio de filas con fondo.

3. **Conversación.** El hilo de WhatsApp a la izquierda, la ficha a la derecha
   (vehículo, medida, compromiso, comparación) en etiqueta/valor a dos columnas.
   Un interruptor claro: «Contesta el bot» / «Contestan ustedes». Compositor
   abajo. Ofrecer descuento y cerrar ticket como acciones secundarias.

4. **Pipeline.** Arriba, una barra horizontal con las etapas (nuevo, medidas,
   cotizado, ubicación, visita) y cuántos tickets hay en cada una. Debajo de
   cada etapa, tres o cuatro tarjetas visibles SIN hacer clic; si hay más, la
   caja se desplaza por dentro y la pantalla no crece. La tarjeta dice lo justo
   para decidir sin abrirla: nombre, medida, último mensaje, hora.

5. **Cotizador.** Buscador de medida/código/marca, resultados con disponibilidad
   real, comparación de hasta tres modelos, y las salidas (copiar cotización,
   PDF, imagen para WhatsApp) como una fila de acciones clara. La función ya
   funciona perfecto: sólo dibujá la piel nueva encima de lo que hay.

6. **Métricas.** KPIs arriba (abiertos ahora, en juego, conversión, promedio
   hasta respuesta). Debajo, «Conversaciones por día» y «¿A qué hora contestan
   más?» como gráficos con eje X y eje Y rotulados con valores, unidades, y un
   tooltip con el valor exacto en un punto. Después, una sección por tema
   (cotizaciones, plantillas, inventario real, impacto de descuentos, tokens y
   cuenta del servicio), cada una con al menos un gráfico del mismo estilo.
   Nada de sparklines sin ejes ni anillos decorativos.

7. **Ajustes.** Secciones: Negocio (sucursales y horario), Horarios de
   seguimiento, Tiempos de seguimiento (primer retraso, antes del cierre,
   separación mínima, días con plantilla, hora diaria, recomendar cierre),
   Avisos, Usuarios y permisos. Un bloque por decisión, con su propio botón de
   guardar y su propio mensaje de error.

8. **Configuración técnica.** Sólo tres cosas: conexión de WhatsApp,
   encender/apagar el bot, y Manual base del bot. Nada más.

9. **La placa de medida**, sola, grande: `245/40 R18` en la monoespaciada, con
   el rin en peso mayor y una línea de pelo debajo. Es el único gesto propio del
   producto y aparece igual en todas las pantallas.

## Reglas de claridad que se ven en el dibujo

- Cada bloque tiene un título de dos o tres palabras que dice qué es.
- Tres capas y no más: la cifra, la tendencia, el detalle al pedirlo.
- Si un píxel no informa, no está.
- Todo gráfico se lee solo: ejes, valores, unidades, tooltip.
- El color aparece sólo donde hay que actuar. Lo normal es texto.
- Una acción primaria por pantalla. Las demás, secundarias y a la vista.

## Qué NO hacer

Gradientes, halos, vidrio, chispitas, emojis como iconos, Inter, tarjetas dentro
de tarjetas, chip-píldora arriba de títulos, cifras animadas, iconos en
cuadraditos, barras de color laterales. Si te ves poniendo alguno, borralo y
resolvelo con tipografía y espacio.

Empezá por el armazón y el Inbox. Mostrámelos antes de seguir con el resto.
```

---

## Cómo usar lo que salga

1. Mirar Inbox y armazón. Si el mundo elegido no aguanta ahí, se cambia la letra
   en `DESIGN.md` §4 **ahora**, que es barato.
2. Aprobar pantalla por pantalla. Lo aprobado se exporta y se guarda en
   `docs/rediseno/mockups/`.
3. Recién entonces, `PROMPT-FABLE.md` en una sesión nueva, agregándole una línea:
   «Los mockups aprobados están en `docs/rediseno/mockups/`; construí eso.»
