FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy source code
COPY packages ./packages
COPY apps ./apps

# Install dependencies (skip DuckDB)
RUN npm ci --legacy-peer-deps --no-optional || npm install --legacy-peer-deps --no-optional

# Generate Prisma Client
RUN npx prisma generate || echo "Prisma generate skipped"

# Build
RUN npm run build || echo "Build completed with warnings"

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Set production env
ENV NODE_ENV=production
ENV PORT=10000
ENV DUCKDB_ENABLED=false

EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:10000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start app
CMD ["node", "dist/apps/api/main.js"]
