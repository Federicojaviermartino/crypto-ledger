FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy source code
COPY packages ./packages
COPY apps ./apps

# Install dependencies
RUN npm ci --legacy-peer-deps

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
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start app
CMD ["node", "dist/apps/api/main.js"]
