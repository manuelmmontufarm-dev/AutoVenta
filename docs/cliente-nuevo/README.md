# Cliente nuevo en AutoVenta — la guía única

> **Empieza siempre aquí.** Esta carpeta es el único lugar que hay que recordar para dar de alta un
> cliente. Está escrita con lo que pasó de verdad con Depot Tire (ago-2026) y Competimotor /
> Mundillantas (nov-2026).
>
> **Regla de la carpeta:** cada vez que aprendemos algo con un cliente, se anota aquí el mismo día
> (ver «Cómo mantener esta guía», al final).

## Los archivos de esta carpeta

| Archivo | Para qué |
|---|---|
| **README.md** (este) | Los pasos en orden, del sí del cliente al bot encendido |
| [PREGUNTAS.md](PREGUNTAS.md) | Todas las preguntas que hay que hacerle al cliente, listas para copiar |
| [ERRORES.md](ERRORES.md) | Los errores que cometimos y la forma correcta |
| [PLANTILLAS.md](PLANTILLAS.md) | Las plantillas de WhatsApp que hay que crear en Meta para cada cliente |

Las guías de detalle (pantalla por pantalla) siguen en su lugar y se enlazan desde cada paso:

| Guía de detalle | Tema |
|---|---|
| [../clientes/ALTA-DE-CLIENTE.md](../clientes/ALTA-DE-CLIENTE.md) | Railway, variables, semilla, simulador |
| [../ALTA_META_CLIENTE_NUEVO.md](../ALTA_META_CLIENTE_NUEVO.md) | Meta: verificar el negocio y crear la cuenta de WhatsApp con Kommo |
| [../CONECTAR_WHATSAPP_CLIENTE.md](../CONECTAR_WHATSAPP_CLIENTE.md) | Meta: app, token, webhook (cuando la cuenta ya existe) |
| [../PLANTILLAS_META.md](../PLANTILLAS_META.md) | Comandos para crear plantillas desde la terminal |
| [../TECH_PROVIDER.md](../TECH_PROVIDER.md) | Trámite para no depender de Kommo |
| [../integraciones/](../integraciones/README.md) | Sistemas contables: Contífico, Fénix, Perseo |
| [../MULTICLIENTE.md](../MULTICLIENTE.md) | Cómo está hecho el código para varios clientes |

---

## La idea en cuatro líneas

1. **Un solo código para todos.** Un cliente = un servicio de Railway + su base Postgres + la
   variable `NEGOCIO=<id>`.
2. **Un número de WhatsApp = un servicio.** Dos marcas con dos números son dos servicios.
3. **La cuenta de WhatsApp y la app de Meta viven en el portafolio DEL CLIENTE**, y Meta lo paga
   el cliente con su tarjeta.
4. **El bot nace apagado** y solo se enciende después de probarlo en el simulador y con el número
   de Manuel.

## El camino completo

| Paso | Qué | Tiempo nuestro | Espera |
|---|---|---|---|
| 0 | Antes del sí: investigar y saber su sistema contable | 1–2 h | |
| 1 | El sí por escrito: precio, números, marcas, fechas | 30 min | |
| 2 | **Día 1:** un solo mensaje con todo lo que necesitamos | 15 min | 1–3 días del cliente |
| 3 | Ficha del cliente y perfil en el código | 2–4 h | |
| 4 | Servicio en Railway + base + semilla | 1 h | |
| 5 | Catálogo (inventario) | 1–3 h | depende del Excel |
| 6 | Ajustes en el panel | 30 min | |
| 7 | Meta: acceso, verificación, cuenta de WhatsApp, token, webhook | 2–3 h | 1–2 días de Meta |
| 8 | **Plantillas de WhatsApp** | 20 min | hasta 24 h de Meta |
| 9 | Probar en el simulador | 1–2 h | |
| 10 | Probar en vivo solo con el número de Manuel | 15 min | |
| 11 | Encender para todos | 5 min | |
| 12 | Primera semana: revisar, medir, cobrar | 15 min al día | |

**Lo que corre en paralelo desde el día 1** (son las esperas largas): el acceso a Meta y la
verificación del negocio (paso 7), y las respuestas del cliente (paso 2). Mientras tanto se hacen
los pasos 3 a 6.

