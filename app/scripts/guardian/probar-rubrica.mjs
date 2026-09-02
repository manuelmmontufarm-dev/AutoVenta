/**
 * EL ÁNGEL GUARDIÁN CONTRA LOS BORRADORES QUE SÍ SALIERON.
 *
 * Manuel, 27-ago-2026: «necesitamos ver que el ángel guardián pueda detectar
 * este tipo de errores — o sea, si le doy las conversaciones tiene que poder
 * entender el error así mismo como lo muestro».
 *
 * Esto le da al guardián REAL (mismo modelo, misma rúbrica, mismo formato de
 * hechos que arma `armarContexto`) los borradores exactos que se enviaron en
 * producción, y comprueba que devuelva el hallazgo con su categoría y su
 * severidad. Los candados de este repo evitan que esos borradores vuelvan a
 * salir; esto mide la SEGUNDA línea de defensa, que es la que tiene que
 * aguantar el error que todavía no vimos.
 *
 *   node scripts/guardian/probar-rubrica.mjs
 *
 * Usa la clave de `.env.sim` (la de pruebas), NO la del bot: estos tokens no
 * se le cobran a Depot.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import OpenAI from "openai";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
for (const archivo of [".env", ".env.sim"]) {
  try {
    for (const linea of readFileSync(path.join(raiz, archivo), "utf8").split("\n")) {
      const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* opcional */ }
}
process.env.WHATSAPP_TOKEN ||= "x"; process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x"; process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "593999000111";
delete process.env.OPENAI_BASE_URL;

const { INSTRUCCIONES, ESQUEMA_SALIDA } = await import("../../dist/services/guardian.js");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODELO = process.env.OPENAI_GUARDIAN_MODEL || process.env.OPENAI_MODEL || "gpt-5.5";

