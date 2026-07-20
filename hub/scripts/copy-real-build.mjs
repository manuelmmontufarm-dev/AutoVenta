import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const demoDir = resolve("../app/site/demo-showroom-gp");
const realDir = resolve("../app/site/admin");

if (!existsSync(demoDir)) {
  throw new Error(`No existe el build del Hub en ${demoDir}`);
}

rmSync(realDir, { recursive: true, force: true });
cpSync(demoDir, realDir, { recursive: true });

console.log(`Producto real copiado a ${realDir}`);
