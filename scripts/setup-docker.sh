#!/bin/bash

# Setup script for Docker environment with video recording support

echo "🚀 Setting up Testcase Translator Docker environment..."

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

# Build and start the Docker containers
echo "🐳 Building Docker containers..."
docker-compose down
docker-compose build --no-cache

echo "🚀 Starting containers..."
docker-compose up -d

echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
echo "🔍 Checking service status..."
docker-compose ps

echo ""
echo "🎉 Docker environment setup complete!"
echo ""
echo "📋 Service URLs:"
echo "   Frontend: http://localhost:3000"
echo "   Backend: http://localhost:8000"
echo "   Database: localhost:5432"
echo ""
echo "   Frontend makes API calls to localhost:8000"
echo "   CORS is configured to allow cross-origin requests"
echo ""
echo "🎥 Video recording features:"
echo "   ✅ FFmpeg installed in container"
echo "   ✅ Chromium browser available"
echo "   ✅ Video recording enabled for test execution"
echo ""
echo "📝 To view logs:"
echo "   docker-compose logs -f backend"
echo "   docker-compose logs -f frontend"
echo ""
echo "🛑 To stop services:"
echo "   docker-compose down"