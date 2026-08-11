# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl tini \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=backend --workspace=@cms-ng/shared

FROM dependencies AS build
COPY packages/shared packages/shared
COPY backend backend
COPY data/authors data/authors
RUN npm run build --workspace=@cms-ng/shared \
    && npm exec --workspace=backend -- prisma generate \
    && npm run build --workspace=backend

FROM base AS production-dependencies
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY backend/prisma backend/prisma
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace=backend --workspace=@cms-ng/shared \
    && npm exec --workspace=backend -- prisma generate

FROM base AS runtime
ARG INSTALL_PLAYWRIGHT=false
ENV NODE_ENV=production \
    PORT=3001 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=production-dependencies /app/node_modules /app/node_modules
COPY --from=build /app/backend/package.json /app/backend/package.json
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /app/backend/prisma /app/backend/prisma
COPY --from=build /app/backend/src/ai/prompts /app/backend/src/ai/prompts
COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=build /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build /app/data/authors /app/backend/data/authors

# Google Trends realtime uses Playwright only when PLAYWRIGHT_ENABLED=true.
# Keeping Chromium opt-in makes the default image substantially smaller.
RUN if [ "${INSTALL_PLAYWRIGHT}" = "true" ]; then \
      npx playwright install --with-deps chromium; \
    elif [ "${INSTALL_PLAYWRIGHT}" != "false" ]; then \
      echo "INSTALL_PLAYWRIGHT must be true or false" >&2; exit 1; \
    fi \
    && chown -R node:node /app/backend /app/packages/shared

WORKDIR /app/backend
USER node
EXPOSE 3001
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/src/main.js"]
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:3001/users').then(r=>process.exit([200,401,403].includes(r.status)?0:1)).catch(()=>process.exit(1))"
