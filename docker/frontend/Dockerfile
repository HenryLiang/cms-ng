# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=frontend --workspace=@cms-ng/shared

FROM dependencies AS build
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY packages/shared packages/shared
COPY frontend frontend
RUN npm run build --workspace=@cms-ng/shared \
    && npm run build --workspace=frontend

FROM base AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app/frontend/.next/standalone /app
COPY --from=build --chown=node:node /app/frontend/public /app/frontend/public
COPY --from=build --chown=node:node /app/frontend/.next/static /app/frontend/.next/static

WORKDIR /app/frontend
USER node
EXPOSE 3000
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
