/**
 * UN SOLO LECTOR DE FECHAS DE VISITA (auditoría 19-oct-2026, familia 6 —
 * «fechas de visita mal leídas», 6 chats).
 *
 * Las frases son las de producción, con la hora real del mensaje («hoy» fijado
 * en el instante en que el cliente escribió). Quito es UTC-5 todo el año.
 *
 * Las dos puertas que escriben la visita —el pipeline (`index.ts`, con
 * `leerVisita`) y la herramienta `agendar_visita` (con `fechaParaAgendar`)—
 * tienen que leer lo mismo: en 29358 una dijo 24 y la otra 31, y se levantaron
 * dos alertas `visita_comprometida` para el mismo compromiso.
 */
import { describe, expect, it } from "vitest";
import {
  esElDiaDeLaVisita,
  fechaParaAgendar,
  leerVisita,
  yaPasoElDiaDeLaVisita,
} from "../src/domain/fechaDeVisita.js";

/** El día calendario en Quito de una fecha, «2026-10-24». */
const diaQuito = (fecha: Date | null | undefined) =>
  fecha ? new Date(fecha.getTime() - 5 * 3_600_000).toISOString().slice(0, 10) : null;

/** «sábado 17-oct 15:29» en Quito → instante UTC. */
const enQuito = (iso: string) => new Date(`${iso}-05:00`);

describe("leerVisita — los seis chats de la auditoría", () => {
  it("29358: «…hoy no fui creo para el próximo sábado», dicho un sábado, es el sábado 24 (no el 31, no hoy)", () => {
    const lectura = leerVisita(
      "Suelo viajar a Quito los sábados pero hoy no fui creo para el próximo sábado",
      enQuito("2026-10-17T15:29:00"),
      { respondiendoAlDia: true },
    );
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-24");
    // La frase que se guarda es la del cliente, no un pedazo («suelo viajar a
    // quito los sabados» fue lo que llegó a la alerta).
    expect(lectura?.text).toContain("próximo sábado");
  });

  it("29029: «Próximo sábado» dicho el sábado a las 07:27 es el 24, no ese mismo día", () => {
    const lectura = leerVisita("Próximo sábado", enQuito("2026-10-17T07:27:00"), { respondiendoAlDia: true });
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-24");
  });

  it("26916: «El fin de semana estoy x quito ahora estoy de viaje» (miércoles) es el sábado 17, no hoy", () => {
    const lectura = leerVisita(
      "El fin de semana estoy x quito ahora estoy de viaje",
      enQuito("2026-10-14T07:21:00"),
      { respondiendoAlDia: true },
    );
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-17");
  });

  it("27485: una fecha leída de la FOTO de un anuncio no agenda nada («6 1/2\"» no es el 1 de febrero)", () => {
    const lectura = leerVisita(
      "[El cliente mandó una foto. Se lee: R15, 4H-100 y 114mm, 6 1/2\", $180, 3 aros llanta callantera]",
      enQuito("2026-10-14T15:39:00"),
      { respondiendoAlDia: true },
    );
    expect(lectura).toBeNull();
  });

  it("30131: «Mañana le paso el dato completo» es mandar información, no una visita", () => {
    const ahora = enQuito("2026-10-19T17:45:00");
    expect(leerVisita("Mañana le paso el dato completo", ahora)).toBeNull();
    expect(leerVisita("Mañana le paso el dato completo", ahora, { respondiendoAlDia: true })).toBeNull();
  });

  it("los otros verbos de mandar información tampoco agendan", () => {
    const ahora = enQuito("2026-10-19T10:00:00");
    for (const frase of [
      "El lunes le mando la medida",
      "mañana le envío la foto de la llanta",
      "Mañana le paso ya q no estoy con el carro",
      "en la tarde le comparto los datos",
    ]) {
      expect(leerVisita(frase, ahora, { respondiendoAlDia: true }), frase).toBeNull();
    }
  });
});

