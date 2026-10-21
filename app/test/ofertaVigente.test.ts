/**
 * LA OFERTA DE COTIZAR COMO HECHO (regla de Manuel, 20-oct; revisión del
 * sprint 1 de la auditoría del 19-oct). El hecho se escribe al enviar la
 * oferta y el «sí» lo lee de ahí: estas pruebas usan los chats reales del
 * sprint, con el hecho en `metadata.oferta` como lo deja `services/ofertaVigente.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  aceptaLaOferta, consienteEsta, esSiFuerte, ofertaEnElTexto, ofertaVigente, opcionesDelMenuAbierto,
  type FilaDelHilo, type OfertaDeCotizar,
} from "../src/domain/ofertaVigente.js";

const LAMINA_29029 = [{ codigo: "350214", marca: "FALKEN", diseno: "WILDPEAK A/T TRAIL", medida: "215/65R16" }];
const LAMINA_29367 = [
  { codigo: "2657017WNMAXCLAWAT", marca: "WINRUN", diseno: "MAXCLAW A/T", medida: "265/70R17" },
  { codigo: "K557B738", marca: "KENDA", diseno: "KR628", medida: "265/70R17" },
  { codigo: "356531", marca: "FALKEN", diseno: "WILDPEAK A/T 4W", medida: "265/70R17" },
];
const MENU_29367 = "1 · WINRUN MAXCLAW A/T — $159.49 c/u · 4 = $637.96\n2 · KENDA KR628 — $184.81 c/u · 4 = $739.24\n3 · FALKEN WILDPEAK A/T 4W — $296.55 c/u · 4 = $1186.20\n---\n¿Le cotizo la 1, la 2 o la 3?";

const menu = (opciones: number): OfertaDeCotizar => ({ tipo: "oferta_de_cotizar", clase: "menu", opciones });
const una = (codigo: string, medida?: string): OfertaDeCotizar => ({ tipo: "oferta_de_cotizar", clase: "una", codigo, ...(medida ? { medida } : {}) });
const bot = (content: string, oferta?: OfertaDeCotizar | null): FilaDelHilo =>
  ({ role: "assistant", content, metadata: oferta === undefined ? {} : { oferta } });
const cliente = (content: string): FilaDelHilo => ({ role: "user", content });

describe("el detector corre sobre el texto que se ENVÍA", () => {
  it("chat 29029: «…FALKEN WILDPEAK A/T TRAIL… ¿Se la cotizo?» → UNA llanta, la Falken de la lámina", () => {
    expect(ofertaEnElTexto(
      "Para la medida *215/65R16*, le mostré la opción *FALKEN WILDPEAK A/T TRAIL* — *$143.65 c/u con IVA*.\n---\n¿Se la cotizo? 😊",
      LAMINA_29029,
    )).toEqual(una("350214", "215/65R16"));
  });
  it("chat 29367: la lista con «¿Le cotizo la 1, la 2 o la 3?» → MENÚ de 3", () => {
    expect(ofertaEnElTexto(MENU_29367, LAMINA_29367)).toEqual(menu(3));
    expect(ofertaEnElTexto("1 · A\n2 · B\n---\n¿Le cotizo la 1 o la 2?", LAMINA_29367.slice(0, 2))).toEqual(menu(2));
  });
  it("lo declarado por la puerta manda (la equivalente de 27992 sabe su código y su medida)", () => {
    expect(ofertaEnElTexto("¿Le cotizo la *KENDA KR20* en *195/45R15*? 😊", [], una("K247B536", "195/45R15")))
      .toEqual(una("K247B536", "195/45R15"));
  });
  it("si el Guardián o un candado quitó la oferta, no hay hecho aunque se haya declarado", () => {
    expect(ofertaEnElTexto("Perfecto, *Depot Tire Cumbayá*. ¿Qué día cree que puede pasar?", LAMINA_29029, una("350214"))).toBeNull();
    expect(ofertaEnElTexto("Cotización COT-MVH7SJP7 enviada por $574.60", LAMINA_29029)).toBeNull();
  });
});

describe("el lector del hilo lee el HECHO", () => {
  it("chat 29367: menú guardado + «Ok gracias» → menú de 3 abierto, el acuse no acepta nada", () => {
    const leida = ofertaVigente([bot(MENU_29367, menu(3)), cliente("Ok gracias")]);
    expect(leida.fuente).toBe("hecho");
    expect(opcionesDelMenuAbierto(leida)).toBe(3);
    expect(aceptaLaOferta(leida, "Ok gracias")).toBe(false);
  });

  it("chat 28606: el menú sigue abierto aunque el bot haya contestado otra cosa en el medio", () => {
    const leida = ofertaVigente([
      bot(MENU_29367, menu(3)),
      cliente("Que ciudad"),
      bot("Estamos en *Quito, Ecuador*. ¿Desea que le envíe las ubicaciones por mapa?", null),
      cliente("4 llantas"), cliente("Quiero"),
    ]);
    expect(opcionesDelMenuAbierto(leida)).toBe(3);
  });

  it("el cliente ya eligió («La 2») y el bot no pudo cotizar: un «ok» después no reabre el menú", () => {
    expect(opcionesDelMenuAbierto(ofertaVigente([
      bot(MENU_29367, menu(3)), cliente("La 2"),
      bot("La KENDA KR628 se agotó justo ahora; el asesor le confirma cuándo llega.", null), cliente("ok"),
    ]))).toBe(0);
  });

  it("chat 29029: «Si, por favor» pegado a la oferta de la Falken la acepta", () => {
    const leida = ofertaVigente([bot("…FALKEN WILDPEAK A/T TRAIL…\n¿Se la cotizo? 😊", una("350214")), cliente("Si, por favor")]);
    expect(leida.turnosAtras).toBe(0);
    expect(aceptaLaOferta(leida, "Si, por favor")).toBe(true);
    expect(aceptaLaOferta(leida, "Gracias")).toBe(true);
    expect(aceptaLaOferta(leida, "si, pero en aro 17")).toBe(false);
  });

  it("chat 27992: «Precio» en el medio; después el sí fuerte acepta la equivalente, el acuse suelto no", () => {
    const hilo = [
      bot("¿Le cotizo la *KENDA KR20* en *195/45R15*? 😊", una("K247B536", "195/45R15")),
      cliente("Precio"),
      bot("La opción de costo es la *KENDA KR20* — *$84.95 c/u con IVA*, en *195/45R15*.", null),
    ];
    const kr20 = { codigo: "K247B536", medida: "195/45R15" };
    for (const si of ["Si", "Sí, cotíceme", "Si cotizame esa", "dale, cotice"]) {
      expect(consienteEsta(ofertaVigente([...hilo, cliente(si)]), kr20, si), si).toBe(true);
    }
    for (const no of ["Ok", "Precio", "¿y en 185?"]) {
      expect(consienteEsta(ofertaVigente([...hilo, cliente(no)]), kr20, no), no).toBe(false);
    }
    // Y el sí a la KR20 no consiente OTRA llanta.
    expect(consienteEsta(ofertaVigente([...hilo, cliente("Si")]), { codigo: "OTRA", medida: "205/45R15" }, "Si")).toBe(false);
  });

  it("chat 25741: «Si por favor» a «¿Le cotizo la 3, *FALKEN WILDPEAK A/T TRAIL*?» consiente el cambio de marca", () => {
    const leida = ofertaVigente([bot("¿Le cotizo la 3, *FALKEN WILDPEAK A/T TRAIL*?", una("350218")), cliente("Si por favor")]);
    expect(consienteEsta(leida, { codigo: "350218", medida: "215/60R17" }, "Si por favor")).toBe(true);
  });

  it("la oferta muere con la cotización enviada, con una negativa, o con tres mensajes del cliente en el medio", () => {
    const oferta = bot("¿Se la cotizo?", una("350214"));
    expect(ofertaVigente([oferta, { role: "assistant", content: "Cotización COT-X enviada por $1", metadata: { piece: "quote" } }, cliente("Si")]).oferta).toBeNull();
    expect(ofertaVigente([oferta, cliente("No gracias"), bot("Con gusto", null), cliente("ok")]).oferta).toBeNull();
    expect(ofertaVigente([oferta, cliente("a"), cliente("b"), cliente("c"), bot("x", null), cliente("Si")]).oferta).toBeNull();
  });

  it("el turno que entregó la cotización no deja oferta viva aunque su cierre suene a oferta", () => {
    expect(ofertaVigente([
      { role: "assistant", content: "Cotización COT-X enviada por $1", metadata: { piece: "quote" } },
      bot("Listo, le cotizo la *WINRUN R330*… ¿A cuál local le queda mejor?", una("2054517WNR330")),
      cliente("Si"),
    ]).oferta).toBeNull();
  });

  it("hilo abierto el día del deploy (chat 27992): oferta vieja SIN hecho, turno nuevo sin oferta, «Si» → respaldo", () => {
    const leida = ofertaVigente([
      { role: "assistant", content: "¿Le cotizo la *KENDA KR20* en *195/45R15*? 😊", metadata: {} },
      cliente("Precio"),
      bot("La opción de costo es la *KENDA KR20* — *$84.95 c/u con IVA*.", null),
      cliente("Si"),
    ]);
    expect(leida).toMatchObject({ oferta: null, fuente: "respaldo" });
  });

  it("las piezas sin la clave no vuelven mixto un hilo con hechos", () => {
    const leida = ofertaVigente([
      { role: "assistant", content: "Opciones enviadas: A · B · C", metadata: { piece: "options" } },
      bot(MENU_29367, menu(3)),
      cliente("Ok gracias"),
    ]);
    expect(leida.fuente).toBe("hecho");
    expect(opcionesDelMenuAbierto(leida)).toBe(3);
  });

  // Revisión ronda 2 (20-oct): el asesor escribe con role='assistant' y
  // author_kind='owner' (ecos de wa/echoes.ts y el panel), sin la clave. No es
  // hecho ni «sin hecho»: no cuenta para nada.
  const asesor = (content: string): FilaDelHilo => ({ role: "assistant", content, author_kind: "owner", metadata: { origen: "echo" } });

  it("chat 29029 con el asesor en el medio («ya le confirmo el stock») → el «Si» lee el HECHO y acepta la Falken", () => {
    const leida = ofertaVigente([
      bot("…FALKEN WILDPEAK A/T TRAIL…\n¿Se la cotizo? 😊", una("350214")),
      asesor("ya le confirmo el stock"),
      cliente("Si, por favor"),
    ]);
    expect(leida).toMatchObject({ fuente: "hecho", turnosAtras: 0 });
    expect(aceptaLaOferta(leida, "Si, por favor")).toBe(true);
  });

  it("el asesor diciendo «no tenemos esa» no mata la oferta por sí solo (eso lo decide el cliente)", () => {
    const leida = ofertaVigente([
      bot("¿Se la cotizo? 😊", una("350214")), asesor("no tenemos esa"), cliente("ok"),
    ]);
    expect(leida.fuente).toBe("hecho");
    expect(leida.oferta).toEqual(una("350214"));
  });

  it("y tampoco inventa una: el texto del asesor con «¿se la cotizo?» no es una oferta del bot", () => {
    const leida = ofertaVigente([
      bot("Estamos en Quito.", null), asesor("Le tengo la Kenda, ¿se la cotizo?"), cliente("Si"),
    ]);
    expect(leida).toMatchObject({ fuente: "hecho", oferta: null });
  });

  it("las notas internas (type 'note') tampoco cuentan", () => {
    const leida = ofertaVigente([
      bot("¿Se la cotizo? 😊", una("350214")),
      { role: "assistant", content: "nota: cliente llama luego", author_kind: "bot", type: "note", metadata: {} },
      cliente("Si"),
    ]);
    expect(leida).toMatchObject({ fuente: "hecho", turnosAtras: 0 });
  });

  it("«Precio por favor» acepta la ÚNICA de su medida (25-sep), pero no la equivalente de otra medida (chat 27992)", () => {
    const unica: OfertaDeCotizar = { ...una("K924B544", "195/65R15"), unica: true };
    expect(aceptaLaOferta(ofertaVigente([bot("Es la única que tengo… ¿Se la cotizo?", unica), cliente("Precio por favor")]), "Precio por favor")).toBe(true);
    const equivalente = una("K247B536", "195/45R15");
    expect(consienteEsta(ofertaVigente([bot("¿Le cotizo la *KENDA KR20* en *195/45R15*?", equivalente), cliente("Precio")]), { codigo: "K247B536", medida: "195/45R15" }, "Precio")).toBe(false);
  });

  it("un hilo SIN hechos (anterior al deploy) se marca para caer al respaldo", () => {
    const leida = ofertaVigente([{ role: "assistant", content: "¿Se la cotizo?" }, cliente("Si")]);
    expect(leida).toMatchObject({ oferta: null, fuente: "respaldo" });
  });

  it("el sí fuerte: «sí», «dale», el verbo de cotizar; no «ok» ni «gracias» solos", () => {
    for (const si of ["Si", "Dale", "Sí, cotíceme", "Claro que si", "Las 4"]) expect(esSiFuerte(si), si).toBe(true);
    for (const no of ["Ok", "Gracias", "👍", "Precio"]) expect(esSiFuerte(no), no).toBe(false);
  });
});
