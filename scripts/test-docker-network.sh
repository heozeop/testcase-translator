#!/bin/bash

echo "🔍 Testing Docker Network Configuration..."
echo ""

# Check if containers are running
echo "📦 Checking running containers..."
docker-compose ps

echo ""
echo "🌐 Testing backend connectivity..."
# Test backend directly
echo "Direct backend test (http://localhost:8000/api/health):"
curl -s http://localhost:8000/api/health || echo "❌ Backend not accessible on port 8000"

echo ""
echo "🎨 Testing frontend..."
echo "Frontend (http://localhost:3000):"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "❌ Frontend not accessible on port 3000"

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