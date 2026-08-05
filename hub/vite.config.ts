import { execSync } from "node:child_process";
import { defineConfig } from "vite";

/** SHA del commit con el que se compila, para el badge de versión del panel. */
function gitSha(): string {
  // Railway expone el SHA por entorno; en local se saca de git. Si ninguno
  // está disponible el badge dice "local", que también es información.
  const env = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
}
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Parte 2: build con base "/admin/" y outDir hacia app/public/admin,
// servido por el mismo Express del bot (PLAN_DESARROLLO §6).
export default defineConfig({
  // Base relativa para servir el bundle desde /demo-showroom-gp/.
  base: "./",
  define: { __GIT_SHA__: JSON.stringify(gitSha()) },
  plugins: [react(), tailwindcss()],
  build: {
    // Express y Vercel sirven app/site. El build debe aterrizar en la ruta
    // pública oficial; compilar solo a hub/dist no actualiza el demo.
    outDir: "../app/site/demo-showroom-gp",
    emptyOutDir: true,
  },
  server: {
    port: 5199,
    strictPort: true,
    proxy: {
      "/api": process.env.AUTOVENTA_DEV_API_URL ?? "http://localhost:3000",
    },
  },
});