/** Los casos, con los textos tal como salieron de producción. */
const CASOS = [
  {
    nombre: "conv 11720 · firma 4 llantas de las que hay 1",
    espera: { categoria: "stock_prometido", severidad: "alta" },
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 215/50R17
Local ya elegido: (ninguno)
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
STOCK NO ALCANZA: la cotización vigente es por 4 y hoy hay 1 de KENDA KR20 215/50R17 — menos de la mitad de lo pedido. Esto NO es un desfase de inventario: es que no hay. Avisar no basta; esa cantidad no se debió firmar.
Cotización vigente: COT-MTBQRPTH · total $423.52 · 4 × KENDA KR20 215/50R17

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: 215/50/17
BOT: Opciones enviadas: KENDA KR20
CLIENTE: Si esa medida

== BORRADOR QUE EL BOT VA A ENVIAR ==
Listo, le dejé la cotización por *4 × KENDA KR20 215/50R17* a *$105.88 c/u*, total *$423.52*.
⚠️ Ojo: de esa llanta hoy tengo *1* disponible y usted pidió *4*. Se la cotizo completa y el resto se lo confirma el asesor en el local.`,
  },
  {
    nombre: "conv 4732 · le insiste al que ya compró en otro lado",
    espera: { categoria: "insiste_tras_rechazo", severidad: "alta" },
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 235/75R15
Local ya elegido: Depot Tire Cumbayá
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
EL CLIENTE SE DESPIDIÓ: su último mensaje fue «Gracias ya compré en otro lugar». La venta está cerrada. No se le insiste con nada.
Cotización vigente: COT-MTACN72K · total $221.77 · 1 × FALKEN WILDPEAK A/T 4W 235/75R15

== CONVERSACIÓN (lo más reciente al final) ==
BOT: 🚗 Me quedé pendiente de tu visita. ¿Qué día te quedaría más cómodo para coordinar a Depot Tire Cumbayá? 😊
CLIENTE: Gracias ya compré en otro lugar

== BORRADOR QUE EL BOT VA A ENVIAR ==
Entendido, gracias por avisar 🤝
---
¿Qué día cree que puede pasar por *Depot Tire Cumbayá*? Con ese dato le aviso al asesor y le dejan lista su cotización con *25 %* de descuento, *$73.92* menos. 📅`,
  },
  {
    nombre: "conv 11070 · vuelve a ofrecer lo que el cliente ya aceptó",
    espera: { categoria: "reofrece_lo_aceptado", severidad: "alta" },
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 245/70R16
Local ya elegido: (ninguno)
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
EL CLIENTE YA ACEPTÓ: el bot le ofreció la cotización y él contestó «Gracias». Eso es un sí. Lo que corresponde es la cotización, no volver a ofrecerla.

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: Precio
BOT: La más económica en 245/70R16 es *KENDA KR628* a *$144.44 c/u con IVA*. Se la puedo cotizar por *4 llantas*; si prefiere equilibrio o premium, también le paso esa.
CLIENTE: Gracias

== BORRADOR QUE EL BOT VA A ENVIAR ==
Con gusto 😊
---
Si desea, le dejo la cotización formal por *4 llantas KENDA KR628* para que pueda acercarse a tienda con el precio asegurado.`,
  },
  {
    // El control. Un guardián que marca todo no sirve para nada.
    nombre: "CONTROL · un turno sano no debe generar hallazgos de estas tres familias",
    espera: null,
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 195/65R15
Local ya elegido: (ninguno)
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
Cotización vigente: COT-MTBZZZZZ · total $262.60 · 4 × KENDA KR203 195/65R15

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: 195/65R15
BOT: Opciones enviadas: KENDA KR203
CLIENTE: la mas economica

== BORRADOR QUE EL BOT VA A ENVIAR ==
Listo, ahí le mandé la cotización por *4 llantas KENDA KR203* 👍
---
¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍`,
  },
  {
    nombre: "conv 11070 bis · precio inventado fuera de la cotización",
    espera: { categoria: "precio_incorrecto", severidad: "alta" },
    familias: ["precio_incorrecto"],
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 245/70R16
Local ya elegido: (ninguno)
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
Cotización vigente: ninguna
Servicios y beneficios respaldados: ninguno cargado — el borrador no puede prometer nada como incluido

== CATÁLOGO DE HOY (fuente determinística: Contífico + precios Interbot, el mismo número que imprimen las piezas) ==
· KENDA KR628 245/70R16 — hoy $144.44 c/u con IVA · stock hoy: 10
· KENDA KR601 245/70R16 — hoy $194.85 c/u con IVA · stock hoy: 12
· KENDA KR608 245/70R16 — hoy $213.50 c/u con IVA · stock hoy: 8

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: En la medida 245/70/16
BOT: Opciones enviadas: KENDA KR608 · KENDA KR601 · KENDA KR628
CLIENTE: Precio

== BORRADOR QUE EL BOT VA A ENVIAR ==
La más económica en 245/70R16 es *KENDA KR628* a *$129.99 c/u con IVA*.
Se la puedo cotizar por *4 llantas*; si prefiere equilibrio o premium, también le paso esa.`,
    verificar: (salida) =>
      salida.veredicto === "corregir" && /144\.44/.test(salida.texto_corregido ?? "")
        ? null
        : "la corrección no usó el precio del catálogo ($144.44)",
  },
  {
    nombre: "vitrina rota · recomienda una llanta agotada",
    espera: { categoria: "stock_prometido", severidad: "alta" },
    familias: ["stock_prometido"],
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 195/55R15
Local ya elegido: (ninguno)
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
Cotización vigente: ninguna
Servicios y beneficios respaldados: ninguno cargado — el borrador no puede prometer nada como incluido

== CATÁLOGO DE HOY (fuente determinística: Contífico + precios Interbot, el mismo número que imprimen las piezas) ==
· KENDA KR20 195/55R15 — hoy $82.42 c/u con IVA · stock hoy: 5
· KENDA KR203 195/55R15 — hoy $70.48 c/u con IVA · stock hoy: 0 (AGOTADA: no se ofrece)
· WINRUN R330 195/55R15 — hoy $58.25 c/u con IVA · stock hoy: 0 (AGOTADA: no se ofrece)

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: 195/55R15 la mas barata
BOT: Opciones enviadas: KENDA KR20

== BORRADOR QUE EL BOT VA A ENVIAR ==
La más económica en 195/55R15 es la *WINRUN R330* a *$58.25 c/u con IVA*. ¿Se la cotizo por *4 llantas*?`,
    verificar: (salida) =>
      salida.veredicto === "corregir" && /KR20/.test(salida.texto_corregido ?? "")
        ? null
        : "la corrección no ofreció la que sí tiene stock (KR20)",
  },
  {
    nombre: "conv 13645 · presenta la KR50 [H/T] como la A/T pedida",
    espera: { categoria: "tipo_negado_con_stock", severidad: "alta" },
    familias: ["tipo_negado_con_stock"],
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 265/65R17
Local ya elegido: (ninguno)
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
Cotización vigente: ninguna
Servicios y beneficios respaldados: instalación, alineación, balanceo, seguro gratuito contra daños, mantenimiento cada 10.000 km, revisión del vehículo

== CATÁLOGO DE HOY (fuente determinística: Contífico + precios Interbot, el mismo número que imprimen las piezas) ==
· KENDA KR50 265/65R17 [H/T] — hoy $202.33 c/u con IVA · stock hoy: 48
· FALKEN WILDPEAK A/T4W 265/65R17 [A/T] — hoy $256.50 c/u con IVA · stock hoy: 1 (STOCK CORTO para el juego de 4: no ofrecer 1 unidades sueltas; el resto lo confirma el asesor)
· KENDA KR29 265/65R17 [M/T] — hoy $263.40 c/u con IVA · stock hoy: 80
· WINRUN MAXCLAW R/T 265/65R17 [R/T] — hoy $206.60 c/u con IVA · stock hoy: 44
· WINRUN MAXCLAW A/T 265/65R17 [A/T] — hoy $170.70 c/u con IVA · stock hoy: 3 (STOCK CORTO para el juego de 4: no ofrecer 3 unidades sueltas; el resto lo confirma el asesor)
· KENDA KR608 265/65R17 [A/T] — hoy $262.90 c/u con IVA · stock hoy: 74
· KENDA KR28 265/65R17 [A/T] — hoy $238.37 c/u con IVA · stock hoy: 89
· KENDA KR601 265/65R17 [R/T] — hoy $274.60 c/u con IVA · stock hoy: 44
· KENDA KR628 265/65R17 [A/T] — hoy $209.60 c/u con IVA · stock hoy: 3 (STOCK CORTO para el juego de 4: no ofrecer 3 unidades sueltas; el resto lo confirma el asesor)

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: En 265 65 17
BOT: Opciones enviadas: KENDA KR50 · KENDA KR29 · WINRUN MAXCLAW R/T
CLIENTE: En at

== BORRADOR QUE EL BOT VA A ENVIAR ==
Para 265/65R17 A/T, la opción equilibrada es KENDA KR50 a $202.33 c/u con IVA.

Incluye instalación, alineación, balanceo, seguro gratuito contra daños, mantenimiento cada 10.000 km y revisión del vehículo.`,
    verificar: (salida) =>
      salida.veredicto === "corregir" && /KR28|KR608/.test(salida.texto_corregido ?? "")
        ? null
        : "la corrección no ofreció una A/T real con stock (KR28 o KR608)",
  },
  {
    nombre: "conv 13645 bis · niega que haya A/T teniendo dos con stock de juego",
    espera: { categoria: "tipo_negado_con_stock", severidad: "alta" },
    familias: ["tipo_negado_con_stock"],
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 265/65R17
Local ya elegido: (ninguno)
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
Cotización vigente: ninguna
Servicios y beneficios respaldados: instalación, alineación, balanceo, seguro gratuito contra daños, mantenimiento cada 10.000 km, revisión del vehículo

== CATÁLOGO DE HOY (fuente determinística: Contífico + precios Interbot, el mismo número que imprimen las piezas) ==
· KENDA KR50 265/65R17 [H/T] — hoy $202.33 c/u con IVA · stock hoy: 48
· FALKEN WILDPEAK A/T4W 265/65R17 [A/T] — hoy $256.50 c/u con IVA · stock hoy: 1 (STOCK CORTO para el juego de 4: no ofrecer 1 unidades sueltas; el resto lo confirma el asesor)
· KENDA KR29 265/65R17 [M/T] — hoy $263.40 c/u con IVA · stock hoy: 80
· WINRUN MAXCLAW R/T 265/65R17 [R/T] — hoy $206.60 c/u con IVA · stock hoy: 44
· WINRUN MAXCLAW A/T 265/65R17 [A/T] — hoy $170.70 c/u con IVA · stock hoy: 3 (STOCK CORTO para el juego de 4: no ofrecer 3 unidades sueltas; el resto lo confirma el asesor)
· KENDA KR608 265/65R17 [A/T] — hoy $262.90 c/u con IVA · stock hoy: 74
· KENDA KR28 265/65R17 [A/T] — hoy $238.37 c/u con IVA · stock hoy: 89
· KENDA KR601 265/65R17 [R/T] — hoy $274.60 c/u con IVA · stock hoy: 44
· KENDA KR628 265/65R17 [A/T] — hoy $209.60 c/u con IVA · stock hoy: 3 (STOCK CORTO para el juego de 4: no ofrecer 3 unidades sueltas; el resto lo confirma el asesor)

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: En 265 65 17
BOT: Opciones enviadas: KENDA KR50 · KENDA KR29 · WINRUN MAXCLAW R/T
CLIENTE: En at

== BORRADOR QUE EL BOT VA A ENVIAR ==
Para 265/65R17, la opción equilibrada disponible es *KENDA KR50* a *$202.33 c/u con IVA*.

Si busca específicamente *A/T*, por ahora no le ofrezco una A/T disponible para juego de 4 en esa medida.

Incluye instalación, alineación, balanceo, seguro gratuito contra daños, mantenimiento cada 10.000 km y revisión del vehículo.`,
    verificar: (salida) =>
      salida.veredicto === "corregir" && /KR28|KR608/.test(salida.texto_corregido ?? "")
        ? null
        : "la corrección no ofreció una A/T real con stock (KR28 o KR608)",
  },
  {
    nombre: "CONTROL 3 · ofrecer la A/T correcta del catálogo no debe marcarse",
    espera: null,
    familias: ["tipo_negado_con_stock"],
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 265/65R17
Local ya elegido: (ninguno)
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
Cotización vigente: ninguna
Servicios y beneficios respaldados: instalación, alineación, balanceo, seguro gratuito contra daños

== CATÁLOGO DE HOY (fuente determinística: Contífico + precios Interbot, el mismo número que imprimen las piezas) ==
· KENDA KR50 265/65R17 [H/T] — hoy $202.33 c/u con IVA · stock hoy: 48
· KENDA KR28 265/65R17 [A/T] — hoy $238.37 c/u con IVA · stock hoy: 89
· KENDA KR608 265/65R17 [A/T] — hoy $262.90 c/u con IVA · stock hoy: 74

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: En 265 65 17
BOT: Opciones enviadas: KENDA KR50 · KENDA KR28
CLIENTE: En at

== BORRADOR QUE EL BOT VA A ENVIAR ==
En *A/T* para su 265/65R17 sí tengo: la *KENDA KR28* a *$238.37 c/u con IVA*, con stock para el juego de 4.
---
¿Le preparo la cotización con esa?`,
  },
  {
    nombre: "CONTROL 2 · el precio correcto del catálogo no debe marcarse",
    espera: null,
    familias: ["precio_incorrecto", "stock_prometido"],
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 245/70R16
Local ya elegido: (ninguno)
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
Cotización vigente: ninguna
Servicios y beneficios respaldados: ninguno cargado — el borrador no puede prometer nada como incluido

== CATÁLOGO DE HOY (fuente determinística: Contífico + precios Interbot, el mismo número que imprimen las piezas) ==
· KENDA KR628 245/70R16 — hoy $144.44 c/u con IVA · stock hoy: 10
· KENDA KR601 245/70R16 — hoy $194.85 c/u con IVA · stock hoy: 12

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: En la medida 245/70/16
BOT: Opciones enviadas: KENDA KR628 · KENDA KR601
CLIENTE: Precio

== BORRADOR QUE EL BOT VA A ENVIAR ==
La más económica en 245/70R16 es *KENDA KR628* a *$144.44 c/u con IVA*.
Se la puedo cotizar por *4 llantas*; si prefiere equilibrio o premium, también le paso esa.`,
  },
  {
    nombre: "conv 11881 · precios de OTRA medida colgados a la que pidió",
    espera: { categoria: "precio_incorrecto", severidad: "alta" },
    familias: ["precio_incorrecto", "medida_incorrecta", "stock_prometido"],
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 225/70R15
Local ya elegido: (ninguno)
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
Cotización vigente: ninguna
Servicios y beneficios respaldados: ninguno cargado — el borrador no puede prometer nada como incluido

== CATÁLOGO DE HOY (fuente determinística: Contífico + precios Interbot, el mismo número que imprimen las piezas) ==
· KENDA KR15 225/70R15 — hoy $99.69 c/u con IVA · stock hoy: 12
· KENDA KR33A 225/70R15 — hoy $132.84 c/u con IVA · stock hoy: 8
· KENDA KR100 225/70R15 — hoy $148.60 c/u con IVA · stock hoy: 6

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: Ron 15
BOT: Opciones enviadas: FALKEN WILDPEAK A/T 4W · KENDA KR20 · WINRUN R330
CLIENTE: 225/70/15

== BORRADOR QUE EL BOT VA A ENVIAR ==
Perfecto, en *225/70R15* ya le envié estas opciones: *Costo* WINRUN R330 $58.69 c/u, *Equilibrio* KENDA KR20 $71.77 c/u y *Premium* FALKEN WILDPEAK A/T 4W $208.48 c/u.`,
    verificar: (salida) =>
      salida.veredicto === "corregir" && !/58\.69/.test(salida.texto_corregido ?? "")
        ? null
        : "la corrección siguió arrastrando el precio de la otra medida ($58.69)",
  },
];

CASOS.push(
  {
    // 1-sep-2026, conv 13635, 17:38. Corrección del propio guardián que salió
    // al cliente: recomienda la equivalente y cierra «si acepta esa
    // equivalente» — sin pregunta. El «Ok» siguiente se perdió.
    nombre: "conv 13635 · recomienda la equivalente sin preguntar «¿le cotizo…?»",
    espera: { categoria: "recomendacion_sin_pregunta", severidad: "alta" },
    familias: ["recomendacion_sin_pregunta"],
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 205/65R16
Local ya elegido: Depot Tire Quito Sur
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
Cotización vigente: ninguna

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: Pedí 205/65/16
BOT: ⚠️ Ojo: en *205/65R16* no me queda disponibilidad exacta. Estas son *equivalentes* de su aro: WILDPEAK A/T TRAIL en 215/65R16, KR33A en 215/65R16, R380 en 215/65R16. Se confirma el calce al montar.
CLIENTE: Bueno, bonito y barato
BOT: La opción más “bueno, bonito y barato” sería la WINRUN R380 en 215/65R16, $85.52 c/u con IVA, si acepta equivalente.
CLIENTE: Ok

== LO QUE EL BOT HIZO ESTE TURNO (herramientas) ==
buscar_llanta({"medida":"205/65R16"}) → {"sin_coincidencia_exacta":true,"equivalentes_del_aro":[...]}
preparar_opciones({"codes":["350214","307FB637","2055516WNR330"],"recomendado":"2055516WNR330"}) → {"imagen_enviada":true,"consentimiento_pendiente":true,"recomendacion":"WINRUN R330","recomendacion_entregada":true,...}
RECOMENDADA EQUIVALENTE PENDIENTE DE CONSENTIMIENTO: la llanta recomendada este turno es de OTRA medida que la pedida, y el bot todavía no tiene su sí. El borrador DEBE terminar con la pregunta «¿Le cotizo la <llanta> en <medida>?» sola en su bloque: esa pregunta es la legítima de la regla 15, NO es pregunta_de_mas — no la quites, no la reescribas y no la cambies por «si acepta esa equivalente» ni por «¿quiere que le envíe esa opción?». Si el borrador no la trae, es **recomendacion_sin_pregunta** (alta) y la corrección la agrega en bloque aparte. Y como no hay cotización este turno, PROHIBIDO anunciarla o prometerla.

== BORRADOR QUE EL BOT VA A ENVIAR ==
⚠️ Ojo: en *205/65R16* no me queda disponibilidad exacta. Estas opciones que le envié son *equivalentes* de aro 16 y se confirma el calce al montar:

• *FALKEN WILDPEAK A/T TRAIL* en *215/65R16*
• *KENDA KR33A* en *215/65R16*
• *WINRUN R330* en *205/55R16*

Como usted busca algo *bueno, bonito y barato*, la opción recomendada es *WINRUN R330* en *205/55R16*, si acepta esa equivalente.`,
    verificar: (salida) =>
      salida.veredicto === "corregir" && /¿[^?]*cotizo[^?]*R330[^?]*\?/i.test(salida.texto_corregido ?? "")
        ? null
        : "la corrección no cerró con la pregunta «¿Le cotizo la WINRUN R330…?»",
  },
  {
    // 1-sep-2026, conv 13635, 17:37. El borrador pedía permiso («¿Quiere que
    // le genere la cotización…?») y la corrección del guardián lo cambió por
    // «Le preparo la cotización por *4 WINRUN R380*» — una promesa sin
    // herramienta detrás. La corrección no puede prometer lo que no salió.
    nombre: "conv 13635 · la corrección NO puede prometer la cotización que no salió",
    espera: { categoria: "promesa_incumplible", severidad: "alta" },
    familias: ["promesa_incumplible", "reofrece_lo_aceptado", "pregunta_de_mas"],
    contexto: `== HECHOS REGISTRADOS ==
Medidas que el cliente pidió: 205/65R16
Local ya elegido: Depot Tire Quito Sur
Visita registrada: (ninguna)
Compromiso de visita en palabras del cliente: (ninguno)
EL CLIENTE YA ACEPTÓ: el bot le ofreció la cotización y él contestó «Ok». Eso es un sí. Lo que corresponde es la cotización, no volver a ofrecerla.
Cotización vigente: ninguna

== CONVERSACIÓN (lo más reciente al final) ==
CLIENTE: Ok
BOT: Le preparo la cotización por 4 WINRUN R380 en medida equivalente 215/65R16. Precio referencial: $85.52 c/u con IVA, total 4 llantas: $342.08.
BOT: ¿En cuál local le queda mejor: Depot Tire Cumbayá o Depot Tire Quito Sur?
CLIENTE: Quito Sur

== LO QUE EL BOT HIZO ESTE TURNO (herramientas) ==
buscar_llanta({"medida":"205/65R16"}) → {"sin_coincidencia_exacta":true,...}
preparar_opciones({"codes":["350214","307FB637","2156516WNR380"]}) → {"error":"Las opciones de 215/65R16 YA se enviaron hace 5 min..."}

== BORRADOR QUE EL BOT VA A ENVIAR ==
Listo, Depot Tire Quito Sur queda registrado como su local.
---
Para 205/65R16 exacta no me sale stock disponible ahora; la alternativa económica disponible es WINRUN R380 en 215/65R16 a $85.52 c/u con IVA, sujeta a verificación de calce en tienda.
---
Le preparo la cotización por las 4 WINRUN R380 para Depot Tire Quito Sur.`,
    verificar: (salida) =>
      salida.veredicto === "corregir" && !/le\s+(?:preparo|genero|armo|dejo)\s+la\s+cotizaci/i.test(salida.texto_corregido ?? "")
        ? null
        : "la corrección volvió a prometer «le preparo la cotización» sin herramienta detrás",
  },
);

