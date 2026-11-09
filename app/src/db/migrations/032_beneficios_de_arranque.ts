import type { Sql } from "../client.js";
import { negocio } from "../../negocio/index.js";

export const BENEFICIOS_DE_ARRANQUE_MIGRATION_ID = "032_beneficios_de_arranque";

/**
 * Siembra el INCLUYE que declara el perfil (`beneficiosDeArranque`), UNA vez
 * por base. 008_benefits solo sembraba el de Depot; un cliente nuevo arrancaba
 * con la tabla vacía y el bot no podía afirmar nada de lo que incluye la
 * compra. Mundillantas, 8-nov-2026 (Jenny): con 4 llantas alineación, balanceo,
 * nitrógeno y enllantaje; con menos, todo menos la alineación.
 *
 * Igual que 008: la marca en `settings` hace que un redeploy no resucite lo
 * que el negocio editó o borró desde Ajustes → Promociones.
 */
export async function runBeneficiosDeArranqueMigration(sql: Sql): Promise<void> {
  const beneficios = negocio.beneficiosDeArranque ?? [];
  await sql.begin(async (tx) => {
    // Se registra siempre (también en Depot, que no declara nada): es la
    // ULTIMA_MIGRACION_REGISTRADA de schema.ts.
    await tx`
      insert into schema_migrations (id)
      values (${BENEFICIOS_DE_ARRANQUE_MIGRATION_ID})
      on conflict do nothing
    `;
    if (!beneficios.length) return;
    const llave = `benefits_seeded_${negocio.id}_v1`;
    const [sembrado] = await tx<{ key: string }[]>`
      insert into settings (key, value)
      values (${llave}, 'true'::jsonb)
      on conflict (key) do nothing
      returning key
    `;
    if (!sembrado) return;
    for (const [index, beneficio] of beneficios.entries()) {
      await tx`
        insert into benefits (text, position, active, min_quantity)
        values (${beneficio.text}, ${index}, true, ${beneficio.minQuantity ?? null})
      `;
    }
  });
}
