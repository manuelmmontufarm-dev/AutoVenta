/**
 * ELEGIR ES COTIZAR (conv 3 de Manuel, 7-sep-2026), la parte pura.
 *
 * Tres cuadros del mismo día: «rin 14» → opciones → «deme la premium» /
 * «cotizeme la winrun» / «deme la r380» → el bot pidió la medida exacta tres
 * veces; «Busco Venom 315/70R17» → no hay Venom → «1» → «ok» a «¿Le cotizo la
 * KENDA KR608?» → sin cotización (candado de marca); «Otro día» → alerta al
 * asesor y «¿mañana o tarde?» en vez de «¿qué día?»; «¿tienen teléfono?» →
 * «No tengo un teléfono para compartirle» + la lámina otra vez.
 */
import { describe, expect, it } from "vitest";
import { eleccionDeLaVitrina } from "../src/domain/eleccionDeVitrina.js";
import { aroDadoPorElCliente, medidaConfirmadaPorCliente } from "../src/domain/medidaConfirmada.js";
import { equivalenteSinConsentimiento } from "../src/domain/equivalentePendiente.js";
import { pideTelefono } from "../src/domain/ubicacionPedida.js";
import { pideVerOpciones } from "../src/domain/salesIntent.js";
import { CONTACTO_ES_ESTE_CHAT, sinTelefonoPropio } from "../src/domain/candadosDeTexto.js";
import { TEXTO_OTRO_DIA } from "../src/domain/botones.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
const { pideOtroDia, respuestaAlOtroDia } = await import("../src/services/rutaOtroDia.js");

const RIN14 = [
  { codigo: "K251B406", marca: "KENDA", diseno: "KR20", medida: "195/60R14" },
  { codigo: "1856014WNR380", marca: "WINRUN", diseno: "R380", medida: "185/60R14" },
];
const DOS_R380 = [
  { codigo: "1856014WNR380", marca: "WINRUN", diseno: "R380", medida: "185/60R14" },
  { codigo: "1857014WNR380", marca: "WINRUN", diseno: "R380", medida: "185/70R14" },
];
const ARO16 = [
  { codigo: "352165", marca: "FALKEN", diseno: "ZE310R", medida: "205/55R16" },
  { codigo: "K236B042", marca: "KENDA", diseno: "KR20", medida: "205/50R16" },
  { codigo: "2055516WNR330", marca: "WINRUN", diseno: "R330", medida: "205/55R16" },
];

describe("eleccionDeLaVitrina · señalar una llanta de la lámina", () => {
  it("«cotizeme la winrun» y «deme la r380» eligen la Winrun de rin 14", () => {
    expect(eleccionDeLaVitrina("cotizeme la winrun", RIN14)).toEqual({ tipo: "una", opcion: RIN14[1] });
    expect(eleccionDeLaVitrina("deme la r380", RIN14)).toEqual({ tipo: "una", opcion: RIN14[1] });
    expect(eleccionDeLaVitrina("la kenda por favor", RIN14)).toEqual({ tipo: "una", opcion: RIN14[0] });
    expect(eleccionDeLaVitrina("Quiero las Falken ZE310R", ARO16)).toEqual({ tipo: "una", opcion: ARO16[0] });
  });

  it("dos R380 en dos medidas: se pregunta cuál, y una medida escrita la resuelve", () => {
    expect(eleccionDeLaVitrina("deme la r380", DOS_R380)).toEqual({ tipo: "varias", opciones: DOS_R380 });
    expect(eleccionDeLaVitrina("la r380 185/70", DOS_R380)).toEqual({ tipo: "una", opcion: DOS_R380[1] });
  });

  it("una pregunta o un mensaje largo no es una elección", () => {
    expect(eleccionDeLaVitrina("cuánto dura la winrun", RIN14)).toBeNull();
    expect(eleccionDeLaVitrina("y con que mas viene la llanta", ARO16)).toBeNull();
    expect(eleccionDeLaVitrina("deme la premium", RIN14)).toBeNull(); // eso lo lee el menú de preferencia
    expect(eleccionDeLaVitrina("hola", RIN14)).toBeNull();
    expect(eleccionDeLaVitrina("las winrun", [])).toBeNull();
  });
});

describe("el aro del cliente basta para cotizar lo que eligió", () => {
  it("«necesito rin 14» es el aro del cliente; una medida completa no", () => {
    expect(aroDadoPorElCliente(["hola", "necesito rin 14"])).toBe(14);
    expect(aroDadoPorElCliente(["que tiene rin 15", "195/55R15"])).toBe(15);
    expect(aroDadoPorElCliente(["195/55R15"])).toBeNull();
    expect(aroDadoPorElCliente(["tengo un Suzuki SZ 2016"])).toBeNull();
  });

  it("la medida deducida por el vehículo sigue sin confirmar (conv 13862)", () => {
    expect(medidaConfirmadaPorCliente("225/70R16", ["tengo un Susuki Sz 2016, que me recomienda"])).toBe(false);
  });

  it("con solo el aro, la opción de ESE aro no pide consentimiento; la de otro aro sí (conv 14687)", () => {
    const base = { nombreProducto: "WINRUN R380", medidasDelCliente: [], ultimoMensajeDelBot: "¿Cuál prefiere?", textoDelCliente: "deme la premium" };
    expect(equivalenteSinConsentimiento({ ...base, medidaProducto: "185/60R14", aroDelCliente: 14 })).toBe(false);
    expect(equivalenteSinConsentimiento({ ...base, medidaProducto: "205/55R16", aroDelCliente: 17, textoDelCliente: "ok" })).toBe(true);
    // Sin medida ni aro no hay «equivalente» de nada.
    expect(equivalenteSinConsentimiento({ ...base, medidaProducto: "185/60R14", aroDelCliente: null })).toBe(false);
  });
});

