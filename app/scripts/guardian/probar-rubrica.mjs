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
];

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
    max_completion_tokens: 1200,
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
