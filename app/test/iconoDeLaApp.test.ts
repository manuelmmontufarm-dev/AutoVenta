import express from "express";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { manifiestoDeLaApp, montarIconoDeLaApp, paginaConNombre, svgDelIcono } from "../src/server/iconoDeLaApp.js";

describe("ícono y nombre de la app del teléfono por cliente", () => {
  it("el ícono lleva el nombre del cliente debajo del AV", () => {
    expect(svgDelIcono("Competimotor")).toContain(">COMPETIMOTOR</text>");
    expect(svgDelIcono("Depot Tire")).toContain(">DEPOT TIRE</text>");
  });

  it("el nombre bajo el ícono del teléfono es el del cliente", () => {
    expect(manifiestoDeLaApp("Competimotor")).toMatchObject({ name: "Competimotor", short_name: "Competimotor" });
    const html = '<meta name="apple-mobile-web-app-title" content="AutoVenta" />\n<title>AutoVenta · Hub</title>';
    const out = paginaConNombre(html, "Depot Tire");
    expect(out).toContain('content="Depot Tire"');
    expect(out).toContain("<title>Depot Tire · Hub</title>");
  });

  it("el servidor entrega manifiesto, página e íconos del cliente", async () => {
    const site = mkdtempSync(path.join(tmpdir(), "site-"));
    mkdirSync(path.join(site, "admin"));
    writeFileSync(path.join(site, "admin", "index.html"), '<meta name="apple-mobile-web-app-title" content="AutoVenta" /><title>AutoVenta · Hub</title>');
    const app = express();
    montarIconoDeLaApp(app, site, "Competimotor");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const man = await (await fetch(`${base}/admin/manifest.webmanifest`)).json();
      expect(man.short_name).toBe("Competimotor");
      expect(await (await fetch(`${base}/admin/`)).text()).toContain('content="Competimotor"');
      const png = await fetch(`${base}/admin/apple-touch-icon.png`);
      expect(png.headers.get("content-type")).toContain("image/png");
      expect((await png.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    } finally {
      server.close();
    }
  });
});