describe("«Otro día» pregunta qué día, siempre", () => {
  it("el botón y la frase libre entran por la ruta", () => {
    expect(pideOtroDia(TEXTO_OTRO_DIA)).toBe(true);
    expect(pideOtroDia("no puedo esos días")).toBe(true);
    expect(pideOtroDia("el jueves")).toBe(false);
    expect(pideOtroDia("otro día le aviso")).toBe(false);
  });
  it("la respuesta nombra el local y pide el día; sin local pide los dos", () => {
    expect(respuestaAlOtroDia("Depot Tire Quito Sur")).toBe("Perfecto. ¿Qué día le queda bien pasar por *Depot Tire Quito Sur*? Lo anoto y le aviso al asesor. 📅");
    expect(respuestaAlOtroDia(null)).toMatch(/Qué día.*Cumbayá.*Quito Sur/);
  });
});

describe("el teléfono es este WhatsApp", () => {
  it("«¿Tienen un teléfono para llamar?» se detecta; una pregunta de garantía no", () => {
    expect(pideTelefono("Tienen un teléfono para llamar?")).toBe(true);
    expect(pideTelefono("me pasa un número de contacto")).toBe(true);
    expect(pideTelefono("y con que mas viene la llanta")).toBe(false);
  });
  it("«No tengo un teléfono para compartirle» se reemplaza por el contacto real", () => {
    const r = sinTelefonoPropio("Por este medio le puedo ayudar. No tengo un teléfono para compartirle en este momento. Sobre qué incluye la compra: alineación y balanceo.", "+593 98 280 1766");
    expect(r.quitado).toBe(true);
    expect(r.texto).toContain(CONTACTO_ES_ESTE_CHAT);
    expect(r.texto).not.toMatch(/No tengo un teléfono/);
    expect(r.texto).toContain("alineación y balanceo");
  });
});

describe("una pregunta no reenvía la lámina", () => {
  it.each(["y con que mas viene la llanta", "Tienen un teléfono para llamar?", "prosedencia de las llanatas", "cuánto dura la kenda"])(
    "«%s» no pide ver opciones", (t) => expect(pideVerOpciones(t)).toBe(false),
  );
  it.each(["muéstreme otras opciones", "unas más económicas", "tiene en rin 15", "205/55R16", "tienen A/T?", "y de otra marca?", "qué me recomienda"])(
    "«%s» sí pide ver opciones", (t) => expect(pideVerOpciones(t)).toBe(true),
  );
});

describe("la ruta directa: qué llanta señaló y qué sale", async () => {
  const { loQueEligio } = await import("../src/services/cotizarLoElegido.js");
  const MENU = "Para afinarle la recomendación sobre las opciones que le envié, dígame una sola cosa: ¿qué prioriza usted?\n1) *Costo*\n2) *Premium*";
  const ESCALONES = { economica: { codigo: "1856014WNR380" }, premium: { codigo: "K251B406" } };

  it("«1» tras el menú es el escalón de costo; «deme la premium» el premium", () => {
    expect(loQueEligio("1", MENU, null, RIN14, ESCALONES)).toEqual({ codigo: "1856014WNR380", etiqueta: "de costo" });
    expect(loQueEligio("deme la premium", MENU, null, RIN14, ESCALONES)).toEqual({ codigo: "K251B406", etiqueta: "premium" });
  });
  it("«cotizeme la winrun» y «deme la r380» cotizan la Winrun sin etiqueta", () => {
    expect(loQueEligio("cotizeme la winrun", MENU, null, RIN14, ESCALONES)).toEqual({ codigo: "1856014WNR380", etiqueta: null });
    expect(loQueEligio("deme la r380", "¿Cuál prefiere?", null, RIN14, null)).toEqual({ codigo: "1856014WNR380", etiqueta: null });
  });
  it("dos R380: pregunta cuál medida, nombrando las dos", () => {
    const r = loQueEligio("deme la r380", MENU, null, DOS_R380, null);
    expect(r && "pregunta" in r ? r.pregunta : "").toMatch(/185\/60R14.*185\/70R14.*¿Cuál es la suya\?/);
  });
  it("«1» sin menú antes no es una elección (podría ser cantidad); una pregunta tampoco", () => {
    expect(loQueEligio("1", "¿A cuál local le queda mejor ir?", null, RIN14, ESCALONES)).toBeNull();
    expect(loQueEligio("y con que mas viene la llanta", MENU, null, RIN14, ESCALONES)).toBeNull();
  });
});
