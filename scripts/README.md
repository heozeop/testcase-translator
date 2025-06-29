# Scripts Directory

This directory contains helper scripts for setting up and managing the Testcase Translator project.

## Available Scripts

### `setup-docker.sh`
Sets up the development environment using Docker with video recording support.

**Features:**
- Creates necessary directories for video/screenshot storage
- Builds and starts all Docker containers
- Includes FFmpeg and Chromium for full video recording functionality
- Sets up persistent volumes for development

**Usage:**
```bash
./scripts/setup-docker.sh
```

**Services started:**
- Frontend: http://localhost:5173
- Backend: http://localhost:8000  
- Database: localhost:5432

### `setup-docker-prod.sh`
Sets up the production environment using Docker.

**Features:**
- Production-optimized Docker images
- Persistent volumes for uploads and temporary files
- All video recording dependencies included
- Optimized for production deployment

**Usage:**
```bash
./scripts/setup-docker-prod.sh
```

**Services started:**
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Database: localhost:5432

## Prerequisites

1. **Docker & Docker Compose** installed
2. **Environment file** (`.env`) created based on `.env.example`
3. **Required API keys** set in environment file:
   - `ANTHROPIC_API_KEY`
   - `MASTRA_API_KEY`

## Video Recording Features

Both scripts set up containers with:
- ✅ FFmpeg for video creation from screenshots
- ✅ Chromium browser for automated testing
- ✅ Proper shared memory allocation for browser
- ✅ Persistent storage for generated videos
- ✅ All necessary system dependencies

## Troubleshooting

### Permission Issues
If you encounter permission issues:
```bash
chmod +x scripts/*.sh
```

### Port Conflicts
If ports are already in use:
- Development: Modify ports in `docker-compose.yml`
- Production: Modify ports in `docker-compose.prod.yml`

### Container Issues
To rebuild containers from scratch:
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up
```

### Video Recording Not Working
Check if FFmpeg is available in container:
```bash
docker-compose exec backend ffmpeg -version
```

## Manual Docker Commands

If you prefer to run Docker commands manually:

**Development:**
```bash
docker-compose up --build
docker-compose logs -f backend
docker-compose down
```

**Production:**
```bash
docker-compose -f docker-compose.prod.yml up --build
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml down
```