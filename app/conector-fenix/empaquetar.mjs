/**
 * Arma la carpeta que se copia al servidor del cliente:
 *   dist/AutoVenta-Conector/  conector.cjs + los .bat + config.ejemplo.json
 * Falta solo `node.exe` (el «Windows Binary (.exe)» de nodejs.org, versión LTS),
 * que se copia a esa misma carpeta: no hay que instalar nada en la máquina.
 *
 *   npm run conector:empaquetar
 */
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const destino = path.join(aqui, "dist", "AutoVenta-Conector");
rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });

await build({
  entryPoints: [path.join(aqui, "src", "entrada.mjs")],
  outfile: path.join(destino, "conector.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  legalComments: "none",
});
cpSync(path.join(aqui, "windows"), destino, { recursive: true });
cpSync(path.join(aqui, "config.ejemplo.json"), path.join(destino, "config.ejemplo.json"));
console.log(`Listo: ${destino}`);
