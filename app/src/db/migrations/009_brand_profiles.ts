import type { Sql } from "../client.js";

export const BRAND_PROFILES_MIGRATION_ID = "009_brand_profiles";

/**
 * Posicionamiento comercial por marca — la etiqueta ("MEJOR EQUILIBRIO") y la
 * frase que la comparativa y las opciones muestran bajo el logotipo.
 *
 * Vive en tabla para que Depot Tire pueda corregir su propio argumento de venta
 * sin desarrollador, y para que el bot lo cite en el chat sin inventárselo. Los
 * valores sembrados son los del diseño aprobado.
 */
export async function runBrandProfilesMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create table if not exists brand_profiles (
        brand           text primary key,
        tag             text not null default '',
        posicionamiento text not null default '',
        -- Lo que el bot puede AFIRMAR de la marca en el chat. Sin fuente, no
        -- se afirma: el §5 del PDF prohíbe ventajas no demostrables.
        notas_ia        text not null default '',
        fuente          text,
        active          boolean not null default true,
        position        integer not null default 0,
        updated_at      timestamptz not null default now()
      );

      insert into schema_migrations (id)
      values ('009_brand_profiles')
      on conflict (id) do nothing;
    `);

    // Siembra única: si el negocio los edita o los borra, un redeploy no debe
    // resucitarlos.
    const [seeded] = await tx<{ key: string }[]>`
      insert into settings (key, value)
      values ('brand_profiles_seeded_v1', 'true'::jsonb)
      on conflict (key) do nothing
      returning key
    `;
    if (!seeded) return;

    const defaults = [
      {
        brand: "FALKEN",
        tag: "MÁXIMO DESEMPEÑO",
        posicionamiento:
          "Premium: desempeño, respaldo y durabilidad. Equipo original de Ford Raptor y Jeep Gladiator.",
        notas_ia:
          "Gama premium. Es equipo original de Ford Raptor, Bronco Raptor y Jeep Gladiator — dato verificable, se puede mencionar.",
        fuente: "https://www.falkentyre.com",
      },
      {
        brand: "KENDA",
        tag: "MEJOR EQUILIBRIO",
        posicionamiento: "Buena calidad, buen desempeño, buen precio. La compra sensata.",
        notas_ia:
          "El punto medio del catálogo. Se recomienda cuando el cliente busca relación calidad-precio sin resignar respaldo.",
        fuente: "https://automotive.kendatire.com",
      },
      {
        brand: "WINRUN",
        tag: "MEJOR PRECIO",
        posicionamiento: "Cuida el presupuesto sin bajar de los mínimos técnicos.",
        notas_ia:
          "Opción accesible. Cumple los mínimos técnicos; no se presenta como premium ni se le atribuyen ventajas de desempeño.",
        fuente: null,
      },
    ];
    for (const [index, d] of defaults.entries()) {
      await tx`
        insert into brand_profiles (brand, tag, posicionamiento, notas_ia, fuente, position)
        values (${d.brand}, ${d.tag}, ${d.posicionamiento}, ${d.notas_ia}, ${d.fuente}, ${index})
        on conflict (brand) do nothing
      `;
    }
  });
}
