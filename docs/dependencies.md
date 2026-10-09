# Dependencias

- Node.js 24.19.0 o superior dentro de la rama 24, según `package.json`.
- npm y las versiones exactas fijadas en `package-lock.json`.
- Docker para las bases de desarrollo y pruebas; imagen PostgreSQL 18.6.
- Chromium para Playwright. La configuración usa `/usr/bin/chromium` por defecto; puede seleccionarse otro ejecutable con `CHROMIUM_EXECUTABLE`.

Instalar con `npm ci`. No es necesario actualizar herramientas globales ni usar `--force`. Para construir las imágenes de revisión también se necesita Docker Compose v2 y acceso a los registros públicos de Node, PostgreSQL, nginx y npm.
