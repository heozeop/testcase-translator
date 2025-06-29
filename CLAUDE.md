# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Testcase Translator project that converts Excel-based test cases into automated Cypress test scripts. It uses AI (Claude via Mastra.ai) to parse and understand test scenarios, providing a web interface for managing test automation projects.

## Architecture

The project uses a three-tier architecture:
- **Frontend**: React application (port 3000)
- **Backend**: Node.js/TypeScript API server (port 8000)
- **Database**: PostgreSQL (port 5432)

### Database Schema
- `projects`: Project management
- `test_cases`: Parsed test case storage
- `generated_code`: Generated Cypress scripts
- `execution_results`: Test execution tracking

## Development Commands

### Task Management
This project uses Task Master (task-master-ai) for development workflow:
```bash
# Initialize and set up the project
task-master init

# Parse PRD into tasks
task-master parse-prd

# View current tasks
task-master list
task-master list --verbose

# Work on specific tasks
task-master expand <task-id>
task-master set-status <task-id> <status>

# Tag-based context management
task-master tag create <tag-name>
task-master tag use <tag-name>
```

### Development Setup

#### Docker Setup (Recommended)
```bash
# Quick setup (uses docker-compose.override.yml)
./scripts/setup-docker.sh
# Access: Frontend http://localhost:3000, Backend http://localhost:8000

# Simple setup with alternative configuration
./scripts/setup-docker-simple.sh
# Access: Frontend http://localhost:5173, Backend http://localhost:8000

# Production setup
./scripts/setup-docker-prod.sh
# Access: http://localhost:3000

# Manual setup options
docker-compose up --build                                          # default with override
docker-compose -f docker-compose.yml -f docker-compose.simple.yml up --build  # simple ports
docker-compose -f docker-compose.prod.yml up --build              # production
```

#### Manual Setup
```bash
# Start individual services
npm run dev:frontend    # React app on localhost:5173
npm run dev:backend     # API server on localhost:8000
npm run dev:db         # PostgreSQL on localhost:5432

# Database operations
npm run db:migrate     # Run migrations
npm run db:seed        # Seed test data
```

### Testing
```bash
# The project generates Cypress tests - it doesn't test itself
# Generated tests will be placed in the output directory
```

## Key Features

1. **URL Validation & HTML Retrieval**: Validates URLs and fetches HTML content
2. **AI-Powered Excel Parsing**: Uses Claude to understand test scenarios from Excel
3. **Dynamic Browser Exploration**: Puppeteer-based page navigation
4. **Real-time User Input**: WebSocket-based input collection
5. **Cypress Script Generation**: Automated test script creation
6. **Project Management API**: RESTful endpoints for CRUD operations

## Environment Configuration

Create a `.env` file based on `.env.example`:
```bash
# Required API Keys
ANTHROPIC_API_KEY=your_key_here
MASTRA_API_KEY=your_key_here

# Optional AI Provider Keys
OPENAI_API_KEY=
GOOGLE_AI_STUDIO_API_KEY=
PERPLEXITY_API_KEY=

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/testcase_translator
```

## System Dependencies

### Docker (Recommended)
The Docker setup includes all necessary dependencies:
- FFmpeg for video creation
- Chromium browser for automated testing
- All Node.js and system dependencies

### Manual Installation
For video recording functionality during test execution:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install ffmpeg chromium-browser

# Alpine Linux
apk add --no-cache ffmpeg chromium

# macOS
brew install ffmpeg
# Chrome/Chromium should be installed separately

# Verify installation
ffmpeg -version
chromium-browser --version  # or google-chrome --version
```

Note: Video recording will be automatically disabled if FFmpeg is not available, but screenshots will still work.

## Development Workflow

1. Use Task Master to manage development tasks
2. Follow the task dependencies in the system
3. Each task includes implementation details and test strategies
4. Mark tasks complete as you finish them
5. Use the MCP tools for enhanced development experience

## Important Notes

- The project is in initial development phase
- Follow the established task structure when implementing features
- Use TypeScript for all backend code
- Follow React best practices for frontend components
- Ensure proper error handling for all AI API calls
- WebSocket connections require careful state management