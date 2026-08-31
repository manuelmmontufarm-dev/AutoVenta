import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_etapas_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let migracion: typeof import("../src/db/migrations/014_vender_en_toda_etapa.js");
let migracionCumplir: typeof import("../src/db/migrations/016_cumplir_solicitud_y_cierre.js");
let migracionAsesor: typeof import("../src/db/migrations/020_asesor_en_toda_etapa.js");

/** Lo que la etapa tenía ANTES del arreglo — el estado real de staging y Depot. */
const ANTES_SEGUIMIENTO = ["fitment_vehiculo", "local_mas_cercano", "notificar_vendedor"];
const ANTES_COTIZACION = [
  "fitment_vehiculo",
  "local_mas_cercano",
  "notificar_vendedor",
  "generar_cotizacion",
];

async function toolsDe(stage: string): Promise<string[]> {
  const [fila] = await appSql<{ allowed_tools: string[] }[]>`
    select allowed_tools from stage_prompt_versions
    where stage = ${stage} and status = 'published'
    order by version desc limit 1
  `;
  return fila?.allowed_tools ?? [];
}

describe.sequential("El bot puede vender en las etapas de cierre (ticket 2150)", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);

    process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.SELLER_PHONE = "593000000000";
    process.env.OPENAI_API_KEY = "test";

    const db = await import("../src/db/client.js");
    appSql = db.sql;
    const schema = await import("../src/db/schema.js");
    await schema.ensureSchema();
    // ensureSchema NO siembra las etapas: eso pasa perezosamente en la primera
    // lectura. Es justo el orden de producción — la migración corre antes de que
    // exista fila alguna, y en una base nueva es un no-op inofensivo.
    const settings = await import("../src/services/settings.js");
    await settings.ensureDefaultStagePrompts();
    migracion = await import("../src/db/migrations/014_vender_en_toda_etapa.js");
    migracionCumplir = await import("../src/db/migrations/016_cumplir_solicitud_y_cierre.js");
    migracionAsesor = await import("../src/db/migrations/020_asesor_en_toda_etapa.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("una instalación nueva ya nace pudiendo mostrar opciones en seguimiento", async () => {
    const tools = await toolsDe("seguimiento_venta");
    // Esto es exactamente lo que le faltó al ticket 2150.
    expect(tools).toContain("buscar_por_aro_y_tipo");
    expect(tools).toContain("preparar_opciones");
    expect(tools).toContain("opciones_sin_medida");
    // Y no perdió lo suyo.
    for (const previa of ANTES_SEGUIMIENTO) expect(tools).toContain(previa);
  });

  it("toda etapa abierta puede avisar al asesor", async () => {
    for (const stage of ["nuevo", "medida_confirmada", "seleccionando", "cotizacion_enviada", "seguimiento_venta"]) {
      expect(await toolsDe(stage)).toContain("notificar_vendedor");
    }
    expect(await toolsDe("ganado")).not.toContain("notificar_vendedor");
    expect(await toolsDe("perdido")).not.toContain("notificar_vendedor");
  });

  it("agrega el aviso a una base existente sin pisar sus herramientas", async () => {
    await appSql`
      update stage_prompt_versions
      set allowed_tools=${appSql.json(["buscar_llanta"] as never)}
      where stage='medida_confirmada' and status='published'
    `;
    await migracionAsesor.runAsesorEnTodaEtapaMigration(appSql);
    expect(await toolsDe("medida_confirmada")).toEqual(["buscar_llanta", "notificar_vendedor"]);
  });

  it("con la cotización enviada también puede volver a mostrar opciones", async () => {
    const tools = await toolsDe("cotizacion_enviada");
    expect(tools).toContain("preparar_opciones");
    expect(tools).toContain("opciones_sin_medida");
    expect(tools).toContain("buscar_llanta");
    for (const previa of ANTES_COTIZACION) expect(tools).toContain(previa);
  });

  it("arregla una base que YA venía corriendo con las etapas mancas", async () => {
    // Staging y Depot no se crean de cero: tienen filas publicadas con la lista
    // vieja. Si la migración solo sirviera para instalaciones nuevas, el bot de
    // Depot seguiría mudo.
    await appSql`
      update stage_prompt_versions
      set allowed_tools = ${appSql.json(ANTES_SEGUIMIENTO as never)}
      where stage = 'seguimiento_venta' and status = 'published'
    `;
    expect(await toolsDe("seguimiento_venta")).toEqual(ANTES_SEGUIMIENTO);

    await migracion.runVenderEnTodaEtapaMigration(appSql);

    const tools = await toolsDe("seguimiento_venta");
    expect(tools).toContain("preparar_opciones");
    expect(tools).toContain("opciones_sin_medida");
    expect(tools).toContain("generar_cotizacion");
  });

  it("no le quita a un negocio una herramienta que él agregó a mano", async () => {
    // El dueño puede editar sus etapas desde el panel. La migración UNE, no pisa.
    await appSql`
      update stage_prompt_versions
      set allowed_tools = ${appSql.json([...ANTES_SEGUIMIENTO, "tipos_de_llanta"] as never)}
      where stage = 'seguimiento_venta' and status = 'published'
    `;

    await migracion.runVenderEnTodaEtapaMigration(appSql);

    const tools = await toolsDe("seguimiento_venta");
    expect(tools).toContain("tipos_de_llanta");
    expect(tools).toContain("preparar_opciones");
  });

  it("correrla dos veces no duplica herramientas", async () => {
    await migracion.runVenderEnTodaEtapaMigration(appSql);
    const tools = await toolsDe("seguimiento_venta");
    expect(tools.length).toBe(new Set(tools).size);
  });

  it("una base existente recibe capacidades sin que la migración reescriba su prompt", async () => {
    await appSql`
      update stage_prompt_versions
      set allowed_tools=${appSql.json(ANTES_COTIZACION as never)}, prompt='prompt anterior'
      where stage='cotizacion_enviada' and status='published'
    `;
    await migracionCumplir.runCumplirSolicitudMigration(appSql);
    const tools = await toolsDe("cotizacion_enviada");
    expect(tools).toContain("reenviar_cotizacion");
    expect(tools).toContain("enviar_comparacion");
    const [row] = await appSql<{ prompt: string }[]>`
      select prompt from stage_prompt_versions
      where stage='cotizacion_enviada' and status='published'
    `;
    expect(row.prompt).toBe("prompt anterior");
  });
});
