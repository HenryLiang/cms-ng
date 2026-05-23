FROM node:23-slim AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Copy root package files for workspace
COPY package*.json ./
COPY turbo.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci

# Copy source
COPY packages/shared/ ./packages/shared/
COPY frontend/ ./frontend/

# Build shared package
RUN cd packages/shared && npm run build

# Build frontend
RUN cd frontend && npm run build

# Production stage
FROM node:23-slim
WORKDIR /app

COPY --from=builder /app/frontend/.next ./.next
COPY --from=builder /app/frontend/node_modules ./node_modules
COPY --from=builder /app/frontend/package.json ./
COPY --from=builder /app/frontend/public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start"]
