# Integración de demostración Limpiarte

El formulario se integra en /#cotizador y el módulo interno en /admin/#cotizador-interno. Comparten únicamente datos de ejemplo de localStorage en el mismo navegador y origen (clave limpiarte-presentacion-v1). No requieren Supabase ni envían datos a servidores o WhatsApp. El panel actual continúa siendo una demostración pública sin autenticación: no cargar datos reales. Esta integración no activa el backend de la Fase 1 ni sus migraciones.

Fuentes: demo/client y demo/lib. Los módulos cliente.js e interno.js se compilan con esbuild; no contienen credenciales. No editar los bundles manualmente. El iframe limita el intercambio de altura a su propio origen y ventana.

Reconstrucción de bundles (esbuild 0.28.2):

npx --yes esbuild@0.28.2 demo/client/customer-demo.mjs --bundle --format=esm --target=es2022 --minify --outfile=demo/cliente.js
npx --yes esbuild@0.28.2 demo/client/presentation.mjs --bundle --format=esm --target=es2022 --minify --outfile=demo/interno.js

Revisión: cotización y registro en página principal, aparición en panel y conservación del catálogo existente. El registro se comprobó también por teclado dentro del formulario incrustado.
