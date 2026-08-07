/**
 * El harness de evaluación, probado con datos.
 *
 * Existe por una razón concreta: la corrida `--dry` prueba el TRANSPORTE de
 * punta a punta, pero solo ejercita la MEDICIÓN si el bot llega a llamar tools
 * ese día. Cuando no las llama, `cotizacion_duplicada` y `opciones_reenviadas`
 * salen 0 → 0 y ese cero se lee como "no encontró la falla" cuando en realidad
 * significa "el detector no se ejecutó". Aquí se ejecutan siempre, con las
 * filas exactas que `replay.mjs` saca de la tabla `messages`.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  coberturaDeDetectores,
  detectar,
  fusionarSalidas,
  salidasDeTurno,
} from "../scripts/eval/lib/medicion.mjs";
import { verificarSincronia } from "../scripts/eval/lib/detectores.mjs";
import { Checkpoint, exigirLocal, identificadorPg } from "../scripts/eval/lib/comun.mjs";

/** Una fila de `messages` tal como la devuelve la consulta `deTools` del replay. */
const mensajeDeTool = (over: Record<string, unknown> = {}) => ({
  content: "",
  type: "text",
  metadata: null,
  cycle: 1,
  created_at: "2026-08-05T09:00:00.000Z",
  ...over,
});

const temporales: string[] = [];
afterEach(() => {
  for (const d of temporales.splice(0)) rmSync(d, { recursive: true, force: true });
});
function carpeta(): string {
  const d = mkdtempSync(join(tmpdir(), "eval-harness-"));
  temporales.push(d);
  return d;
}

