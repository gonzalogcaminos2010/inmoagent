# Validación de la demo

La suite del repositorio cubre una implementación de simulación. Ninguna prueba valida conexiones reales con IA, Chatwoot o WhatsApp.

## Comandos

```bash
npm ci
bash scripts/db-local.sh start
npm run db:migrate
npm run check
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
node --test deploy/hostinger/cleanup.test.mjs
```

Integración usa PostgreSQL en el puerto local 55432. E2E usa la base separada en 55433 y arranca API/web; no deben estar ejecutándose otras instancias en los mismos puertos. No correr suites concurrentes contra la misma base. El script de bases crea contenedores efímeros exclusivos de este proyecto; detenerlos elimina sus datos.

## Cobertura funcional incluida

- Arquitectura sin proveedor de IA activo y con adaptador Chatwoot simulado.
- Sesiones efímeras, roles, validación de Origin/CSRF y capacidades restringidas al chat.
- Separación entre clientes, políticas RLS e integridad de membresías.
- Borrador del asistente, revisión, publicación idempotente e inmutable.
- Consultas, seguimiento, próximo paso, responsable, cierre y persistencia.
- Pausa, pase humano simulado, reintentos, entrega incierta y recuperación.
- Límites de uso y presupuestos sin consumo real de IA.
- Interfaz de escritorio/móvil y fechas en America/Argentina/Catamarca.
- Limpieza de recursos temporales del ensayo de contenedores.

## Límites

La autenticación de demostración permite elegir identidades ficticias; no es un sistema de acceso para producción. Las sesiones y capacidades se invalidan al reiniciar la API. Las bases locales son efímeras. Antes de un piloto real hacen falta autenticación, HTTPS, política de datos, copias y restauración, integración autorizada y probada con cada proveedor, y validación de capacidad y despliegue.

El código publicado no incluye respaldos, credenciales ni evidencia privada de infraestructura. Ejecutar los comandos anteriores en el entorno destino y revisar sus resultados; la presencia de pruebas no implica que hayan pasado allí.