describe("leerVisita — lo que funcionaba sigue igual", () => {
  it("27379: «voy mañana» un miércoles es el jueves 15", () => {
    const lectura = leerVisita("voy mañana", enQuito("2026-10-14T14:58:00"), { respondiendoAlDia: true });
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-15");
  });

  it("6145: «Mañana» a «¿qué día puede pasar?» un viernes es el sábado 17", () => {
    const lectura = leerVisita("Mañana", enQuito("2026-10-16T10:21:00"), { respondiendoAlDia: true });
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-17");
  });

  it("28845: «Sábado» dicho el sábado después del cierre (19:22) es el de la otra semana", () => {
    const lectura = leerVisita("Sábado", enQuito("2026-10-17T19:22:00"), { respondiendoAlDia: true });
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-24");
  });

  it("«me paso por ahí mañana» (con «me») sí es visita: el reflexivo no es mandar un dato", () => {
    const lectura = leerVisita("me paso por ahí mañana", enQuito("2026-10-19T10:00:00"));
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-20");
  });

  it("un audio en el que el cliente DICE que viene sí agenda (la foto no, el audio sí)", () => {
    const lectura = leerVisita(
      "[El cliente mandó un audio. Dice: Buenos días, mañana paso por el local de Cumbayá]",
      enQuito("2026-10-19T09:00:00"),
    );
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-20");
  });

  it("la leyenda que el cliente ESCRIBIÓ junto a la foto sí cuenta", () => {
    const lectura = leerVisita(
      "[El cliente mandó una foto. Se lee: 205/55R16 KENDA]\nvoy el sábado",
      enQuito("2026-10-14T10:00:00"),
    );
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-17");
  });
});

describe("leerVisita — el mismo día de la semana y la semana que viene", () => {
  it("«el sábado» dicho el sábado temprano es hoy; a media mañana ya es el de la otra semana (regla que se conserva)", () => {
    expect(diaQuito(leerVisita("El sábado", enQuito("2026-10-17T08:40:00"), { respondiendoAlDia: true })?.visitDate)).toBe("2026-10-17");
    expect(diaQuito(leerVisita("El sábado", enQuito("2026-10-17T11:00:00"), { respondiendoAlDia: true })?.visitDate)).toBe("2026-10-24");
  });

  it("2301: «el otro sábado» dicho un sábado es el de la otra semana", () => {
    const lectura = leerVisita("el otro sábado paso", enQuito("2026-10-17T12:20:00"));
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-24");
  });

  it("27279: «Miércoles dela otra semana» dicho un miércoles es el 21", () => {
    const lectura = leerVisita("Miércoles dela otra semana Puedo", enQuito("2026-10-14T13:08:00"), { respondiendoAlDia: true });
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-21");
  });

  it("«el viernes de la próxima semana» dicho un miércoles es el viernes 23, no el 16", () => {
    const lectura = leerVisita("Voy el viernes de la próxima semana", enQuito("2026-10-14T10:00:00"));
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-23");
  });

  it("«el próximo viernes» dicho un miércoles es el que viene, el 16", () => {
    const lectura = leerVisita("paso el próximo viernes", enQuito("2026-10-14T10:00:00"));
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-16");
  });
});

describe("la semana es del día que la lleva, y la negación va primero (revisión final, 21-oct)", () => {
  const miercoles = enQuito("2026-10-21T10:00:00");

  it("«no puedo el sábado, voy el próximo domingo» es el domingo 25", () => {
    expect(diaQuito(leerVisita("no puedo el sábado, voy el próximo domingo", miercoles)?.visitDate)).toBe("2026-10-25");
  });

  it("«el próximo sábado no puedo, voy el domingo» es el domingo 25", () => {
    expect(diaQuito(leerVisita("el próximo sábado no puedo, voy el domingo", miercoles)?.visitDate)).toBe("2026-10-25");
  });

  it("y 29358 sigue siendo el sábado 24", () => {
    const lectura = leerVisita(
      "Suelo viajar a Quito los sábados pero hoy no fui creo para el próximo sábado",
      enQuito("2026-10-17T15:29:00"),
      { respondiendoAlDia: true },
    );
    expect(diaQuito(lectura?.visitDate)).toBe("2026-10-24");
  });

  it("«no puedo el próximo sábado, mejor el lunes» es el lunes 26", () => {
    expect(diaQuito(leerVisita("no puedo el próximo sábado, mejor paso el lunes", miercoles)?.visitDate)).toBe("2026-10-26");
  });
});

