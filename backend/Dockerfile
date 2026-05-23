FROM node:23-alpine AS builder
WORKDIR /app

# Copy root package files for workspace
COPY package*.json ./
COPY turbo.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm ci

# Copy source
COPY packages/shared/ ./packages/shared/
COPY backend/ ./backend/

# Build shared package
RUN cd packages/shared && npm run build

# Generate Prisma client and build backend
RUN cd backend && npx prisma generate && npm run build

# Production stage
FROM node:23-alpine
WORKDIR /app

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/backend/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/main"]
