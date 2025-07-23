# Build stage
FROM node:20-slim AS builder

# Install system dependencies for Puppeteer, Cypress and video recording
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    ffmpeg \
    xvfb \
    dbus-x11 \
    libgtk2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libnotify-dev \
    libnss3 \
    libxss1 \
    libasound2 \
    libxtst6 \
    xauth \
    xfonts-base \
    xfonts-100dpi \
    xfonts-75dpi \
    xfonts-scalable \
    fonts-liberation \
    fonts-noto-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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
FROM node:20-slim AS production

# Install system dependencies for Puppeteer, Cypress and video recording
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    ffmpeg \
    xvfb \
    dbus-x11 \
    libgtk2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libnotify-dev \
    libnss3 \
    libxss1 \
    libasound2 \
    libxtst6 \
    xauth \
    xfonts-base \
    xfonts-100dpi \
    xfonts-75dpi \
    xfonts-scalable \
    fonts-liberation \
    fonts-noto-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Cypress environment variables
ENV CYPRESS_CACHE_FOLDER=/root/.cache/Cypress
ENV DISPLAY=:99

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

# Install Cypress for test execution
RUN pnpm add cypress

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Create necessary directories with proper ownership
RUN mkdir -p /app/uploads /app/temp/screenshots /app/temp/videos /app/temp/cypress-executions && \
    chown -R nodejs:nodejs /app/uploads /app/temp

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8000

# Start the application with Xvfb and dbus for headless display
CMD ["sh", "-c", "dbus-daemon --system --fork && Xvfb :99 -ac -screen 0 1920x1080x16 & sleep 2 && export DISPLAY=:99 && node dist/main.js"]