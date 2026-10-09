# Inmoagent

MVP inmobiliario de seguimiento de consultas, configuración de asistentes y pase a atención humana. Incluye frontend React, API Fastify, trabajador simulado y PostgreSQL con separación entre clientes.

**Modo Simulación:** usa datos ficticios. No conecta IA, Chatwoot ni WhatsApp reales. La elección de identidades de demostración no es autenticación de producción. Publicar este código no pone la aplicación en línea ni configura un servidor.

## Requisitos

- Node.js 24.19.0 o superior dentro de la rama 24 y npm.
- Docker para las dos bases efímeras de desarrollo y pruebas (PostgreSQL 18.6).
- Puertos locales libres: 3001, 5173, 55432 y 55433.

## Ejecutar localmente

```bash
git clone https://github.com/gonzalogcaminos2010/inmoagent.git
cd inmoagent
npm ci
bash scripts/db-local.sh start
npm run demo:migrate
npm run demo:api
```

En otra terminal, desde la raíz del repositorio:

```bash
npm run dev:web
```

Abrir http://127.0.0.1:5173 en la misma computadora donde se ejecutan los procesos. La API escucha en http://127.0.0.1:3001. Ambos servicios son locales; no hay una demo pública alojada por este repositorio. El proceso API ejecuta también el trabajador simulado de la demo.

Elegir Río administrador, Río operador o Sur administrador. Crear un asistente, completar negocio y reglas, probar y publicar su configuración en modo Simulación. En el chat, crear una sesión, enviar una consulta y pedir atención humana. En Consultas se puede asignar responsable, próximo paso y resultado de cierre. Operación permite probar pausas y errores simulados.

El próximo paso se muestra y edita en America/Argentina/Catamarca (UTC−3); la API guarda el instante en UTC.

## Estructura

- `apps/web`: interfaz React/Vite.
- `apps/api`: API, sesiones efímeras y coordinación de la demo.
- `apps/worker`: proceso de trabajador separado.
- `packages/domain`: asistentes, consultas, conversaciones, colas y presupuestos.
- `packages/db`: acceso a PostgreSQL, migraciones e identidad por cliente.
- `packages/adapters`: Chatwoot simulado y proveedor IA desactivado.
- `packages/contracts`: DTO y validación.
- `fixtures/demo`: ejemplos ficticios.
- `tests`: pruebas unitarias, de integración y E2E.
- `deploy/hostinger`: plantillas de contenedores para una revisión protegida; requieren configuración separada.

## Verificación y build

Con las bases locales iniciadas:

```bash
npm run db:migrate
npm run check
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
node --test deploy/hostinger/cleanup.test.mjs
```

Integración usa la base de pruebas en 55432. E2E usa la base de demo en 55433 y arranca/cierra API y web: detener los procesos manuales antes de ejecutarlo. No ejecutar dos suites contra la misma base al mismo tiempo. Playwright usa `/usr/bin/chromium`; para otro navegador instalado, definir `CHROMIUM_EXECUTABLE` con su ruta.

El build genera `dist/`. Las dependencias están fijadas en `package-lock.json`.

## Datos y seguridad

Los contenedores locales usan almacenamiento efímero: los datos sobreviven a reinicios de API/web mientras la base siga viva, pero se borran al detener los contenedores o reiniciar Docker. `bash scripts/db-local.sh stop` elimina esas bases efímeras. No usar datos reales ni credenciales de proveedores en esta demo.

El repositorio no contiene respaldos, contraseñas ni la configuración privada de un VPS. Para revisión externa hay que configurar HTTPS y protección de acceso de forma separada. PostgreSQL no debe exponerse a Internet. La autenticación real, políticas de datos e integraciones de producción están pendientes.

## Documentación

- [Contrato de API](docs/api-contract.md)
- [Chatwoot: simulación y requisitos para integración real](docs/chatwoot-contract.md)
- [Pruebas y límites](docs/acceptance.md)
- [Operación local y respaldos](docs/operations.md)
- [Dependencias](docs/dependencies.md)
- [Plantillas de despliegue para revisión](deploy/hostinger/README.md)
