import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Parte 2: build con base "/admin/" y outDir hacia app/public/admin,
// servido por el mismo Express del bot (PLAN_DESARROLLO §6).
export default defineConfig({
  // Base relativa para servir el bundle desde /demo-showroom-gp/.
  base: "./",
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