const FAMILIAS_GLOBALES = ["stock_prometido", "insiste_tras_rechazo", "reofrece_lo_aceptado"];
let fallos = 0;

for (const caso of CASOS) {
  const r = await openai.chat.completions.create({
    model: MODELO,
    messages: [
      { role: "system", content: INSTRUCCIONES },
      { role: "user", content: caso.contexto },
    ],
    response_format: ESQUEMA_SALIDA,
    // 1200 se quedaba corto: el modelo razonador gastaba el tope pensando y
    // devolvía el content vacío (1-sep, caso «vitrina rota»), y el JSON.parse
    // tumbaba la corrida entera antes de llegar a los casos nuevos.
    max_completion_tokens: 4000,
  });
  const salida = JSON.parse(r.choices[0]?.message?.content ?? "{}");
  const hallazgos = salida.hallazgos ?? [];
  const familias = new Set(caso.familias ?? FAMILIAS_GLOBALES);
  const relevantes = hallazgos.filter((h) => familias.has(h.categoria));

  if (caso.espera === null) {
    const ok = relevantes.length === 0;
    if (!ok) fallos += 1;
    console.log(`${ok ? "✅" : "❌"} ${caso.nombre}`);
    if (!ok) console.log(`     marcó de más: ${relevantes.map((h) => h.categoria).join(", ")}`);
    continue;
  }

  const acierto = relevantes.find(
    (h) => h.categoria === caso.espera.categoria && h.severidad === caso.espera.severidad,
  );
  const detalleExtra = acierto && caso.verificar ? caso.verificar(salida) : null;
  if (!acierto || detalleExtra) fallos += 1;
  if (detalleExtra) console.log(`     ⚠️ ${detalleExtra}`);
  console.log(`${acierto ? "✅" : "❌"} ${caso.nombre}`);
  console.log(`     esperaba ${caso.espera.categoria}/${caso.espera.severidad}`);
  console.log(`     veredicto: ${salida.veredicto} · hallazgos: ${
    hallazgos.map((h) => `${h.categoria}/${h.severidad}`).join(", ") || "(ninguno)"}`);
  if (acierto) console.log(`     → «${acierto.detalle.slice(0, 180)}»`);
  if (salida.veredicto === "corregir") {
    console.log(`     corrección: «${(salida.texto_corregido ?? "").replace(/\n/g, " § ").slice(0, 200)}»`);
  }
}

console.log(`\n${fallos === 0 ? "✅" : "❌"} ${CASOS.length - fallos}/${CASOS.length} casos`);
process.exit(fallos === 0 ? 0 : 1);
