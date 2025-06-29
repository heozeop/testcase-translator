#!/bin/bash

# Simple Docker setup script with direct port mapping (no nginx)

echo "🚀 Setting up Testcase Translator Docker environment (Simple Mode)..."

# Create necessary directories for development
echo "📁 Creating development directories..."
mkdir -p backend/temp/screenshots
mkdir -p backend/temp/videos
mkdir -p backend/temp/cypress-executions
mkdir -p backend/uploads

# Set permissions
chmod 755 backend/temp
chmod 755 backend/uploads

echo "✅ Directories created successfully"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Please create one based on .env.example"
    echo "   Required environment variables:"
    echo "   - ANTHROPIC_API_KEY"
    echo "   - MASTRA_API_KEY"
    echo "   - DATABASE_URL (optional, will use Docker default)"
    exit 1
fi

echo "✅ Environment file found"

# Build and start the Docker containers with simple configuration
echo "🐳 Building Docker containers (Simple Mode)..."
docker-compose -f docker-compose.yml -f docker-compose.simple.yml down
docker-compose -f docker-compose.yml -f docker-compose.simple.yml build --no-cache

echo "🚀 Starting containers..."
docker-compose -f docker-compose.yml -f docker-compose.simple.yml up -d

echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
echo "🔍 Checking service status..."
docker-compose -f docker-compose.yml -f docker-compose.simple.yml ps

echo ""
echo "🎉 Docker environment setup complete (Simple Mode)!"
echo ""
echo "📋 Service URLs:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8000"
echo "   Database: localhost:5432"
echo ""
echo "🎥 Video recording features:"
echo "   ✅ FFmpeg installed in container"
echo "   ✅ Chromium browser available"
echo "   ✅ Video recording enabled for test execution"
echo ""
echo "📝 To view logs:"
echo "   docker-compose -f docker-compose.yml -f docker-compose.simple.yml logs -f backend"
echo "   docker-compose -f docker-compose.yml -f docker-compose.simple.yml logs -f frontend"
echo ""
echo "🛑 To stop services:"
echo "   docker-compose -f docker-compose.yml -f docker-compose.simple.yml down"
echo ""
echo "ℹ️  This is the simple mode with direct port mapping."
echo "   Use ./scripts/setup-docker.sh for nginx reverse proxy mode."