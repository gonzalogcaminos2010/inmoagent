# Contenedores para revisión protegida

Estas plantillas permiten preparar una demo aislada en un servidor Linux con Docker Compose v2. Son configuraciones de ejemplo, no una instalación de producción ni prueba de un despliegue activo. No contienen dominios, direcciones IP, contraseñas ni rutas de un servidor particular.

La aplicación sigue en modo Simulación. Los revisores pueden seleccionar las identidades ficticias de la demo; no existe autenticación individual de producción. IA, Chatwoot y WhatsApp siguen desconectados.

## Revisar antes de usar

- Arquitectura compatible con las imágenes de Node 24.19.0, PostgreSQL 18.6 y nginx 1.28.0.
- Docker Compose v2; el overlay Traefik requiere soporte de `!reset`.
- Recursos libres para aproximadamente 1 GiB de límites de memoria de runtime, más sistema, proxy y margen. La construcción de imágenes necesita recursos adicionales y acceso a los registros públicos.
- Nombres propios libres: proyecto `inmoagent-review`, redes `inmoagent-review-private` y `inmoagent-review-ingress`, volumen `inmoagent-review-data` e imágenes `inmoagent-review-api`/`inmoagent-review-web`. No adoptar recursos existentes de otro proyecto.
- Origen HTTPS con certificado válido y acceso protegido para todos los endpoints.
- Copias de seguridad y procedimiento de retirada acordes al entorno.

No cambiar automáticamente el firewall, DNS, proxy, Docker ni otros servicios. No iniciar los contenedores hasta revisar la configuración y el acceso.

## Variables

Configurar fuera del repositorio:

- `DEMO_VERSION`: etiqueta inmutable para las imágenes de esta revisión.
- `DEMO_ORIGIN`: origen HTTPS exacto, sin ruta ni barra final; por ejemplo `https://demo.example.com`. No es un secreto.
- `DEMO_AUTH_FILE`: ruta absoluta a un archivo htpasswd dedicado, con hashes compatibles y legible por el UID 101 de nginx. El archivo debe ser administrado por el operador, permanecer fuera de Git y protegerse en el host.
- `DEMO_LOOPBACK_PORT`: puerto de loopback libre; valor predeterminado 18080. Sólo aplica a la configuración base.
- `DEMO_HOSTNAME`: nombre DNS exacto de la demo; sólo se utiliza con el overlay Traefik y debe coincidir con el hostname de `DEMO_ORIGIN`.

No subir archivos `.env`, hashes, llaves ni contraseñas. Los ejemplos de dominio son marcadores; no implican que exista un sitio publicado.

## Topología base

`compose.yaml` publica únicamente `127.0.0.1:18080` hacia nginx. Requiere un proxy HTTPS externo que pueda alcanzar ese loopback; no es válido asumir que un proxy en otra red de contenedores podrá hacerlo.

- PostgreSQL sólo está en una red interna propia y no publica puertos.
- API escucha en loopback dentro de su espacio de red; no se publica el puerto 3001.
- nginx comparte ese espacio de red, protege estáticos y `/api` con Basic Auth y usa un healthcheck interno no publicado.
- API y nginx tienen además una red de ingreso propia.
- El volumen conserva datos al recrear los contenedores, pero no constituye una copia de seguridad.

PostgreSQL usa `trust` exclusivamente en esta red aislada de demostración. No es apto para producción, no se debe publicar el puerto 5432 ni conectar contenedores ajenos.

## Validación sin iniciar servicios

Desde la raíz del repositorio y con las variables configuradas:

```bash
bash deploy/hostinger/check.sh
docker compose -f deploy/hostinger/compose.yaml config --quiet
```

`check.sh` exige un origen HTTPS y un archivo de hashes legible y no vacío. No crea credenciales, no construye imágenes y no inicia servicios.

## Overlay opcional Traefik

`compose.traefik.yaml` elimina todos los puertos publicados y configura un router exclusivo hacia nginx por `inmoagent-review-ingress`. Debe combinarse con la base, nunca ejecutarse solo:

```bash
docker compose -f deploy/hostinger/compose.yaml -f deploy/hostinger/compose.traefik.yaml config --quiet
```

Antes de aplicarlo, comprobar que el Traefik existente puede alcanzar esa red y que sus nombres de entrypoint y resolver coinciden con `websecure` y `letsencrypt`. Verificar el dominio, el origen HTTPS exacto y el certificado. No reiniciar ni modificar un proxy compartido como efecto colateral. Iniciar con el overlay activa una ruta externa y puede solicitar un certificado; requiere una decisión explícita del operador. No saltarse advertencias TLS.

Una vez elegido un modo, usar los mismos archivos `-f` en todas sus operaciones: construcción, migración, arranque, inspección, backup y rollback. Los comandos de la base sin overlay no deben copiarse sin revisar la topología del servidor.

## Flujo de instalación

Después de revisar el modo, variables, recursos, autorización de acceso y persistencia:

1. Construir las imágenes de API y web desde la raíz del repositorio.
2. Iniciar sólo la base de esta demo y esperar a que esté sana.
3. Ejecutar el servicio `migrate` del perfil `tools`.
4. Iniciar API y web.
5. Comprobar salud, certificado y acceso. Sin credencial o con una incorrecta deben responder 401 tanto `/` como `/api/health`; con credencial debe aparecer Simulación y la cookie de sesión debe llevar `Secure`.
6. Verificar que PostgreSQL no tenga puerto publicado y que API/health internos no sean accesibles desde fuera.

No se incluyen comandos automáticos para crear usuarios, cambiar credenciales o aplicar la configuración a un servidor.

## Backups, rollback y retirada

Guardar un `pg_dump` de esta demo en una ubicación privada fuera de Git. Probar su restauración en una base separada antes de depender de él. No usar datos reales en el ensayo.

Conservar las etiquetas de imágenes previas. Ante un problema, detener sólo API/web y volver a una versión compatible. Si hubo una migración incompatible, acordar una restauración explícita en la base de esta demo antes de sustituir datos. Nunca restaurar sobre una base compartida o un servicio activo por inferencia.

Para retirar la revisión, detener sólo sus servicios y conservar el volumen y los respaldos según corresponda. Retirar sólo la ruta de esta demo. No usar `down -v`, `volume rm` ni `prune` sin una decisión explícita de eliminación.

## Pruebas locales de las plantillas

- `node --test deploy/hostinger/cleanup.test.mjs`: regresiones de limpieza con operaciones simuladas; no requiere Docker.
- `node deploy/hostinger/verify-package.mjs`: valida Compose y protecciones; requiere Docker Compose, pero no inicia servicios.
- `sandbox-smoke.mjs`: ensayo destructivo exclusivamente en un entorno de desarrollo desechable. Requiere reconocimiento explícito `INMO_SANDBOX_ACK=development-only`, imágenes locales preparadas y recursos propios inexistentes. Crea y elimina recursos temporales de prueba. Nunca ejecutarlo en un VPS compartido o de producción.

Estos ensayos no validan DNS, TLS ni la configuración real de un servidor.
