#!/usr/bin/env bash
set -euo pipefail
# Sólo bases efímeras de este MVP. Nunca usa servicios de otros proyectos.
action=${1:-start}
for entry in test:55432 demo:55433; do
  kind=${entry%:*}; port=${entry#*:}; container="inmoagent-${kind}-db"
  if docker inspect "$container" >/dev/null 2>&1; then
    image=$(docker inspect --format '{{.Config.Image}}' "$container")
    bound=$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostIp}}' "$container")
    if [[ "$image" != postgres:18.6 || "$bound" != 127.0.0.1 ]]; then
      printf 'Contenedor no coincide con base local esperada: %s\n' "$container" >&2; exit 1
    fi
    if [[ "$action" == stop ]]; then docker stop "$container"; fi
  elif [[ "$action" == start ]]; then
    docker run --name "$container" --rm -d -p "127.0.0.1:${port}:5432" --tmpfs /var/lib/postgresql -e POSTGRES_HOST_AUTH_METHOD=trust postgres:18.6
  elif [[ "$action" != stop ]]; then
    printf 'Uso: bash scripts/db-local.sh start|stop\n' >&2; exit 1
  fi
done