describe("fechaParaAgendar — la herramienta lee lo mismo que el pipeline", () => {
  it("29358: el modelo mandó «sábado 31 de octubre», pero el cliente dijo «el próximo sábado»: gana el cliente (24)", () => {
    const r = fechaParaAgendar({
      dia: "sábado 31 de octubre",
      textoDelCliente: "Suelo viajar a Quito los sábados pero hoy no fui creo para el próximo sábado",
      ahora: enQuito("2026-10-17T15:30:00"),
      respondiendoAlDia: true,
    });
    expect(r.noEsVisita).toBeUndefined();
    expect(diaQuito(r.fecha)).toBe("2026-10-24");
    // La frase original queda guardada junto a la fecha: es el hecho auditable.
    expect(r.texto).toContain("próximo sábado");
  });

  it("30131: «Mañana le paso el dato completo» no se agenda aunque el modelo mande «mañana»", () => {
    const r = fechaParaAgendar({
      dia: "mañana",
      textoDelCliente: "Mañana le paso el dato completo",
      ahora: enQuito("2026-10-19T17:45:00"),
    });
    expect(r.noEsVisita).toBe("envia_informacion");
    expect(r.fecha).toBeNull();
  });

  it("27485: lo que salió de una foto no se agenda", () => {
    const r = fechaParaAgendar({
      dia: "2027-02-01",
      textoDelCliente: "[El cliente mandó una foto. Se lee: R15, 4H-100 y 114mm, 6 1/2\", $180, 3 aros llanta callantera]",
      ahora: enQuito("2026-10-14T15:40:00"),
    });
    expect(r.noEsVisita).toBe("texto_de_una_foto");
  });

  it("sin la pregunta del día, la cantidad no es el día del mes: «… voy el sábado» es el sábado", () => {
    // Con `respondiendoAlDia: true` fijo, «Quiero el 4» se leía como el 4 de
    // noviembre y «las del 2» como el 2 (comprobado con el código anterior).
    for (const frase of ["Las 4 por favor, voy el sábado", "Quiero el 4, voy el sábado", "Deme las del 2, paso el sábado"]) {
      const r = fechaParaAgendar({
        dia: "sábado",
        textoDelCliente: frase,
        ahora: enQuito("2026-10-14T10:00:00"),
        respondiendoAlDia: false,
      });
      expect(diaQuito(r.fecha), frase).toBe("2026-10-17");
    }
  });

  it("«le paso a recoger el sábado» y «paso a retirar el lunes» siguen siendo visita", () => {
    const ahora = enQuito("2026-10-14T10:00:00");
    const recoger = fechaParaAgendar({ dia: "sábado", textoDelCliente: "le paso a recoger el sábado", ahora });
    expect(recoger.noEsVisita).toBeUndefined();
    expect(diaQuito(recoger.fecha)).toBe("2026-10-17");
    expect(diaQuito(leerVisita("le paso a recoger el sábado", ahora)?.visitDate)).toBe("2026-10-17");
    expect(diaQuito(leerVisita("paso a retirar el lunes", ahora)?.visitDate)).toBe("2026-10-19");
  });

  it("si el cliente solo dijo «sí» al día que propuso el bot, vale el día que entendió el modelo", () => {
    const r = fechaParaAgendar({ dia: "jueves", textoDelCliente: "Sí, perfecto", ahora: enQuito("2026-10-14T10:00:00") });
    expect(diaQuito(r.fecha)).toBe("2026-10-15");
  });

  it("y el «próximo» del modelo sigue la misma regla: «próximo sábado» un sábado es +7", () => {
    const r = fechaParaAgendar({ dia: "próximo sábado", textoDelCliente: "Ok", ahora: enQuito("2026-10-17T09:00:00") });
    expect(diaQuito(r.fecha)).toBe("2026-10-24");
  });
});

describe("¿ya pasó la visita? Se compara el DÍA en Quito, no el instante", () => {
  // 6145: visita registrada el sábado 17 a las 10:00 (relleno), seguimiento a las 12:37.
  const visita = enQuito("2026-10-17T10:00:00");

  it("a las 12:37 del mismo día todavía no pasó: es hoy", () => {
    const ahora = enQuito("2026-10-17T12:37:00");
    expect(yaPasoElDiaDeLaVisita(visita, ahora)).toBe(false);
    expect(esElDiaDeLaVisita(visita, ahora)).toBe(true);
  });

  it("a las 23:59 tampoco; al día siguiente sí", () => {
    expect(yaPasoElDiaDeLaVisita(visita, enQuito("2026-10-17T23:59:00"))).toBe(false);
    expect(yaPasoElDiaDeLaVisita(visita, enQuito("2026-10-18T00:01:00"))).toBe(true);
  });

  it("la víspera no es el día", () => {
    expect(esElDiaDeLaVisita(visita, enQuito("2026-10-16T13:31:00"))).toBe(false);
    expect(yaPasoElDiaDeLaVisita(visita, enQuito("2026-10-16T13:31:00"))).toBe(false);
  });
});
