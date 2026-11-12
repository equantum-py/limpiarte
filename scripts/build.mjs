import { rm, mkdir, cp, writeFile } from "node:fs/promises";
import { build } from "esbuild";
await rm("dist", { recursive: true, force: true });
await mkdir("dist/admin", { recursive: true });
for (const f of [
  "index.html",
  "quienes-somos.html",
  "productos.html",
  "servicios.css",
  "servicios.js",
  "nosotros.js",
  "app.js",
  "style.css",
  "demo-data.js",
  "cotizador.html",
  "cotizador.css",
  "privacidad.html",
  "presentacion.html",
  "presentacion.css",
])
  await cp(f, "dist/" + f);
await cp("assets", "dist/assets", { recursive: true });
await cp("admin/index.html", "dist/admin/index.html");
await build({
  entryPoints: {
    quote: "client/quote.mjs",
    "admin/app": "client/admin.mjs",
    presentacion: "client/presentation.mjs",
  },
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
});
// Only a public build manifest. Server code, rates, credentials, SQL and tests are never copied.
await writeFile(
  "dist/build.json",
  JSON.stringify({ builtAt: new Date().toISOString() }),
);
console.log("Public files built in dist/");
