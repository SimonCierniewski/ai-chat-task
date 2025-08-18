# Prototype Monorepo

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

- [Architecture Overview](./docs/ARCHITECTURE.md) - System design and component interaction
- [Release Checklist](./docs/RELEASE_CHECKLIST.md) - Pre-deployment verification steps

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
