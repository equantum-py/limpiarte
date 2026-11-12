# Cotizador Limpiarte — Fase 1

Estado: código en rama de desarrollo; no aplicado a ninguna base alojada ni a producción. Mantiene HTML/CSS/JavaScript y el sitio actual. Agrega una API Node.js para Vercel y PostgreSQL/Supabase para persistencia y acceso. No utiliza React ni Next.js.

## Lo implementado

- `/cotizador.html`: catálogo habilitado por el propietario, cálculo por área/unidad/base fija o evaluación manual, complementos, condiciones, impuestos, descuento y redondeo. El importe base fijo no utiliza el campo por unidad.
- El navegador nunca determina precios, descuentos, impuestos, kilómetros ni traslado verificado. La API calcula y firma una estimación de 15 minutos. Registrar exige esa firma y consentimiento. Los campos adicionales de importe se ignoran.
- La solicitud conserva una instantánea de cálculo, contacto opcional, versión tarifaria, estado y vencimiento. Un UUID por operación evita duplicados; reutilizarlo con otro contenido devuelve conflicto. Cambiar tarifas no altera solicitudes anteriores.
- WhatsApp utiliza +595 994 837779 y un mensaje construido con la solicitud guardada. El usuario abre y envía el mensaje; no hay envío automático ni reserva/contratación automática.
- `/admin/` sustituye el acceso público del prototipo por contraseña + TOTP. Cada consulta administrativa valida el usuario con Supabase Auth; PostgreSQL exige `aal2`, membresía activa y sesión existente. Owner publica tarifas; owner/editor atienden solicitudes; auditor consulta. El historial de auditoría queda consultable por owner/auditor en la base.
- Publicación atómica de versiones con control de concurrencia. Cambio de estados con revisión optimista y transiciones verificadas en PostgreSQL. Instantáneas y contacto no son editables desde el panel.
- Límites atómicos por hora y origen de red seudonimizado con HMAC: catálogo/estimación 120 cada uno; registro 10. El identificador IP original no se guarda. No sustituye un WAF.
- Construcción con lista permitida de archivos públicos. El sitio servido no contiene SQL, pruebas, configuración interna, credenciales ni fuentes del servidor.

## Exclusiones y límites

Fase 2 (geocodificación/rutas) y Fase 3 (costos/rentabilidad/inteligencia) no están implementadas. No se integra Google Maps. Toda ubicación sin verificación del servidor deja el traslado y total pendientes; se puede registrar una evaluación. Las reglas de distancia se configuran y prueban, pero no se presentan como un traslado confirmado a partir de la ciudad escrita por el visitante.

El proyecto conectado disponible es compartido (`equantum-p1-pruebas`). No se utilizó. La conexión a una base exclusiva de Limpiarte, las pruebas de Auth/TOTP alojado, el ajuste de cabeceras en Vercel real y la aprobación comercial siguen pendientes. PGlite verifica PostgreSQL/RLS con un esquema Auth mínimo de prueba: no reemplaza un ensayo sobre Supabase real.

El panel anterior guardaba un catálogo en localStorage. Ese contenido del navegador no se migra ni se trata como una fuente central. Los archivos y páginas de catálogo existentes se conservan; esta fase administra solicitudes y tarifas del cotizador. La administración persistente del catálogo comercial completo queda fuera de esta fase. No hay panel alternativo público ni ingreso de prueba.

Esto no implementa por sí solo el plan empresarial de continuidad: faltan respaldos externos, restauraciones reales, monitoreo con alertas, objetivos RPO/RTO y guardias acordadas. No afirmar disponibilidad ni recuperación garantizada.

## Preparación local

Requisitos: Node.js 24 y npm.

```sh
npm ci
npm test
npm run build
npm run dev
```

Sin variables de entorno, el sitio carga pero cotizador y panel permanecen cerrados. Nunca reemplazan el servidor por localStorage ni por precios inventados.

Para un ensayo descartable, `npm run dev:fixture` utiliza solo memoria y tarifas de prueba. No requiere Supabase; no sirve para evaluar Auth ni persistencia. Está prohibido cuando `VERCEL` está definido o `NODE_ENV=production`. No cambiar el script `dev` de producción para usar fixtures. El origen del ensayo es `http://127.0.0.1:4173`. No se enviaron mensajes de WhatsApp durante las pruebas.

## Conexión a Supabase exclusivo (pendiente)

