#!/bin/bash

# Production setup script for Docker environment with video recording support

echo "🚀 Setting up Testcase Translator Production Docker environment..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Please create one based on .env.example"
    echo "   Required environment variables:"
    echo "   - ANTHROPIC_API_KEY"
    echo "   - MASTRA_API_KEY"
    echo "   - DATABASE_URL (optional, will use Docker default)"
    echo "   - DB_PASSWORD (for production database)"
    exit 1
fi

echo "✅ Environment file found"

# Stop any running containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down

# Build production images
echo "🏗️  Building production Docker images..."
docker-compose -f docker-compose.prod.yml build --no-cache

# Start production containers
echo "🚀 Starting production containers..."
docker-compose -f docker-compose.prod.yml up -d

echo "⏳ Waiting for services to be ready..."
sleep 15

# Check if services are running
echo "🔍 Checking service status..."
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "🎉 Production Docker environment setup complete!"
echo ""
echo "📋 Service URLs:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   Database: localhost:5432"
echo ""
echo "🎥 Production features:"
echo "   ✅ FFmpeg installed in container"
echo "   ✅ Chromium browser available"
echo "   ✅ Video recording enabled for test execution"
echo "   ✅ Persistent volumes for uploads and temp files"
echo "   ✅ Optimized for production use"
echo ""
echo "📝 To view logs:"
echo "   docker-compose -f docker-compose.prod.yml logs -f backend"
echo "   docker-compose -f docker-compose.prod.yml logs -f frontend"
echo ""
echo "🛑 To stop services:"
echo "   docker-compose -f docker-compose.prod.yml down"
echo ""
echo "📊 Volume information:"
echo "   - backend-uploads: Persistent storage for uploaded files"
echo "   - backend-temp: Persistent storage for generated videos/screenshots"