---

## Paso 0 — Antes del sí

- [ ] Buscar qué publican: anuncios en Meta, teléfonos, locales, marcas. De ahí salen los ganchos
      del pitch (ejemplo: [../clientes/mundillantas.md](../clientes/mundillantas.md)).
- [ ] **Saber qué sistema contable usan y dónde está instalado**, antes de prometer tiempos:

| Sistema | Qué se puede | Guía |
|---|---|---|
| Contífico | API: catálogo cada 5 min y facturas cada 10 min | [integraciones/README.md](../integraciones/README.md) |
| Perseo (PC o Web) | API pública. La activa el personal de Perseo. Marcar las llantas «Visible» | [PERSEO.md](../integraciones/PERSEO.md) |
| Fénix en servidor local | Sin API. Excel de inventario cada día + Excel de facturas | [FENIX.md](../integraciones/FENIX.md) |
| Fénix ERP (página `*.fenixerp.com`) | Es Odoo 17: su API estándar sirve | [FENIX.md](../integraciones/FENIX.md) |

- [ ] Probar la demo con **medidas del cliente** antes de la reunión (ver [ERRORES.md](ERRORES.md), E-1).

## Paso 1 — El sí por escrito

El mismo día de la reunión, mandar un mensaje corto con lo acordado. Guardar la transcripción en
`docs/reuniones/AAAA-MM-DD-<cliente>.md`.

- [ ] **Precio en una sola cifra**, la misma que dice la presentación (instalación + mensualidad).
- [ ] **Cuántos números** de WhatsApp (cada número extra es otro servicio y otra mensualidad).
- [ ] **Qué marca muestra cada número** (ver [ERRORES.md](ERRORES.md), E-3).
- [ ] Fecha de inicio de la prueba y fecha del primer pago.
- [ ] Qué productos cotiza el bot y cuáles pasa al asesor.
- [ ] **Cláusula de Meta** en el contrato o anexo: lo que cobra Meta lo paga el cliente con su
      tarjeta, incluidas las subidas futuras. Sin tarjeta vigente, que Meta frene los envíos no es
      falla del bot.
- [ ] A nombre de quién se factura (hoy: Rosanna Mancino).
- [ ] Empezar el contrato o anexo. Modelo: `docs/acuerdo-depot-tire.html` (el de Competimotor, `docs/acuerdo-competimotor.html`, todavía está sin commitear en la carpeta principal).

## Paso 2 — Día 1: un solo mensaje con todo

**Pedir todo junto.** Con Mundillantas se pidió por partes y se perdieron días.

Copiar los bloques A, B y C de [PREGUNTAS.md](PREGUNTAS.md):

- [ ] **Bloque A — Meta:** administrador del portafolio para Manuel, certificado del RUC, foto de
      un documento de identidad **vigente** de un socio, qué número va al bot y quién tiene ese
      celular.
- [ ] **Bloque B — Inventario:** el Excel tal como sale de su sistema, sin arreglarlo.
- [ ] **Bloque C — El negocio:** locales, horarios, asesores, pagos, garantías, qué incluye la compra.
- [ ] Crear el grupo de WhatsApp con el cliente y pedir **un contacto** y **quién decide**.

Lo que se puede responder en una tabla va en Excel con celdas amarillas (ver PREGUNTAS.md,
«Cómo preguntar»).

## Paso 3 — Ficha del cliente y perfil en el código

- [ ] `docs/clientes/<id>.md`: lo que se sabe del cliente (personas, locales, sistema, acuerdos).
- [ ] `docs/clientes/<id>-arranque.md`: la tabla de preguntas con su estado y **dónde se carga cada
      respuesta**. Modelo: [mundillantas-arranque.md](../clientes/mundillantas-arranque.md).
- [ ] El perfil, copiando `ejemplo`:

| Archivo | Qué va |
|---|---|
| `app/src/negocio/negocios/<id>.ts` | Quién es: nombre, locales, teléfonos, horarios, marcas, garantías, pies de las piezas |
| `app/src/negocio/politicas/<id>.ts` | Cómo vende: formas de pago, envíos, servicios, qué pasa al asesor |
| `app/assets/<id>/` | Logos, escalera de marcas, conocimiento de marcas |
| `app/src/negocio/index.ts` | Registrar el perfil en `PERFILES` |

