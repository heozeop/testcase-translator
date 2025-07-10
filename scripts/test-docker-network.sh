#!/bin/bash

echo "🔍 Testing Docker Network Configuration..."
echo ""

# Check if containers are running
echo "📦 Checking running containers..."
docker-compose ps

echo ""
echo "🌐 Testing service connectivity..."
# Test services through nginx proxy
echo "Application (http://localhost):"
curl -s -o /dev/null -w "%{http_code}" http://localhost || echo "❌ Application not accessible"

echo ""
echo "Backend API through proxy (http://localhost/api/health):"
curl -s http://localhost/api/health || echo "❌ Backend API not accessible through proxy"

echo ""
echo "🔗 Testing container-to-container communication..."
# Test from frontend container to backend
echo "Frontend -> Backend communication test:"
docker-compose exec frontend sh -c "wget -q -O - http://backend:3000/api/health || echo 'Failed to connect to backend from frontend'"

echo ""
echo "📝 Environment variables in frontend:"
docker-compose exec frontend sh -c "env | grep REACT_APP"

echo ""
echo "✅ Test complete!"
echo ""
echo "If you see any errors above, the network configuration may need adjustment."