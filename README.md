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
- **Frontend**: React application (port 3000) - User interface with real-time test execution monitoring
- **Backend**: Node.js/TypeScript API server (port 8000) - AI-powered test generation and Cypress execution engine
- **Database**: MySQL 8.0 (port 3306) - Project data, test cases, and execution results storage

### Database Schema
- `projects`: Project management and metadata
- `test_cases`: Parsed test case storage from Excel/CSV files
- `generated_code`: AI-generated Cypress test scripts
- `execution_results`: Test execution tracking and results

### Docker Environment
- **Cypress Execution**: Real browser automation with Chromium in Docker
- **Video Recording**: FFmpeg-based test execution video capture
- **Virtual Display**: Xvfb for headless browser operation
- **ARM64 Compatible**: Optimized for Apple Silicon and Intel architectures

## Getting Started

### Prerequisites
- Docker and Docker Compose (v2.0+)
- Node.js 20+ (for local development)
- An Anthropic API key for Claude Sonnet 4
- Git for version control
- At least 4GB RAM for Cypress execution
- Chrome/Chromium browser (for local development)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/testcase-translator.git
cd testcase-translator
```

2. Create a `.env` file with your configuration:
```bash
# Required API Keys
ANTHROPIC_API_KEY=your_claude_api_key_here

# AI Configuration
AI_MODEL=claude-sonnet-4-20250514
AI_MAX_TOKENS=300000
AI_TEMPERATURE=0.1

# Database Configuration
DATABASE_URL=mysql://user:password@mysql:3306/testcase_translator
DB_HOST=mysql
DB_PORT=3306
DB_NAME=testcase_translator
DB_USER=user
DB_PASSWORD=password

# Application Ports
BACKEND_PORT=8000
FRONTEND_PORT=3000

# Cypress Execution Configuration
CYPRESS_FORCE_REAL=true  # Forces real Cypress execution in Docker
DISPLAY=:99              # Virtual display for headless browser
DOCKER=true              # Identifies Docker environment
```

3. Choose your setup method:

#### Quick Setup (Recommended)
```bash
# Uses docker-compose.override.yml for development
./scripts/setup-docker.sh
# Access: Frontend http://localhost:3000, Backend http://localhost:8000
```

#### Alternative Setups
```bash
# Simple setup with alternative configuration
./scripts/setup-docker-simple.sh
# Access: Frontend http://localhost:5173, Backend http://localhost:8000

# Production setup
./scripts/setup-docker-prod.sh
# Access: http://localhost:3000

# Manual Docker Compose
docker-compose up --build  # default with override
docker-compose -f docker-compose.yml -f docker-compose.simple.yml up --build
docker-compose -f docker-compose.prod.yml up --build
```

4. Access the application:
- **Frontend**: http://localhost:3000 (React UI)
- **Backend API**: http://localhost:8000 (REST API + WebSocket)
- **Database**: localhost:3306 (MySQL 8.0)
- **API Documentation**: http://localhost:8000/api

## Development

### Development Commands
```bash
# Individual services (manual setup)
npm run dev:frontend    # React app on localhost:5173
npm run dev:backend     # API server on localhost:8000  
npm run dev:db         # PostgreSQL on localhost:5432

# Database operations
npm run db:migrate     # Run migrations
npm run db:seed        # Seed test data

