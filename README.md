# Testcase Translator

A powerful test automation tool that converts Excel-based test cases into automated Cypress test scripts using AI-powered parsing and browser automation.

## Overview

Testcase Translator helps QA teams and product managers automate their testing workflows by:
- Converting Excel test cases into executable Cypress scripts
- Using Claude AI via Mastra.ai for intelligent test case parsing
- Automatically exploring web pages to generate test scripts
- Providing a user-friendly interface for managing test projects

## Architecture

The project uses a three-tier architecture:
- **Frontend**: React application (port 3000)
- **Backend**: Node.js/TypeScript API server (port 8000)
- **Database**: PostgreSQL (port 5432)

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- An Anthropic API key for Claude
- A Mastra.ai API key

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/testcase-translator.git
cd testcase-translator
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
# Edit .env with your API keys
```

3. Start the application with Docker Compose:
```bash
docker-compose up
```

4. Access the application:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Database: localhost:5432

## Development

### Task Management
This project uses Task Master for development workflow:
```bash
# View current tasks
task-master list

# Work on a specific task
task-master expand <task-id>

# Update task status
task-master set-status <task-id> <status>
```

### Running Services Individually
```bash
# Frontend development
cd frontend
npm install
npm run dev

# Backend development
cd backend
npm install
npm run dev

# Database
docker-compose up db
```

## Features

1. **URL Validation & HTML Retrieval**: Validates URLs and fetches page content
2. **AI-Powered Excel Parsing**: Uses Claude to understand test scenarios
3. **Dynamic Browser Exploration**: Automated page navigation using Puppeteer
4. **Real-time Updates**: WebSocket-based progress tracking
5. **Cypress Script Generation**: Automated test script creation
6. **Project Management**: Full CRUD operations for test projects

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.