describe("harness de evaluación · medición", () => {
  it("conserva la marca de tiempo de cada mensaje, no la del turno", () => {
    const salidas = fusionarSalidas(
      [mensajeDeTool({ content: "Cotización COT-AAA enviada por $380.28", created_at: new Date("2026-08-05T09:20:00.000Z") })],
      { texto: "Aquí está su cotización 👆", ciclo: 1, cuando: "2026-08-05T09:20:03.000Z" },
    );
    expect(salidas.map((s) => s.cuando)).toEqual([
      "2026-08-05T09:20:00.000Z",
      "2026-08-05T09:20:03.000Z",
    ]);

    // Y al leerlas, la marca del turno solo rellena lo que falta.
    const leidas = salidasDeTurno(
      { salidas_nuevas: salidas, cuando: "2026-08-05T09:00:00.000Z" },
      "nuevas",
    );
    expect(leidas[0].cuando).toBe("2026-08-05T09:20:00.000Z");
  });

  it("ve la cotización duplicada que escribieron las tools", () => {
    const items = [
      {
        conversacion: 1131,
        cliente: "Byron Lema",
        indiceTurno: 0,
        medida_conocida: "205/55R16",
        cuando: "2026-08-05T09:00:00.000Z",
        salidas_nuevas: fusionarSalidas(
          [mensajeDeTool({
            content: "Cotización COT-AAA111 enviada por $380.28",
            type: "image",
            metadata: { piece: "quote", quoteNumber: "COT-AAA111" },
            created_at: "2026-08-05T09:00:10.000Z",
          })],
          { texto: "Aquí está su cotización *COT-AAA111* 👆", ciclo: 1, cuando: "2026-08-05T09:00:12.000Z" },
        ),
      },
      {
        conversacion: 1131,
        cliente: "Byron Lema",
        indiceTurno: 1,
        medida_conocida: "205/55R16",
        cuando: "2026-08-05T09:03:00.000Z",
        salidas_nuevas: fusionarSalidas(
          [mensajeDeTool({
            content: "Cotización COT-BBB222 enviada por $380.28",
            type: "image",
            metadata: { piece: "quote", quoteNumber: "COT-BBB222" },
            created_at: "2026-08-05T09:03:10.000Z",
          })],
          { texto: "Aquí está su cotización *COT-BBB222* 👆", ciclo: 1, cuando: "2026-08-05T09:03:12.000Z" },
        ),
      },
    ];
    const { hallazgos } = detectar(items, "nuevas");
    const dup = hallazgos.filter((h) => h.detector === "cotizacion_duplicada");
    expect(dup).toHaveLength(1);
    expect(dup[0]).toMatchObject({ previa: "COT-AAA111", duplicada: "COT-BBB222" });
  });

  it("no llama duplicada a una recotización de media hora después", () => {
    const items = [
      {
        conversacion: 7, cliente: "X", indiceTurno: 0, medida_conocida: "205/55R16",
        cuando: "2026-08-05T09:00:00.000Z",
        salidas_nuevas: [{ texto: "Cotización COT-AAA111 enviada por $380.28", tipo: "text", ciclo: 1, cuando: "2026-08-05T09:00:10.000Z" }],
      },
      {
        conversacion: 7, cliente: "X", indiceTurno: 1, medida_conocida: "205/55R16",
        cuando: "2026-08-05T09:40:00.000Z",
        salidas_nuevas: [{ texto: "Cotización COT-BBB222 enviada por $380.28", tipo: "text", ciclo: 1, cuando: "2026-08-05T09:40:10.000Z" }],
      },
    ];
    expect(detectar(items, "nuevas").hallazgos.filter((h) => h.detector === "cotizacion_duplicada")).toHaveLength(0);
  });

  it("ve la pieza de opciones reenviada dentro del mismo ciclo", () => {
    const pieza = (cuando: string, medida: string) => mensajeDeTool({
      content: `Opciones enviadas: MICHELIN PRIMACY 4 · BRIDGESTONE TURANZA T005`,
      type: "image",
      metadata: { piece: "options", sizeLabel: medida },
      cycle: 1,
      created_at: cuando,
    });
    const items = [
      {
        conversacion: 1103, cliente: "Silvia", indiceTurno: 0, medida_conocida: "195/65R15",
        cuando: "2026-08-04T15:00:00.000Z",
        salidas_nuevas: fusionarSalidas([pieza("2026-08-04T15:00:05.000Z", "195/65R15")], null),
      },
      {
        conversacion: 1103, cliente: "Silvia", indiceTurno: 1, medida_conocida: "195/65R15",
        cuando: "2026-08-04T15:04:00.000Z",
        salidas_nuevas: fusionarSalidas([pieza("2026-08-04T15:04:05.000Z", "205/55R16")], null),
      },
    ];
    const hallazgos = detectar(items, "nuevas").hallazgos;
    expect(hallazgos.filter((h) => h.detector === "opciones_reenviadas")).toHaveLength(1);
  });

  it("reconoce la pieza aunque el render haya fallado (metadata, no texto)", () => {
    const rota = mensajeDeTool({
      content: "Imagen de opciones NO enviada (MICHELIN PRIMACY 4)",
      type: "image",
      metadata: JSON.stringify({ piece: "options", renderError: "render: boom" }),
    });
    const [salida] = salidasDeTurno(
      { salidas_nuevas: fusionarSalidas([rota], null), cuando: "2026-08-05T09:00:00.000Z" },
      "nuevas",
    );
    expect(salida.esPiezaOpciones).toBe(true);
  });

  it("declara qué detectores se quedaron sin material que mirar", () => {
    const sinNada = coberturaDeDetectores([
      { conversacion: 1, cliente: "X", indiceTurno: 0, cuando: "2026-08-05T09:00:00.000Z", salidas_nuevas: [{ texto: "hola", tipo: "text" }], salidas_viejas: [] },
    ]);
    expect(sinNada.sinEjercitar).toEqual(["cotizacion_duplicada", "opciones_reenviadas"]);
  });
});

