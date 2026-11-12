# Limpiarte · MAFARA S.A.

Sitio institucional en HTML, CSS y JavaScript, con cotizador y administración de solicitudes preparados para Vercel + Supabase. Se mantiene el diseño y la paleta aprobados: #F36E22 y #024DA2; WhatsApp #4BCA59.

## Estado de esta rama

La Fase 1 está en desarrollo para revisión. No está conectada a una base exclusiva de Limpiarte ni fue desplegada a producción. Las tarifas están desactivadas hasta su aprobación comercial. El panel requiere autenticación y doble factor; no tiene acceso público de prueba.

## Ejecutar y verificar

Requiere Node.js 24.

```sh
npm ci
npm test
npm run build
npm run dev
```

Sin variables de entorno, el sitio se ve y los módulos de cotización/administración quedan cerrados. `.env.example` enumera las variables; el servidor no carga archivos `.env` automáticamente: configurarlas en el proceso o en Vercel. Nunca subir valores reales al repositorio.

Para una prueba local descartable del cotizador: `npm run dev:fixture`, con `http://127.0.0.1:4173`. Usa datos en memoria y no permite probar autenticación ni persistencia real. No habilitar ese modo en un despliegue.

## Rutas

- `/`: página de servicios actual.
- `/quienes-somos.html`: presentación institucional.
- `/productos.html`: catálogo existente.
- `/cotizador.html`: estimación y solicitud con continuidad por WhatsApp.
- `/admin/`: tarifas y solicitudes del cotizador, con acceso restringido.
- `/privacidad.html`: aviso del cotizador pendiente de aprobación de Limpiarte.

## Preparación de Vercel

`vercel.json` usa `npm ci`, `npm run build` y salida pública `dist/`. La API `/api/cotizador` se ejecuta en el servidor Node.js. El frontend no contiene credenciales privadas. Usar una base propia por ambiente y el origen exacto en `APP_ORIGIN`.

Los detalles de migración, roles, MFA, configuración, pruebas, límites y pendientes están en [docs/COTIZADOR_FASE1.md](docs/COTIZADOR_FASE1.md). Revisarlos antes de habilitar un ambiente. No copiar esta rama completa a `public_html`: un alojamiento solo estático o PHP no ejecutará esta API Node.js.

El catálogo anterior dependía de datos locales del navegador; no se migran automáticamente. La Fase 1 implementa administración de tarifas y solicitudes, sin pagos online ni integración de rutas geográficas.

Repositorio: https://github.com/equantum-py/limpiarte
