# Operación exclusivamente local
API/web sólo loopback. El script valida imagen y enlace loopback antes de detener bases con nombres de este proyecto. Contenedores --rm y tmpfs, sin volúmenes externos, contraseñas ni credenciales de proveedores. No tocar servicios existentes ni publicar el puerto.
Base pruebas inmoagent-test-db:55432; base demo inmoagent-demo-db:55433. Migrador postgres separado del rol inmo_app de API/trabajador (NOSUPERUSER/NOBYPASSRLS, no propietario). Contexto RLS SET LOCAL, membresía validada y rollback/liberación de pool.

## Backup y restauración de prueba
Con la base local de pruebas viva y sin suites concurrentes:

```bash
umask 077
mkdir -p ./backups
docker exec inmoagent-test-db pg_dump -U postgres -Fc inmoagent > ./backups/test.dump
docker exec inmoagent-test-db createdb -U postgres inmoagent_restore_check
docker exec -i inmoagent-test-db pg_restore -U postgres -d inmoagent_restore_check < ./backups/test.dump
docker exec inmoagent-test-db psql -U postgres -d inmoagent_restore_check -c 'SELECT count(*) FROM inquiries;'
```

Sólo se ensaya sobre datos ficticios y una base restaurada separada; no restaura ni cambia ningún servicio activo externo. Detener el contenedor efímero elimina también la base de restauración.

## Fallos y límites
Simular fallo transitorio/permanente o timeout desde Operación. Entrega incierta nunca se reenvía ciegamente; se concilia por recibo durable, o pasa a revisión y pausa. Máximo 5 intentos y 30 minutos. No reactivar jobs descartados al reanudar. Reintento manual requiere atención explícita; límite de intentos y entrega incierta siguen protegidos.
Una pausa puede esperar un envío simulado que ya inició; lo aceptado antes de registrar la pausa no se retira. La integración real necesita timeout estricto y pruebas de su contrato. Configuración cambiada exige nueva sesión de chat; borrador editado exige nueva prueba exacta.
Contactos opcionales mínimos; frontend renderiza texto, sin HTML. Antes del piloto: autenticación/HTTPS, consentimiento/retención/borrado, proveedor/modelo y presupuesto autorizado, almacenamiento de secretos, backups/restauración, contrato Chatwoot y webhook, autorización para Account/inbox, capacidad y rollback. Nada de esto está validado para producción.

## Guion de cinco minutos
1. Mostrar cliente/rol y rótulo Simulación; configurar/publicar conocimiento ficticio aprobado.
2. Abrir chat, consultar y mostrar respuesta determinista.
3. Pedir humano, mostrar pausa y responsable/próximo paso en consulta; confirmar pase simulado.
4. Guardar seguimiento y cerrar con resultado; recargar para demostrar persistencia.
5. Cambiar a Sur, demostrar separación; mostrar fallos/pausa y estados reales desactivados.
La demo demuestra operación técnica; interés comercial, disposición a pagar y objeciones se registran aparte.

## Reiniciar sin borrar datos
Detener sólo API y web con Ctrl+C en sus terminales; mantener ambos contenedores de base vivos. Desde la carpeta del MVP, ejecutar `npm run demo:api` y, en otra terminal, `npm run dev:web`. El historial y las consultas siguen en PostgreSQL; las sesiones de acceso/capabilities son efímeras y exigen entrar y crear una nueva sesión de chat.

## Reinicio completo y pérdida de datos
Los contenedores usan tmpfs y --rm: detenerlos, reiniciar Docker o el entorno elimina las bases. No constituyen almacenamiento duradero. Para empezar de cero, detener API/web y ejecutar:
```bash
bash scripts/db-local.sh stop
bash scripts/db-local.sh start
npm run demo:migrate
npm run demo:api
# Otra terminal en la misma carpeta:
# npm run dev:web
```
Volver a crear y publicar el asistente de simulación. Para pruebas también ejecutar `npm run db:migrate`. Ningún comando convierte la demo en producción. Los archivos de código no se borran al detener las bases; el dump local de ejemplo requiere restauración explícita y no es un sistema de backup automático. URLs127.0.0.1 sólo funcionan dentro del entorno, sin enlace público.