describe("harness de evaluación · candados", () => {
  it("los detectores siguen en sincronía con scripts/auditoria/extraer.mjs", () => {
    // Cubre las expresiones Y los umbrales (0.6 de similitud, ventana de 10 min,
    // palabras de más de 3 letras): un detector es su regex y su número de corte.
    expect(verificarSincronia()).toEqual([]);
  });

  it("rechaza un --db que no sea un identificador de Postgres", () => {
    expect(() => identificadorPg("autoventa_eval", "--db")).not.toThrow();
    expect(() => identificadorPg("x; drop database autoventa", "--db")).toThrow(/--db/);
    expect(() => identificadorPg("1mala", "--db")).toThrow();
  });

  it("rechaza una URL de administración que no sea local", () => {
    expect(() => exigirLocal("postgresql://u@localhost/postgres", "--admin")).not.toThrow();
    expect(() => exigirLocal("postgresql://u@db.prod.example.com/postgres", "--admin")).toThrow(/localhost/);
  });

  it("el checkpoint se niega a mezclar dos corridas distintas", () => {
    const archivo = join(carpeta(), "replay.jsonl");
    const llave = (r: { conversacion: number; indiceTurno: number }) => `${r.conversacion}#${r.indiceTurno}`;

    const autonomo = new Checkpoint(archivo, llave, { firma: { modo: "autonomo" } });
    autonomo.limpiar();
    autonomo.anotar({ conversacion: 1, indiceTurno: 0, respuesta_nueva: "de autónomo" });

    const fiel = new Checkpoint(archivo, llave, { firma: { modo: "fiel" } });
    const { ok, motivo } = fiel.cargar();
    expect(ok).toBe(false);
    expect(motivo).toMatch(/otros parámetros/);
  });

  it("--retomar vuelve a pedir los juicios que fallaron, y no los cuenta dos veces", () => {
    const archivo = join(carpeta(), "juez.jsonl");
    const llave = (r: { conversacion: number; indiceTurno: number }) => `${r.conversacion}#${r.indiceTurno}`;
    const firma = { prompt: "abc", modelo: "gpt-5.5" };

    const primera = new Checkpoint(archivo, llave, { firma, valida: (r: { error?: string }) => !r.error });
    primera.limpiar();
    primera.anotar({ conversacion: 1, indiceTurno: 0, veredicto: "mejor" });
    primera.anotar({ conversacion: 2, indiceTurno: 0, error: "OpenAI 429: rate limit" });

    const segunda = new Checkpoint(archivo, llave, { firma, valida: (r: { error?: string }) => !r.error });
    expect(segunda.cargar().ok).toBe(true);
    expect(segunda.reintentables).toBe(1);
    expect(segunda.ya("1#0")).toBe(true);
    expect(segunda.ya("2#0")).toBe(false);

    segunda.anotar({ conversacion: 2, indiceTurno: 0, veredicto: "igual" });
    const finales = segunda.finales();
    expect(finales).toHaveLength(2);
    expect(finales.filter((r: { error?: string }) => r.error)).toHaveLength(0);
  });

  it("tolera la última línea a medio escribir de un proceso que murió", () => {
    const archivo = join(carpeta(), "roto.jsonl");
    writeFileSync(archivo, `${JSON.stringify({ __firma: { modo: "fiel" } })}\n`
      + `${JSON.stringify({ conversacion: 1, indiceTurno: 0 })}\n`
      + `{"conversacion":2,"indiceT`);
    const cp = new Checkpoint(archivo, (r: { conversacion: number; indiceTurno: number }) => `${r.conversacion}#${r.indiceTurno}`, {
      firma: { modo: "fiel" },
    });
    expect(cp.cargar().ok).toBe(true);
    expect(cp.filas).toHaveLength(1);
  });
});

describe("harness de evaluación · WhatsApp neutralizado", () => {
  it("cada conversación cuenta SUS piezas aunque corran en paralelo", async () => {
    const wa = await import("../scripts/eval/lib/wa-stub.mjs");

    // El patrón exacto de replay.mjs: reset por turno, lectura al final del
    // turno, tres conversaciones a la vez.
    const conversacion = (id: number, cuantas: number) => wa._eval_enContexto(async () => {
      const recogidas: number[] = [];
      for (let turno = 0; turno < 2; turno += 1) {
        wa._eval_reset();
        await Promise.all(Array.from({ length: cuantas }, (_, i) =>
          wa.sendImage(id, `59390000${id}`, Buffer.from("x"), `c${id}`, `f${id}-${turno}-${i}.png`)));
        await new Promise((r) => setTimeout(r, 5));
        recogidas.push(wa._eval_enviados().length);
      }
      return recogidas;
    });

    const [a, b, c] = await Promise.all([conversacion(1, 3), conversacion(2, 5), conversacion(3, 1)]);
    expect(a.piezas).toHaveLength(3);
    expect(b.piezas).toHaveLength(5);
    expect(c.piezas).toHaveLength(1);
    expect(a.resultado).toEqual([3, 3]);
    expect(b.resultado).toEqual([5, 5]);
    expect(c.resultado).toEqual([1, 1]);
    // Y ninguna se llevó piezas de otra.
    expect(a.piezas.every((p: { conversationId: number }) => p.conversationId === 1)).toBe(true);
    expect(b.piezas.every((p: { conversationId: number }) => p.conversationId === 2)).toBe(true);
  });

  it("espeja toda la superficie pública de src/wa/client.ts", async () => {
    const stub = await import("../scripts/eval/lib/wa-stub.mjs");
    const fuente = readFileSync(new URL("../src/wa/client.ts", import.meta.url), "utf8");
    const exportadas = [...fuente.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]);
    expect(exportadas.length).toBeGreaterThan(0);
    for (const nombre of exportadas) {
      expect(typeof (stub as Record<string, unknown>)[nombre]).toBe("function");
    }
  });

  it("downloadMedia devuelve null: las fotos viejas de Meta ya caducaron", async () => {
    const stub = await import("../scripts/eval/lib/wa-stub.mjs");
    await expect(stub.downloadMedia("media-viejo")).resolves.toBeNull();
  });
});
