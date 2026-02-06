# syntax=docker/dockerfile:1

FROM node:24-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

COPY package*.json ./
RUN export HUSKY=0 && npm ci

# Development image
FROM base AS development
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

CMD ["npm", "run", "dev"]

# Build the application
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Production dependencies only
FROM base AS prod-deps
WORKDIR /app

COPY package*.json ./
RUN export HUSKY=0 && npm ci --omit=dev

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy only necessary files
COPY --from=builder /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Change ownership to non-root user
RUN chown -R appuser:nodejs /app

USER appuser

CMD ["node", "dist/index.js"]
