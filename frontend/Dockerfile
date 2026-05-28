FROM node:23-slim AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Copy root package files for workspace
COPY package*.json ./
COPY turbo.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY frontend/package*.json ./frontend/

# Copy source
COPY packages/shared/ ./packages/shared/
COPY frontend/ ./frontend/

# Fix packageManager conflict and ensure Linux platform deps are installed
RUN cd /app && \
    node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));delete p.packageManager;fs.writeFileSync('package.json',JSON.stringify(p,null,2))" && \
    cd frontend && \
    node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));delete p.packageManager;fs.writeFileSync('package.json',JSON.stringify(p,null,2))"

RUN cd /app && \
    rm -rf node_modules package-lock.json && \
    rm -rf frontend/node_modules frontend/package-lock.json && \
    npm install && \
    cd /app/packages/shared && npm run build && \
    cd /app/frontend && npm run build

# Production stage
FROM node:23-slim
WORKDIR /app

# Copy standalone output (includes all needed node_modules)
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static
COPY --from=builder /app/frontend/public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
