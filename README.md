# AI Chat Task - Full Stack Application

[![CI](https://github.com/SimonCierniewski/ai-chat-task/actions/workflows/ci.yml/badge.svg)](https://github.com/SimonCierniewski/ai-chat-task/actions/workflows/ci.yml)

> Complete AI chat system with Supabase Auth, OpenAI integration, Zep memory, and full telemetry

## 🗂 Repository Structure

```
.
├── apps/
│   ├── api/          # Backend REST/GraphQL API service
│   ├── admin/        # Web-based admin dashboard
│   └── android/      # Android mobile application
├── packages/
│   └── shared/       # Shared utilities, types, and business logic
├── infra/            # Infrastructure as code (IaC) and deployment configs
├── docs/             # Project documentation
│   ├── ARCHITECTURE.md      # System architecture overview
│   └── RELEASE_CHECKLIST.md # Pre-release verification checklist
└── [config files]    # Root configuration files
```

## 🚀 Quick Start - Running the Application

### Prerequisites

1. **Node.js**: v20 LTS or higher
2. **pnpm**: Package manager (`npm install -g pnpm`)
3. **Java 17**: For Android app (see [Java Setup](./apps/android/docs/JAVA_SETUP.md))
4. **Android Studio**: For mobile app development

### 1️⃣ Initial Setup

```bash
# Clone the repository
git clone https://github.com/SimonCierniewski/ai-chat-task.git
cd ai-chat-task

# Install dependencies
pnpm install

# Build shared package first
pnpm --filter @prototype/shared build
```

### 2️⃣ Configure Environment Variables

Create `.env.local` files for each app:

```bash
# API Backend
cp apps/api/.env.example apps/api/.env.local
# Edit apps/api/.env.local with your credentials:
# - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
# - OPENAI_API_KEY (with credits)
# - ZEP_API_KEY
# - JWT_SECRET (for development)

# Admin Dashboard
cp apps/admin/.env.example apps/admin/.env.local
# Edit apps/admin/.env.local with:
# - NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY (server-side only)
```

See [Environment Guide](./docs/ENVIRONMENT.md) for detailed configuration.

### 3️⃣ Run the Applications

#### Backend API
```bash
cd apps/api
pnpm dev
# API runs on http://localhost:3000
# Health check: http://localhost:3000/health
```

#### Admin Dashboard
```bash
cd apps/admin
pnpm dev
# Admin runs on http://localhost:3001
# Login with magic link authentication
```

#### Android App
1. Open Android Studio
2. File → Open → Select `/apps/android` directory
3. Wait for Gradle sync to complete
4. Set Java 17 (File → Project Structure → SDK Location → JDK Location)
5. Run on emulator:
   - Tools → AVD Manager → Create/Start an emulator
   - Click "Run" (green play button) or press Shift+F10
   - Select your emulator

For physical device setup, see [Android README](./apps/android/README.md).

### 4️⃣ Test the System

1. **Admin Dashboard**: 
   - Navigate to http://localhost:3001
   - Sign in with magic link
   - Access Playground to test chat functionality

2. **API Endpoints**:
   ```bash
   # Health check
   curl http://localhost:3000/health
   
   # Test chat (requires auth token)
   curl http://localhost:3000/api/v1/chat \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello"}'
   ```

3. **Android App**:
   - Launch app on emulator
   - Sign in with magic link
   - Test chat functionality

## 🚀 Production Deployment

### API Deployment (Railway/Render)

1. Set environment variables in platform dashboard
2. Deploy with Docker or Node.js buildpack:
   ```bash
   # Build for production
   cd apps/api
   pnpm build
   pnpm start
   ```

See [API Runbook](./apps/api/RUNBOOK_API.md) for operational procedures.

### Admin Dashboard (Vercel)

1. Connect GitHub repository to Vercel
2. Set root directory to `apps/admin`
3. Configure environment variables
4. Deploy automatically on push to main

### Database Setup (Supabase)

1. Create project in [Supabase Dashboard](https://app.supabase.com)
2. Run migrations in SQL Editor (order matters):
   - See [Database Migrations](./apps/api/db/migrations/)
3. Configure Auth settings (enable magic links)
4. Set up database webhooks if needed

## 🛠 Development Commands

```bash
# Development
pnpm dev:api          # Start API server (port 3000)
pnpm dev:admin        # Start admin dashboard (port 3001)
pnpm dev:all          # Start all services

# Building
pnpm build:api        # Build API for production
pnpm build:admin      # Build admin dashboard
pnpm build:shared     # Build shared package
pnpm build:all        # Build everything

# Testing & Quality
pnpm format           # Format all code with Prettier
pnpm format:check     # Check formatting
pnpm typecheck        # Run TypeScript checks
pnpm clean            # Clean all build artifacts
```

## 📚 Documentation

### Project Management
- [Architecture Overview](./docs/ARCHITECTURE.md) - System design and component interaction
- [Implementation Plan](./docs/IMPLEMENTATION_PLAN.md) - Detailed phase breakdown
- [Project Context](./docs/PROJECT_CONTEXT.md) - Full project requirements
- [Release Checklist](./docs/RELEASE_CHECKLIST.md) - Pre-deployment verification steps

### Development Guides
- [Commands Reference](./docs/COMMANDS.md) - All available monorepo commands
- [Environment Guide](./docs/ENVIRONMENT.md) - Environment variable setup
- [Secrets Matrix](./infra/SECRETS_MATRIX.md) - Security boundaries and secret management

### Phase 1: Authentication
- [Auth Setup](./docs/AUTH_SETUP.md) - Complete auth implementation guide
- [Phase 1 Verification](./docs/PHASE1_VERIFICATION.md) - Authentication QA procedures
- [Definition of Done](./docs/DEFINITION_OF_DONE.md) - Acceptance criteria with status

### Phase 2: Telemetry & Pricing
- [Telemetry System](./docs/TELEMETRY.md) - Event tracking and aggregation
- [Pricing Configuration](./docs/PRICING.md) - Model pricing management
- [Cost Calculation](./docs/COSTS.md) - Detailed cost formulas and precision rules
- [Database Validation](./docs/DB_VALIDATION.md) - SQL queries for testing
- [Phase 2 Verification](./docs/PHASE2_VERIFICATION.md) - Telemetry QA checklist

## 💻 Editor Setup

### VS Code (Recommended)

Install these extensions for the best development experience:

1. **[Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)** - Code formatting
2. **[EditorConfig](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)** - Consistent coding styles
3. **[ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)** - JavaScript/TypeScript linting (when configured)

#### Auto-format on Save

Add to your VS Code settings (`.vscode/settings.json` or user settings):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[markdown]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

### Other Editors

- **IntelliJ/WebStorm**: Built-in Prettier support, enable via Settings → Tools → Prettier
- **Sublime Text**: Install [JsPrettier](https://packagecontrol.io/packages/JsPrettier) package
- **Vim/Neovim**: Use [vim-prettier](https://github.com/prettier/vim-prettier) plugin

### Manual Formatting

If auto-format isn't configured, run manually:

```bash
pnpm format        # Format all files
pnpm format:check  # Check formatting without changes
```

## 🛠 Technology Stack

### Backend
- **API**: Fastify + TypeScript (Node.js v20)
- **Auth**: Supabase with JWT/JWKS verification
- **AI**: OpenAI GPT models with streaming
- **Memory**: Zep v3 for context management
- **Database**: PostgreSQL via Supabase

### Frontend
- **Admin**: Next.js 14 App Router + TypeScript
- **Android**: Kotlin + Jetpack Compose
- **Styling**: Tailwind CSS

### Infrastructure
- **Monorepo**: pnpm workspaces
- **Deployment**: Railway/Vercel ready
- **Monitoring**: Built-in telemetry system

## 🔧 Troubleshooting

### Common Issues

1. **API won't start**
   - Check all required environment variables are set
   - Ensure Supabase project is created and running
   - Verify OpenAI API key has credits

2. **Android build fails**
   - Must use Java 17 (not 23 or other versions)
   - Run `./gradlew clean` before building
   - Check `local.properties` exists with SDK path

3. **Auth not working**
   - Verify Supabase magic link is enabled
   - Check redirect URLs in Supabase dashboard
   - Ensure JWT secret matches between services

4. **SSE streaming issues**
   - Check CORS configuration allows your origin
   - Verify network doesn't block SSE connections
   - See [SSE Troubleshooting](./docs/SSE_TROUBLESHOOTING.md)

For more help, see documentation linked below.

## 🔒 Security Notes

- Never commit `.env` files or secrets
- Use environment variables for all configuration
- Check `/.gitignore` is properly configured before first commit

## 📄 License

Private prototype - not for distribution
