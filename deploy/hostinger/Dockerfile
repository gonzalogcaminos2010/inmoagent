FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY . .
ARG NPM_OFFLINE=false
RUN if [ "$NPM_OFFLINE" = true ]; then cache_path=/app/.inmo-build-cache; npm ci --offline --no-audit --cache "$cache_path"; else cache_path=/tmp/npm-cache; npm ci --no-audit --cache "$cache_path"; fi && npm run build && npm prune --omit=dev --offline --no-audit --cache "$cache_path"
FROM node:24.19.0-alpine AS runtime
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
CMD ["node", "-e", "const u=new URL(process.env.DEMO_ORIGIN);if(u.protocol!=='https:' || u.pathname!=='/' || u.search || u.hash || u.username || u.password)throw Error('Exact HTTPS origin required');import('./dist/apps/api/src/server.js');"]
FROM nginx:1.28.0-alpine AS web
COPY --from=build --chown=101:101 /app/dist/web /usr/share/nginx/html
COPY --chown=101:101 --chmod=0444 deploy/hostinger/nginx.conf /etc/nginx/nginx.conf
USER 101
