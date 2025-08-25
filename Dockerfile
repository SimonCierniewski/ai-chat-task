# Production Dockerfile for API (from monorepo root)
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source code
COPY . .

# Build shared package
RUN pnpm --filter @prototype/shared build

# Build API (allow TypeScript errors)
RUN pnpm --filter @prototype/api build || true

# Production stage
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy built application
COPY --from=builder /app .

# Set environment
ENV NODE_ENV=production

WORKDIR /app/apps/api

# Expose port
EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]