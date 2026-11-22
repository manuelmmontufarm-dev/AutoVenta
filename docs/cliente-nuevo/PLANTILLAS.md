# Plantillas de WhatsApp para un cliente nuevo

> Parte de la [guía de cliente nuevo](README.md) (paso 8).
> Los comandos completos están en [../PLANTILLAS_META.md](../PLANTILLAS_META.md).

## Qué es una plantilla y por qué importa

WhatsApp deja que el bot escriba libremente solo durante las **24 horas** después del último
mensaje del cliente. Pasado ese tiempo, lo único que se puede mandar es una **plantilla**: un
mensaje con texto fijo que Meta aprobó antes.

Sin plantillas aprobadas, el cliente nuevo se queda sin:

- seguimiento de una cotización que no contestaron,
- recordatorio de la visita del día siguiente,
- mensaje al que dijo que venía y no llegó.

**Cada cliente tiene las suyas.** Las plantillas viven en la cuenta de WhatsApp (WABA) de cada
cliente: las de Depot no sirven para Competimotor.

## Cuándo se hacen

Apenas el token del cliente está guardado en el panel (paso 7 de la guía). Meta tarda desde unos
minutos hasta 24 horas en aprobarlas, así que se envían **antes** de probar el bot, no después.

## Las plantillas que lleva cada cliente

| Plantilla | Para qué | Huecos | Botones |
|---|---|---|---|
| `seguimiento_cotizacion_v1` | Cotizó y no contestó | nombre, número de cotización | |
| `seguimiento_opciones_v1` | Vio opciones y no eligió | nombre, medida | |
| `recordatorio_visita_v1` | Tiene visita mañana | nombre, día, local, medida | «Sí voy» · «Cambiar día» |
| `visita_no_llego_v1` | Dijo que venía y no llegó | ver el archivo JSON usado | «Agendar otro día» · «Ya no las necesito» |
| `retomar_venta_v1` | El asesor la manda a mano desde el chat cuando se cerró la ventana de 24 h | nombre, nombre del negocio | «Sí, continuar» · «Ya no las necesito» |

Las tres primeras son las que el código ya trae en la tabla `follow_up_templates`. La cuarta existe
en Meta pero todavía no tiene disparador en el código (ver «Lo que falta», abajo). La quinta,
`retomar_venta_v1`, no la manda el bot: la manda el asesor con el botón «Enviar plantilla para retomar
la venta» del chat del panel, que aparece cuando la ventana de 24 h se cerró (22-nov-2026). Es un
nombre fijo en el código (`PLANTILLA_RETOMAR` en `app/src/server/admin.ts`): un cliente nuevo tiene
que crearla en su WABA con el mismo nombre. El archivo JSON está en la bitácora del 22-nov.

Si el cliente tiene **un solo local**, el nombre del local se escribe fijo en el texto y la
plantilla lleva un hueco menos (así se hizo en Competimotor: «en Competimotor»).

## Los 6 pasos

Detalle y comandos para copiar: [../PLANTILLAS_META.md](../PLANTILLAS_META.md).

1. Escribir cada plantilla en un archivo JSON.
2. Sacar el token de la base del cliente (queda en una variable, nunca se imprime).
3. Comprobar que el token tiene el permiso `whatsapp_business_management`.
4. Enviar la plantilla a Meta. Respuesta buena: `"status":"PENDING"`.
5. Consultar hasta que diga `APPROVED`. Mirar también que `category` siga en `UTILITY`.
6. En el panel del cliente → Seguimientos → plantillas: poner el nombre exacto y marcarla como
   aprobada. Hasta entonces el bot no la envía.

Todo se hace desde la terminal. No hace falta entrar al Facebook del cliente.

## Reglas de Meta que hay que respetar

| Regla | Qué pasa si no |
|---|---|
| El nombre va en minúsculas, con números y guion bajo | Meta la rechaza |
| Un ejemplo por cada hueco `{{n}}`, en orden | Meta la rechaza |
| El texto no empieza ni termina con un hueco | Meta la rechaza |
| Máximo 3 botones de respuesta rápida | Meta la rechaza |
| El texto solo avisa de algo que el cliente ya acordó | Si vende o trae promo, Meta la pasa a `MARKETING` |
| Una plantilla rechazada se corrige y se envía con otro nombre (`_v2`) | El nombre viejo queda ocupado |

**Costo:** `UTILITY` cuesta cerca de 1 centavo por mensaje y `MARKETING` cerca de 7. Lo paga el
cliente con la tarjeta de su cuenta de WhatsApp. Sin tarjeta, Meta no envía plantillas.

## Errores que ya cometimos

| Error | Forma correcta |
|---|---|
| Usar el `WHATSAPP_TOKEN` de las variables de Railway de Depot: es de la app vieja y da error 100 | El token bueno es siempre el de la base: tabla `settings`, clave `channel_config`, campo `token` |
| Pensar que había que entrar a WhatsApp Manager con el Facebook del cliente | Se crean por la API con el token que el bot ya usa |
| Dejar las plantillas para después de encender el bot | Enviarlas apenas hay token: la aprobación tarda hasta 24 h |
| Crear la plantilla en Meta y no marcarla en el panel | Paso 6: sin eso el bot no la envía |

## Registro por cliente

| Cliente | WABA | Plantilla | Id en Meta | Enviada | Estado |
|---|---|---|---|---|---|
| Depot Tire | `970823328872837` | `recordatorio_visita_v1` | `1090812663987948` | 18-nov-2026 | PENDING al enviar · falta confirmar |
| Depot Tire | `970823328872837` | `visita_no_llego_v1` | `1168267625538604` | 18-nov-2026 | PENDING al enviar · falta confirmar |
| Competimotor | `847835534545450` | `recordatorio_visita_v1` | `1680661520324356` | 18-nov-2026 | PENDING al enviar · falta confirmar |
| Competimotor | `847835534545450` | `visita_no_llego_v1` | `1679376043547704` | 18-nov-2026 | PENDING al enviar · falta confirmar |
| Competimotor | `847835534545450` | `retomar_venta_v1` | `1860460948304638` | 22-nov-2026 | PENDING al enviar (UTILITY) · falta confirmar |
| Depot Tire | `970823328872837` | `retomar_venta_v1` | `1616297076393510` | 22-nov-2026 | PENDING al enviar (UTILITY) · falta confirmar |

Sin revisar todavía en ninguno de los dos clientes: si `seguimiento_cotizacion_v1` y
`seguimiento_opciones_v1` existen y están aprobadas en Meta. Se comprueba con el paso 5.

## Lo que falta en el código

- El recordatorio debe salir la tarde anterior a la visita. Hoy se calcula desde el último mensaje
  del cliente (`app/src/services/followUpCampaigns.ts`).
- `visita_no_llego_v1` no está en `follow_up_templates` ni tiene disparador.
- El código no maneja las respuestas de los botones («Sí voy», «Cambiar día», «Agendar otro día»,
  «Ya no las necesito»).
- Las plantillas se crean a mano por cliente. Cuando haya un tercer cliente conviene un script que
  cree las cuatro de una vez con el nombre del negocio.