# Using pnpm (recommended)
pnpm install
pnpm run dev
```

### System Dependencies

#### Docker (Recommended)
The Docker setup includes all necessary dependencies:
- FFmpeg for video creation
- Chromium browser for automated testing
- Xvfb virtual display for headless browser operation
- Real Cypress test execution (configured via CYPRESS_FORCE_REAL=true)
- All Node.js and system dependencies

#### Manual Installation
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

## Key Features

### 🤖 AI-Powered Test Generation
1. **Excel/CSV Upload**: Upload test cases in Excel or CSV format
2. **AI Test Parsing**: Claude Sonnet 4 analyzes and understands test scenarios
3. **Intelligent Code Generation**: Automatically generates Cypress test scripts
4. **Test Case Management**: Full CRUD operations for test projects

### 🎬 Real Cypress Test Execution
5. **Actual Browser Automation**: Real Chromium browser execution, not simulation
6. **Video Recording**: Full HD video capture of test execution (10+ MB files)
7. **Screenshot Capture**: Automatic screenshot on test failures
8. **Progress Streaming**: Real-time execution updates via WebSocket

### 🔧 Advanced Test Features
9. **Multi-Environment Support**: Docker, local development, and production modes
10. **HTTP Range Requests**: Efficient video streaming with seek support
11. **Test Artifacts API**: RESTful endpoints for accessing videos and screenshots
12. **Error Diagnosis**: Detailed failure analysis with stack traces

### 🎯 User Experience
13. **Responsive UI**: React-based interface with real-time updates
14. **Project Dashboard**: Organize and manage multiple test projects
15. **Test History**: Track execution history with results and media
16. **One-Click Execution**: Run generated tests with a single button click

## 테스트 실행 플로우 (Test Execution Flow)

이 시스템은 실제 브라우저 자동화를 통해 **진짜 Cypress 테스트**를 실행합니다.

```mermaid
flowchart TD
    A[엑셀 파일 업로드] --> B[AI 테스트 케이스 파싱]
    B --> C[Cypress 코드 생성]
    C --> D[테스트 실행 요청]
    
    D --> E[Docker 컨테이너 환경 설정]
    E --> F[임시 테스트 디렉토리 생성]
    F --> G[테스트 파일 작성]
    
    G --> H[실제 Cypress 실행]
    H --> I[Chromium 브라우저 시작]
    I --> J[웹사이트 자동화 수행]
    
    J --> K[비디오 녹화]
    J --> L[스크린샷 캡처]
    J --> M[테스트 결과 수집]
    
    K --> N[실행 결과 처리]
    L --> N
    M --> N
    
    N --> O[프론트엔드 결과 표시]
    
    style A fill:#e1f5fe
    style H fill:#fff3e0
    style I fill:#fff3e0
    style J fill:#fff3e0
    style O fill:#e8f5e8
```

### 🔄 상세 실행 과정

#### 1. **테스트 환경 구성**
```mermaid
graph LR
    A[Debian Linux] --> B[Chromium 브라우저]
    B --> C[Xvfb 가상 디스플레이]
    C --> D[dbus 세션]
    D --> E[ffmpeg 비디오 녹화]
```

#### 2. **실시간 테스트 실행**
```mermaid
sequenceDiagram
    participant User as 사용자
    participant Frontend as 프론트엔드
    participant Backend as 백엔드
    participant Docker as Docker 컨테이너
    participant Browser as Chromium 브라우저
    
    User->>Frontend: "테스트 실행" 클릭
    Frontend->>Backend: 테스트 실행 요청
    Backend->>Docker: Cypress 환경 준비
    Docker->>Browser: 헤드리스 브라우저 시작
    Browser->>Browser: 실제 웹사이트 방문
    Browser->>Browser: 클릭, 입력, 네비게이션 수행
    Browser->>Docker: 테스트 결과 생성
    Docker->>Backend: 비디오/스크린샷 수집
    Backend->>Frontend: 실시간 상태 업데이트
    Frontend->>User: 실행 결과 및 비디오 표시
```

#### 3. **파일 구조 및 결과물**
```
/temp/cypress-executions/{executionId}/
├── cypress.config.js          # 설정 파일
├── package.json               # 의존성
└── cypress/
    ├── e2e/
    │   └── generated-test.cy.js  # AI 생성 테스트
    ├── videos/
    │   └── test-execution.mp4    # 실제 실행 비디오 (10+ MB)
    └── screenshots/
        └── failure-screenshot.png
