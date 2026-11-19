# Errores que cometimos al dar de alta clientes, y la forma correcta

> Parte de la [guía de cliente nuevo](README.md).
> Lista viva: lo que salga mal o cueste más de una hora se anota aquí, con fecha y cliente.
> Los errores del bot al conversar no van aquí: van en [../ERRORES-DEL-BOT.md](../ERRORES-DEL-BOT.md).

## Los 10 que más costaron

| # | Error | Costo | Forma correcta |
|---|---|---|---|
| 1 | Crear la app de Meta en nuestro portafolio (Depot, ago-2026) | 1 día | La app va en el portafolio del cliente |
| 2 | Intentar crear la cuenta de WhatsApp con nuestro propio enlace sin ser Tech Provider (Competimotor) | ~6 días | Prueba gratis de Kommo para crear la cuenta por coexistencia |
| 3 | Mandar a verificar con una cédula vencida y escaneada | 2 días | Documento vigente, foto con el celular, mínimo 1500×1000 |
| 4 | Pedirle los datos al cliente por partes | varios días | Un solo mensaje el día 1 con los bloques A, B y C |
| 5 | Entrar a la cuenta de Facebook del cliente con su clave desde otro país | cuenta bloqueada 2 veces | El cliente invita a Manuel; Manuel entra con su propio Facebook |
| 6 | Presentar las dos marcas juntas en el saludo y en el PDF | rehacer piezas | Una marca por número; preguntarlo antes de diseñar |
| 7 | Dejar prendidos todos los campos del webhook | el webhook respondía error sin parar | Solo `messages`, `smb_message_echoes` y `calls` |
| 8 | Asignar al usuario del sistema un solo activo de WhatsApp | error 100/33 | Asignar los dos: «WhatsApp accounts» y «Messaging accounts» |
| 9 | Poner `NODE_ENV=production` en Railway | build caído | No poner esa variable |
| 10 | Decir en la reunión un precio distinto al de la presentación | hay que aclararlo por escrito | Una sola cifra; mensaje escrito el mismo día |

---

## Venta y acuerdo

**E-1 · La demo falló con una medida del cliente.** (4-nov-2026)
En el pitch pidieron «235 rin 15» y el bot mostró 205/65, 185/65 y 195/55.
✅ Antes de cada demo, probar en el simulador las medidas que el cliente vende y la forma en que
sus clientes las escriben.

**E-2 · El precio dicho no era el del documento.** (18-nov-2026)
En la reunión se dijo «$2.500 de instalación»; la presentación dice $1.500. Tampoco quedó dicho en
voz alta cuánto era el primer pago, ni si eran 1 o 2 números.
✅ Una sola cifra, la del documento. El mismo día, un mensaje escrito con: instalación,
mensualidad, cuántos números y fecha del primer pago.

**E-3 · Se asumió que las dos marcas iban juntas.** (6 al 18-nov-2026)
Se armó el saludo y el encabezado «Competimotor y Mundillantas». El cliente dijo que eso no puede
pasar: cada marca con su número y su encabezado.
✅ Preguntar el día 1 con qué marca se presenta cada número (PREGUNTAS C23 y A10). Un número = una
marca = un servicio.

**E-4 · Sin contrato ni cláusula de Meta al arrancar.** (18-nov-2026)
✅ El contrato o anexo sale con el sí, y dice que Meta lo paga el cliente con su tarjeta, incluidas
las subidas futuras.

**E-5 · Prometer tiempos sin saber el sistema contable.**
Se creía que Fénix estaba en línea; estaba en un servidor local, sin API.
✅ Preguntar el sistema y dónde está instalado antes de dar fechas (README, paso 0).

## Preguntas al cliente

**E-6 · Pedir por partes.** (Mundillantas)
✅ Todo junto el día 1.

**E-7 · Preguntas abiertas.**
«Qué incluye la compra?» → «todo el servicio y mantenimiento cada 10 mil kilómetros por las dos
llantas todo menos alineación». No se pudo cargar.
✅ Preguntas cerradas, una por caso (4 llantas / 1 llanta), en Excel con celdas amarillas.