- [ ] Lo que el cliente no ha confirmado se escribe `"[PENDIENTE] …"`. **Nunca se inventa** un
      precio, una garantía, un teléfono ni una coordenada.
- [ ] Una marca por número: saludo, encabezado del PDF y locales solo de esa marca.

## Paso 4 — Servicio en Railway

Detalle completo: [ALTA-DE-CLIENTE.md](../clientes/ALTA-DE-CLIENTE.md), secciones 1 a 3.

- [ ] Proyecto **AutoVentas**, ambiente **Depot_Tire**: servicio nuevo desde el mismo repo, Root
      Directory `app/`.
- [ ] Postgres nuevo, renombrado `Postgres-<Cliente>`, con **TCP Proxy** encendido.
- [ ] Dominio `<cliente>.up.railway.app` **antes** de mandar ningún enlace o registrar el webhook.
- [ ] Variables. Las que más se olvidan:

| Variable | Valor | Si se olvida |
|---|---|---|
| `NEGOCIO` | el `<id>` del perfil | No arranca |
| `DATABASE_URL` | `${{Postgres-<Cliente>.DATABASE_URL}}` | `${{Postgres...}}` a secas es la base de **Depot** |
| `BOT_POWER_DEFAULT` | `off` | El bot nace **prendido** |
| `NODE_ENV` | **no ponerla** | Con `production` el build falla |
| `ADMIN_KEY`, `OWNER_KEY`, `HUB_PIN` | claves nuevas, distintas de las de Depot | El PIN queda en «1234» |
| `OPENAI_API_KEY` | proyecto de OpenAI propio de este cliente | Los tokens se mezclan con otro cliente |
| `BILLING_START`, `BILLING_MANTENIMIENTO` | primer día facturable y cuota | Cuenta como Depot ($80 desde el 12-ago) |
| `OPENAI_*` de modelos y `AI_*` | copiadas de Depot, **sin** las `*_CANARY_*` | |
| `WHATSAPP_WABA_ID` | el ID de la cuenta de WhatsApp Business del cliente (paso de Meta) | El botón «Actualizar desde Meta» del panel no trae el estado real de las plantillas |

- [ ] Deploy y luego la semilla, con la URL **pública** del Postgres del cliente:

```bash
cd app && DATABASE_URL='<URL pública del Postgres del cliente>' NEGOCIO=<id> OPENAI_API_KEY=x npm run seed:negocio
```

- [ ] Entrar a `https://<cliente>.up.railway.app/admin/` con `manuel` y el `HUB_PIN`.

## Paso 5 — Catálogo

- [ ] Con API (Contífico, Perseo): variables de la integración y esperar la primera sincronización.
- [ ] Sin API: subir el Excel **tal como sale del sistema** en el panel → **Inventario**.
- [ ] Decidir y anotar en el arranque del cliente:

| Decisión | Competimotor (referencia) |
|---|---|
| Cuál columna es el precio al público | Precio A |
| El precio trae IVA | Sí |
| Precio por forma de pago | B tarjeta · C efectivo y transferencia · D nunca al cliente |
| Qué stock se usa | El total (un solo stock grande) |
| Qué filas quedan fuera | Camión (aro 17.5 / 22.5), precios en 0 |
| Descuento visible | Ninguno |

- [ ] Revisar cuántas filas entraron y cuáles quedaron fuera, y avisarle al cliente los errores de
      tipeo de su Excel.
- [ ] Acordar **quién sube el Excel cada día y a qué hora**. Sin eso el bot cotiza con stock viejo.

## Paso 6 — Ajustes en el panel (sin deploy)

- [ ] **Negocio → Horarios:** cada local, sábados, feriados.
- [ ] **Avisos → Quién recibe los avisos:** asesores con teléfono (593…), nivel y local.
      **Al menos un Nivel 1**, o el reporte diario no le llega a nadie.
- [ ] **Piezas → Promociones:** lo que incluye la compra, con la cantidad mínima (ejemplo:
      alineación solo con 4 llantas). Si no se carga, el bot no promete nada.