1. Seleccionar un proyecto exclusivo autorizado para Limpiarte. Separar pruebas y producción. No ejecutar esta migración en una base compartida.
2. Aplicar `supabase/migrations/20261112131504_cotizador_fase1.sql` siguiendo el flujo de migraciones de Supabase. No se ejecutó remotamente. La migración no crea usuarios, roles comerciales activos ni precios aprobados.
3. Deshabilitar nuevos registros públicos en Auth; configurar URL del sitio/redirecciones por ambiente, protección de contraseñas y límites de autenticación. Invitar usuarios mediante el proceso administrado de Supabase, con redirección autorizada a `/admin/?setup=1`. El enlace permite establecer contraseña; el panel también ofrece solicitar recuperación por correo. Configurar el proveedor de correo y probar entrega. Gestionar las credenciales fuera del chat.
4. Un administrador de infraestructura asigna el UUID del usuario ya invitado a `public.quote_admins` con `role='owner'`. No hay endpoint público para otorgar roles. Roles permitidos: owner, editor, auditor. Para revocar: `active=false` y revocar sesiones según incidente. Probar que un JWT aún vigente pierde acceso inmediatamente al desactivar membresía o eliminar la sesión.
5. Configurar `.env.example` mediante el almacén de secretos del ambiente. `SUPABASE_SECRET_KEY` y los dos secretos aleatorios (mínimo 32 caracteres, distintos) solo en servidor. `APP_ORIGIN` es el origen HTTPS exacto de cada despliegue, sin barra final. No colocar secretos en variables con prefijo público ni archivos del sitio. Para previews usar origen y base de pruebas propios; no reutilizar credenciales de producción.
6. Ingresar, enrolar TOTP con aplicación autenticadora y verificar. Ensayar recuperación/revocación mediante soporte administrado antes del lanzamiento. La interfaz no ofrece registro público. Probar los enlaces de invitación/recuperación y el cambio de contraseña antes de habilitar el ambiente.
7. Publicar tarifas desde el panel. El estado inicial tiene todos los servicios desactivados y sin aprobación. Valores de traslado son propuestas, no tarifas autorizadas. Aprobar reglas, IVA, descuentos, mínimos, complementos, vigencia, redondeo, cobertura y texto comercial con Limpiarte.
8. Revisar y aprobar `/privacidad.html`: responsable, finalidad, proveedores, contacto de derechos y período concreto de conservación. Acordar un procedimiento de eliminación con acceso restringido; no se implementó un borrado automático de datos personales sin política aprobada.
9. Programar limpieza privilegiada de `quote_rate_limits` por `expires_at < now()` (no contiene contactos). Limitar y auditar acceso a copias/exportaciones. Configurar backups y demostrar restauración separadamente.

## Validación antes de habilitar

- Cuenta sin membresía, MFA ausente, sesión revocada, editor publicando y usuario anónimo leyendo solicitudes deben resultar denegados, incluso accediendo a PostgREST directamente.
- Cotizar, guardar, recargar panel, cambiar estado y comprobar la auditoría usando el ambiente exclusivo real.
- Publicar dos veces desde pestañas con la misma versión: una debe fallar por conflicto; las solicitudes previas deben conservar importes y condiciones.
- Confirmar que solicitudes simultáneas con el mismo UUID producen un solo registro y una tarifa que cambia durante el registro no se aplica silenciosamente.
- Verificar el dominio real y origen exacto, CSP/TOTP QR, caché no-store, rutas `/admin/`, `/cotizador.html` y `/api/cotizador`, y rechazo de cabeceras de IP falsificadas. En Vercel se utiliza su `x-vercel-forwarded-for`, no el `x-forwarded-for` del visitante.
- Aprobar privacidad y condiciones, monitoreo, respaldos, restauración y plan de reversión. El PR queda en borrador y no autoriza lanzar.

## Reversión

Antes de un despliegue autorizado, guardar el ID de la última versión sana de Vercel y verificar sus dominios. Ante un incidente, desactivar el acceso público al cotizador y volver a la versión sana. No eliminar tablas ni historiales al revertir la web. Mantener el panel antiguo público fuera de producción: volver al sitio anterior no debe exponer de nuevo una administración con datos reales. La recuperación de la base se realiza desde un respaldo verificado, con procedimiento acordado previamente.

## Evidencia de esta revisión

- `npm ci`, compilación pública y 11 pruebas automatizadas pasaron el 12/11/2026.
- PostgreSQL aislado comprobó RLS, MFA/sesión/membresía, permisos, transiciones, instantáneas inmutables, publicación con versión esperada, registro idempotente y rechazo de versión desactualizada.
- La revisión en navegador recorrió estimación y registro con un adaptador local en memoria. Se verificó que la pantalla móvil de 390 px no desborda horizontalmente y que traslado y total permanecen pendientes sin verificación. La captura `docs/qa/cotizador-mobile.jpg` contiene datos de prueba, no tarifas aprobadas.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades reportadas para dependencias de producción en esta revisión; no es una garantía de ausencia de vulnerabilidades.
- No se comprobó aún el recorrido de acceso/TOTP/recuperación con Supabase alojado, persistencia remota, configuración de Vercel real, ni continuidad/restauración. No se enviaron mensajes ni se modificaron bases compartidas.


## Presentación comercial sin conexión

`/presentacion.html` es una demostración independiente en el navegador, agregada por solicitud del usuario para mostrar al dueño de Limpiarte. No desbloquea `/admin/`, no consulta ni escribe en la API o Supabase, y no requiere credenciales. Los importes y trayectos son ilustrativos. Su clave localStorage es `limpiarte-presentacion-v1`, separada del catálogo anterior. Permite cambiar estados, consultar un mensaje simulado, editar tarifas y restablecer sus datos de ejemplo. Se verificaron cálculo, registro local, cambio de estado, persistencia al recargar, edición tarifaria y conservación del importe anterior, además del ancho móvil de 390 px.