**E-8 · Interpretar una respuesta ambigua.**
✅ No se carga. Queda `[PENDIENTE]` y se vuelve a preguntar. Lo que el cliente no repite, el bot no
lo promete.

**E-9 · El número del bot cambió tres veces.**
✅ Preguntar: «a qué número mandan los anuncios?» Ese es. Confirmarlo por escrito antes de tocar el
código o Meta.

**E-10 · Dos locales con el mismo link de Maps.**
✅ Abrir cada link y comprobar que la ficha sea la del local. Un local sin link propio queda sin
link: el bot no manda el de otro local.

## Meta y WhatsApp

**E-11 · App en nuestro portafolio.** (Depot, 1-ago-2026)
Token, número, webhook y suscripción en verde, y no entraba ni un mensaje real.
✅ Portafolio del cliente. Detalle: [CONECTAR_WHATSAPP_CLIENTE.md](../CONECTAR_WHATSAPP_CLIENTE.md).

**E-12 · App sin publicar.**
El evento de prueba llega; los mensajes reales no.
✅ Publish → Published. Hace falta la URL de privacidad, y que diga el nombre del cliente (la de
Mundillantas decía «Depot Tire»).

**E-13 · «Add phone number» del panel de Meta.**
No es coexistencia: registra el número por SMS y lo saca de la app del celular.
✅ Nunca usarlo. Nunca aceptar *migrar* o *eliminar el número de la app*.

**E-14 · Nuestro enlace de alta no funciona.** (11 al 17-nov-2026)
«can't onboard customers right now», con la app publicada y con el negocio ya verificado. Hace
falta ser Tech Provider. Depot fue fácil solo porque Kommo ya había creado su cuenta.
✅ Kommo (prueba de 14 días, sin tarjeta). En paralelo, el trámite de [TECH_PROVIDER.md](../TECH_PROVIDER.md).

**E-15 · En Kommo, entrar con el perfil de la empresa.**
No pedía portafolio y solo ofrecía número nuevo.
✅ Entrar con el **Facebook personal de Manuel**. La pantalla «Add your WhatsApp phone number»
asusta, pero es el paso 1 del camino bueno: el portafolio se elige después.

**E-16 · Documento de identidad rechazado.**
Cédula vencida (2022), escaneada, en PDF, en una hoja con tres documentos.
✅ Vigente, foto con el celular, JPG, recortada, mínimo 1500×1000. Comandos en
[ALTA_META_CLIENTE_NUEVO.md](../ALTA_META_CLIENTE_NUEVO.md), Fase 4.

**E-17 · Elegir el registro equivocado al verificar y volver atrás.**
Meta se trabó con «There was a problem saving your changes».
✅ Mirar bien antes de pulsar Next. Si se traba: cerrar el asistente, recargar y pulsar Continue.
El reintento borra provincia y código postal: volver a ponerlos.

**E-18 · Meta bloqueó la cuenta del cliente.** (10 y 11-nov-2026)
Por entrar con su clave desde Estados Unidos.
✅ No entrar con la clave del cliente. Videollamada: el cliente invita a Manuel desde su equipo.

**E-19 · Aceptar la invitación con la sesión del cliente abierta.**
Sale «ya formas parte» y no sirve.
✅ Aceptarla desde el perfil propio. Con dos navegadores de Chrome conectados, elegir el de Manuel
antes de cada tanda.

**E-20 · Un solo activo asignado al usuario del sistema.**
✅ Los dos, con «Everything». El ID que usa la API es el de «Messaging accounts».

**E-21 · Phone Number ID equivocado.**
La app nueva trae un número de prueba de Meta.
✅ El bueno sale de WhatsApp Manager → Phone numbers, o de `GET /<WABA_ID>/phone_numbers`.

**E-22 · Token de 60 días.**
El bot muere sin avisar dos meses después.
✅ Expiration = **Never**. Comprobarlo en el depurador de tokens.

**E-23 · Falta suscribir la app a la cuenta.**
Marcar `messages` en la pantalla no alcanza.
✅ `app/scripts/meta/suscribir-waba.sh`.

