import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Parte 2: build con base "/admin/" y outDir hacia app/public/admin,
// servido por el mismo Express del bot (PLAN_DESARROLLO §6).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5199,
    strictPort: true,
  },
});
