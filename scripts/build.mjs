import { rm, mkdir, cp, readFile, writeFile } from "node:fs/promises";
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
await cp("admin/presentacion.html", "dist/admin/presentacion.html");
await build({
  entryPoints: {
    quote: "client/quote.mjs",
    "admin/app": "client/admin.mjs",
    "cliente-presentacion": "client/customer-demo.mjs",
    "admin/presentacion": "client/presentation.mjs",
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

// A portable presentation for meetings: no account, server or network required.
const demoCss =
  (await readFile("cotizador.css", "utf8")) +
  "\n" +
  (await readFile("presentacion.css", "utf8"));
const font = (await readFile("assets/fonts/manrope-regular.ttf")).toString(
  "base64",
);
const logo = (await readFile("assets/logo-limpiarte.png")).toString("base64");
async function portablePage(source, script, output) {
  const demoScript = (await readFile(script, "utf8")).replaceAll(
    "</script",
    "<\\/script",
  );
  const portable = (await readFile(source, "utf8"))
    .replace(/<link[^>]+href="\/(?:cotizador|presentacion)\.css"[^>]*>/g, "")
    .replace(
      /<script type="module" src="[^"]+"><\/script>/,
      () =>
        "<style>" +
        demoCss.replaceAll(
          "/assets/fonts/manrope-regular.ttf",
          "data:font/ttf;base64," + font,
        ) +
        '</style><script type="module">' +
        demoScript +
        "</script>",
    )
    .replaceAll("/assets/logo-limpiarte.png", "data:image/png;base64," + logo)
    .replaceAll('href="/"', 'href="#"')
    .replace(/<a[^>]*id="download-presentation"[\s\S]*?<\/a>/, "")
    .replace(/<a[^>]+href="\/presentacion.html"[^>]*>[\s\S]*?<\/a>/, "");
  await writeFile(output, portable);
}
await portablePage(
  "presentacion.html",
  "dist/cliente-presentacion.js",
  "dist/presentacion-offline.html",
);
await portablePage(
  "admin/presentacion.html",
  "dist/admin/presentacion.js",
  "dist/admin/presentacion-offline.html",
);