**E-24 · Todos los campos del webhook prendidos.**
✅ Solo `messages`, `smb_message_echoes` y `calls`.

**E-25 · Verificar el webhook antes de guardar el token en el panel.**
Da 503.
✅ Primero token y App secret en el panel, después el webhook.

**E-26 · Mover la cuenta publicitaria al portafolio.**
No se hizo, y no hay que hacerlo: es irreversible y no hace falta para WhatsApp.

**E-27 · La prueba de Kommo vence.** (Competimotor: ~1-dic-2026)
Sin probar qué pasa con la cuenta al vencer.
✅ Anotar la fecha el día de la conexión y comprobar una semana antes que el bot no depende de Kommo.

## Railway y código

**E-28 · `NODE_ENV=production`.** → build caído. ✅ No ponerla.

**E-29 · `DATABASE_URL` apuntando a la base de Depot.**
`${{Postgres.DATABASE_URL}}` es la de Depot.
✅ `${{Postgres-<Cliente>.DATABASE_URL}}`. Revisar dos veces antes de correr la semilla.

**E-30 · Correr la semilla con la URL interna.**
No se alcanza desde la Mac.
✅ URL pública (TCP Proxy del Postgres del cliente).

**E-31 · Sin `BOT_POWER_DEFAULT=off`.** → el bot nace prendido. ✅ Ponerla siempre.

**E-32 · Cambiar la clave de OpenAI y no pulsar Deploy.**
Railway deja el cambio en espera.
✅ Variables → **Deploy**. Y en el ambiente **Depot_Tire**, no en staging.

**E-33 · El dominio del servicio decía «depottire».**
✅ Renombrarlo a `<cliente>.up.railway.app` antes de mandar enlaces o registrar el webhook.

**E-34 · Restos de Depot en el panel y en las piezas del cliente nuevo.**
«Precios reales de Contífico», garantías de Depot en el PDF, «Ahorras $0», usuarios Tamayo, la
página de privacidad con el nombre de Depot.
✅ Antes de mostrarle nada al cliente, recorrer el panel entero y abrir una cotización en imagen y
en PDF.

**E-35 · Ningún asesor con Nivel 1.**
El reporte diario no le llegaba a nadie.
✅ Cargar al menos un Nivel 1 (PREGUNTAS C5).

**E-36 · Mergear un cambio del cliente nuevo en horario de Depot.**
Un push a `main` reinicia todos los servicios.
✅ Juntar los cambios. Lo de todos los días va en Ajustes.

**E-37 · Trabajo del cliente en ramas locales sin subir.**
Las respuestas de Jenny quedaron días en una rama local.
✅ Commit y PR el mismo día.

## Catálogo

**E-38 · Suponer las columnas del Excel.**
El mapeo se armó con columnas supuestas; el Excel real era otro (un `.xls` viejo con membrete,
filas de categoría y totales).
✅ Pedir el archivo real el día 1 y leerlo tal cual, sin pedirle al cliente que lo arregle.

**E-39 · No saber qué es cada columna de precio.**
✅ Preguntarlo (PREGUNTAS B3 a B5). El precio mayorista nunca va al cliente.

**E-40 · Llantas de camión leídas como de auto.**
Aro 17.5 y 22.5 se leían como 17 y 22.
✅ Quedan fuera del catálogo del bot.

**E-41 · Querer el stock por local.**
Cinco columnas para tres locales, y la suma no cuadraba con el total.
✅ Preguntar primero si lo necesitan. Competimotor: un solo stock, el total.

**E-42 · Nadie encargado de subir el Excel.**
✅ Nombre y hora (PREGUNTAS B7).

## Plantillas

Ver [PLANTILLAS.md](PLANTILLAS.md), «Errores que ya cometimos».

## Operación

**E-43 · Los avisos al asesor rebotan (error 131047 de Meta).**
Pasa cuando el asesor lleva más de 24 horas sin escribirle al número del bot.
✅ Explicárselo a los asesores antes de encender (PREGUNTAS E1). No es un error del bot.

**E-44 · La pauta puede salir antes que el bot.**
✅ Preguntar la fecha del anuncio (PREGUNTAS D6) y abrir el bot antes.