- [ ] **Usuarios:** uno por persona del cliente.
- [ ] **Bot → Falta para encender el bot:** debe quedar vacío, o cada pendiente aceptado a sabiendas.
- [ ] Mirar el panel entero buscando restos de otro cliente (nombres, textos, usuarios).

## Paso 7 — Meta y WhatsApp

Es el paso más largo. La receta de 15 pasos, pantalla por pantalla, está en
[ALTA_META_CLIENTE_NUEVO.md](../ALTA_META_CLIENTE_NUEVO.md). Resumen:

| # | Qué | Quién |
|---|---|---|
| 1 | El cliente invita a Manuel como administrador del portafolio. Manuel acepta **con su propio Facebook** | Cliente + Manuel |
| 2 | Crear la app `AutoVenta <Cliente>` **en el portafolio del cliente**, URL de privacidad, publicar | Claude (Manuel aprueba los términos) |
| 3 | Usuario del sistema con la app asignada | Claude |
| 4 | Verificar el negocio: razón social exacta del RUC + documento vigente | Claude llena · Manuel hace el CAPTCHA y sube el documento |
| 5 | Crear la cuenta de WhatsApp por **coexistencia** con la prueba gratis de Kommo | Manuel + quien tiene el celular (videollamada de 15 min) |
| 6 | Asignar al usuario del sistema **los dos activos** (WhatsApp accounts y Messaging accounts) | Claude |
| 7 | Token que no vence + App secret, pegados en el panel | Manuel |
| 8 | Webhook `https://<cliente>.up.railway.app/webhook` con el verify token del panel | Manuel o Claude |
| 9 | Suscribir la app a la cuenta y dejar solo los campos `messages`, `smb_message_echoes` y `calls` | Claude |
| 10 | Diagnóstico del panel: 8 de 8 | Claude + Manuel |

```bash
app/scripts/meta/suscribir-waba.sh Postgres-<Cliente> <host:puerto del proxy> <WABA_ID>
```

Antes de la videollamada, avisarle al cliente lo que cambia en su celular: se cierran WhatsApp Web
y los dispositivos vinculados (se vuelven a vincular), dejan de funcionar las listas de difusión, y
hay que abrir WhatsApp Business en ese celular al menos cada 14 días.

- [ ] Anotar en `docs/clientes/<id>.md`: ID del portafolio, de la app, de la cuenta de WhatsApp
      (WABA) y del número. **Nunca** el token ni el App secret.
- [ ] Anotar la fecha en que vence la prueba de Kommo y poner un recordatorio.
- [ ] Pedirle al cliente que ponga su tarjeta en la cuenta de WhatsApp (hace falta para las
      plantillas).

## Paso 8 — Plantillas de WhatsApp

Sin plantillas aprobadas el bot **no puede escribir pasadas las 24 horas**: no hay seguimientos ni
recordatorios de visita. Como Meta tarda hasta 24 h en aprobarlas, se envían apenas existe el token.

Lista de plantillas por cliente y pasos: [PLANTILLAS.md](PLANTILLAS.md).

- [ ] Enviar a Meta todas las de la lista.
- [ ] Revisar que queden `APPROVED` y que la categoría siga siendo `UTILITY`.
- [ ] Marcarlas como aprobadas en el panel → Seguimientos.

## Paso 9 — Probar en el simulador

```bash
cd app && npm run sim -- --perfil <id> --humo
```

```bash
cd app && npm run sim -- --perfil <id> --catalogo-archivo <ruta/al/inventario.xlsx>
```

- [ ] Poner el servicio del cliente en `PERFILES_SIM` (`app/scripts/sim/lib/entorno-prod.mjs`) y
      crear `app/.env.sim.<id>` con la URL pública de su Postgres, para que el simulador copie su
      configuración real.
- [ ] **20 chats reales del cliente** contestados bien. Probar siempre: medida completa, «ancho +
      aro» sin perfil, 1 llanta y 4 llantas, pregunta por descuento o tarjeta, pregunta por la
      ubicación, un producto que no cotiza, y un mensaje fuera de horario.
- [ ] Mirar la cotización en imagen y en PDF: logo, marca, garantías, pie.

## Paso 10 — Probar en vivo solo con Manuel

