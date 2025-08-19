# Prototype Monorepo

[![CI](https://github.com/SimonCierniewski/ai-chat-task/actions/workflows/ci.yml/badge.svg)](https://github.com/SimonCierniewski/ai-chat-task/actions/workflows/ci.yml)

> Production-lean monorepo skeleton for rapid prototyping (1.5–3 day sprint)

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

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Development commands
pnpm dev:api      # Start API dev server
pnpm dev:admin    # Start admin dashboard dev server
pnpm dev:android  # Instructions for Android development

# Build commands
pnpm build:api    # Build API for production
pnpm build:admin  # Build admin dashboard
pnpm build:shared # Build shared package

# Utilities
pnpm format       # Format all code with Prettier
pnpm lint         # Run ESLint (TODO: configure)
pnpm clean        # Clean all build artifacts and node_modules
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

- **Node.js**: v20 LTS
- **Package Manager**: pnpm with workspaces
- **TypeScript**: Base configuration provided
- **Code Quality**: Prettier configured, ESLint ready for setup

## 📝 Definition of Done

For each feature/task in this prototype:

1. **Code Complete**: Feature implemented and working locally
2. **Cross-package Integration**: Shared package properly integrated where needed
3. **Environment Variables**: All sensitive data externalized (no hardcoded secrets)
4. **Basic Error Handling**: Critical paths have try-catch blocks
5. **Manual Testing**: Feature tested in development environment
6. **Code Formatted**: Passes `pnpm format:check`
7. **Documentation**: README or inline comments for complex logic

## 🔒 Security Notes

- Never commit `.env` files or secrets
- Use environment variables for all configuration
- Check `/.gitignore` is properly configured before first commit

## 🏗 Next Steps

This is a skeleton structure. To build your prototype:

1. Choose and configure your tech stack for each app
2. Set up proper TypeScript configs extending `tsconfig.base.json`
3. Configure ESLint 9 flat config
4. Add necessary dependencies to each workspace
5. Implement business logic starting with the shared package

## 📄 License

Private prototype - not for distribution