```

### 🎯 이전 vs 현재 비교

| 항목 | 이전 (시뮬레이션) | 현재 (실제 실행) |
|------|------------------|------------------|
| **비디오** | 1초 플레이스홀더 | 10MB+ 실제 실행 영상 |
| **실행 시간** | 즉시 완료 | 2-5분 실제 브라우저 테스트 |
| **테스트 결과** | 가상 성공 결과 | 실제 웹사이트 기반 통과/실패 |
| **브라우저** | 시뮬레이션 | 실제 Chromium 자동화 |
| **에러 처리** | 가상 에러 | 실제 웹사이트 오류 감지 |

### 🛠️ Technology Stack

#### Backend
- **Node.js 20+**: TypeScript-based API server
- **NestJS**: Modular backend framework
- **MySQL 8.0**: Relational database with MikroORM
- **Docker**: Containerized environment with ARM64/AMD64 support

#### Frontend
- **React 18**: Modern UI with TypeScript
- **Tailwind CSS**: Utility-first styling
- **WebSocket**: Real-time test execution updates
- **HTML5 Video**: Native video playback with controls

#### Test Execution
- **Cypress 14.5.2**: Real browser automation framework
- **Chromium 138**: Headless browser engine
- **Xvfb**: Virtual display server for Docker
- **FFmpeg**: Video recording and processing
- **Claude Sonnet 4**: AI-powered test code generation

### 🎥 Test Execution Results
- **Real Browser Videos**: Complete test execution recording (HD quality)
- **Live Progress Updates**: Real-time streaming via WebSocket
- **Detailed Error Reports**: Actual website issue diagnosis
- **Failure Screenshots**: Captured at exact failure moments
- **Test Artifacts API**: RESTful access to all media files

## Recent Updates (v2.0)

### ✅ Fixed Cypress Test Execution
- **Real Browser Testing**: Fixed command arguments and environment variables
- **Video Recording**: Enabled actual HD video capture (11+ MB files)
- **Screenshot Capture**: Automatic failure screenshot generation
- **User Test Preservation**: Stopped overriding user-generated tests with templates
- **Extended Timeout**: Increased from 2 to 5 minutes for complex tests
- **Media Detection**: Improved filesystem scanning for test artifacts

### ✅ Enhanced Docker Environment
- **ARM64 Compatibility**: Optimized for Apple Silicon
- **Environment Variables**: Fixed TERM and DISPLAY configuration
- **Browser Configuration**: Proper Chromium browser detection
- **TypeScript Config**: Added baseUrl and paths resolution
- **Video Streaming**: HTTP range requests for efficient playback

## API Endpoints

### Test Execution
```bash
# Execute latest generated tests
POST /api/projects/{projectId}/run-cypress

# Execute specific generation tests  
POST /api/projects/{projectId}/generated-code/{generationId}/run-cypress

# Get execution status
GET /api/projects/{projectId}/cypress-status/{executionId}
```

### Media Access
```bash
# Download test video
GET /api/projects/{projectId}/executions/{executionId}/videos/{filename}

# Download screenshot
GET /api/projects/{projectId}/executions/{executionId}/screenshots/{filename}
```

### Project Management
```bash
# List projects
GET /api/projects

# Create project
POST /api/projects

# Get generated code
GET /api/projects/{projectId}/generated-code/{generationId}
```

## Usage Example

1. **Upload Test Cases**: Upload Excel/CSV file with test scenarios
2. **Generate Code**: Click "Generate Cypress Code" to create tests
3. **Execute Tests**: Click "Run Tests" to start real browser automation
4. **View Results**: Watch live video and check test results
5. **Download Artifacts**: Access videos and screenshots via API

## Troubleshooting

### Common Issues
- **Video not playing**: Check FFmpeg installation and browser codec support
- **Tests timing out**: Increase timeout in Cypress configuration (currently 5 minutes)
- **Memory issues**: Ensure Docker has at least 4GB RAM allocated
- **Port conflicts**: Check if ports 3000, 8000, 3306 are available

### Docker Issues
```bash
# Reset containers
docker-compose down -v
docker-compose up --build

# Check logs
docker-compose logs backend
docker-compose logs mysql
```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.