- [ ] Clave de OpenAI puesta y **Deploy** pulsado en Railway.
- [ ] Bot apagado, con una sola excepción:

```bash
railway variables --set "BOT_APAGADO_EXCEPTO=593XXXXXXXXX" --service <Cliente> --environment Depot_Tire
```

- [ ] Escribir desde el número de Manuel: llega, contesta, manda la cotización, avisa al asesor.
- [ ] Escribir desde otro número: el mensaje entra al Inbox y el bot **no** contesta.

## Paso 11 — Encender para todos

- [ ] Las plantillas del paso 8 aprobadas.
- [ ] El Excel de hoy cargado.
- [ ] El cliente dio el OK por escrito.
- [ ] Si van a pautar: el bot se abre **antes** de que salga el primer anuncio.
- [ ] Quitar `BOT_APAGADO_EXCEPTO` y luego Ajustes → Bot → **Encender el bot**.
- [ ] Revisar todos los chats de ese día.

## Paso 12 — Primera semana

- [ ] Leer los chats cada día. Un error del bot se arregla en el código común, con su prueba, y
      sale para todos los clientes ([COMO-ARREGLAR-EL-BOT.md](../COMO-ARREGLAR-EL-BOT.md)).
- [ ] Confirmar que el Excel se sube cada día.
- [ ] Pedir el Excel de facturas con teléfono cada semana, para medir las ventas del bot.
- [ ] Antes de que venza la prueba de Kommo: confirmar que el bot sigue recibiendo mensajes.
- [ ] Cobrar en la fecha acordada.
- [ ] **Anotar en esta carpeta lo que se aprendió.**

---

## Reglas que no se rompen

1. La app de Meta va en el portafolio **del cliente**. En el nuestro, todo se ve bien y no entra
   ni un mensaje real.
2. **Nunca** usar «Add phone number» en el panel de Meta, ni aceptar *migrar* o *eliminar el número
   de la app*: deja al local sin WhatsApp. Siempre coexistencia.
3. El bot nace apagado (`BOT_POWER_DEFAULT=off`).
4. Lo no confirmado es `[PENDIENTE]`, nunca inventado.
5. Un push a `main` reinicia el servicio de **todos** los clientes. Lo de todos los días va en
   Ajustes; los cambios de código se juntan.
6. Tokens, App secret, contraseñas y claves nunca se escriben en un documento ni en el chat.
7. El precio mayorista (o cualquier lista interna) nunca se le muestra al cliente final.

## Quién hace qué

| Claude | Manuel | El cliente |
|---|---|---|
| Perfil, servicio, semilla, catálogo, plantillas | Aceptar invitaciones con su Facebook | Invitar a Manuel al portafolio |
| Navegar Meta y llenar formularios | OK a cada término de Meta | Mandar RUC, documento vigente, Excel |
| Preparar la foto del documento | CAPTCHA y subir el documento | Tener el celular del número en la videollamada |
| Webhook y suscripción | Token, App secret, clave de OpenAI | Poner su tarjeta en Meta |
| Simulador y pruebas | Encender el bot | Subir el Excel cada día |

## Clientes dados de alta

| Cliente | `NEGOCIO` | Servicio | Sistema | Cuenta de WhatsApp (WABA) | Estado |
|---|---|---|---|---|---|
| Depot Tire | `depot` | `AutoVenta` | Contífico (API) | `970823328872837` | En producción desde ago-2026 |
| Competimotor | `mundillantas` | `Competimotors` (base `Postgres-Mundillantas`) | Fénix local (Excel diario) | `847835534545450` | En prueba desde el 17-nov-2026 |
| Mundillantas (2.º número) | por crear | por crear | Fénix local | por crear | Falta el sí por escrito |

## Cómo mantener esta guía

- Una pregunta nueva que hubo que hacerle a un cliente → [PREGUNTAS.md](PREGUNTAS.md).
- Algo que salió mal o costó más de una hora → [ERRORES.md](ERRORES.md), con fecha y cliente.
- Una plantilla nueva → [PLANTILLAS.md](PLANTILLAS.md).
- Un paso que cambió → este archivo. Si el detalle es largo, va en la guía de detalle y aquí solo
  el resumen y el enlace.
- Un cliente nuevo → una fila en «Clientes dados de alta».
