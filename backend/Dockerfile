# Build stage
FROM node:20-alpine AS builder

# Install system dependencies for Puppeteer and video recording
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    ffmpeg \
    && rm -rf /var/cache/apk/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy TypeScript config
COPY tsconfig.json ./

# Copy source code
COPY src ./src

# Build the application
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

# Install system dependencies for Puppeteer and video recording
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    ffmpeg \
    && rm -rf /var/cache/apk/*

# Set Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Create necessary directories with proper ownership
RUN mkdir -p /app/uploads /app/temp/screenshots /app/temp/videos /app/temp/cypress-executions && \
    chown -R nodejs:nodejs /app/uploads /app/temp

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8000

# Start the application
CMD ["node", "dist/main.js"]