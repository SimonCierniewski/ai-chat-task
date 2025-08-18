# Commands Reference

Quick reference for all monorepo commands. All commands run from root directory.

## 🚀 Development

| Command | Description | Failure Mode |
|---------|-------------|--------------|
| `pnpm dev` | Start all app dev servers in parallel | Shows warning if no dev scripts |
| `pnpm dev:api` | Start API service only | Shows warning if not configured |
| `pnpm dev:admin` | Start admin dashboard only | Shows warning if not configured |
| `pnpm dev:android` | Instructions for Android development | Info message only |
| `pnpm dev:all` | Start API + Admin together | Warnings for unconfigured apps |

## 📦 Building

| Command | Description | Failure Mode |
|---------|-------------|--------------|
| `pnpm build` | Build shared package then all apps | Shows warning if no scripts |
| `pnpm build:api` | Build API for production | Shows warning if not configured |
| `pnpm build:admin` | Build admin dashboard | Shows warning if not configured |
| `pnpm build:shared` | Build shared utilities package | Shows warning if not configured |
| `pnpm build:all` | Build everything sequentially | Continues despite failures |

## ✨ Code Quality

| Command | Description | Failure Mode |
|---------|-------------|--------------|
| `pnpm lint` | Run ESLint in all workspaces | Shows warning if not configured |
| `pnpm lint:fix` | Auto-fix linting issues | Shows warning if not configured |
| `pnpm format` | Format all files with Prettier | Skips if files don't exist |
| `pnpm format:check` | Check formatting without changes | Returns non-zero if issues found |
| `pnpm typecheck` | Run TypeScript checks | Shows warning if not configured |

## 🧪 Testing

| Command | Description | Failure Mode |
|---------|-------------|--------------|
| `pnpm test` | Run all tests in parallel | Shows warning if no tests |
| `pnpm test:watch` | Run tests in watch mode | Shows warning if not configured |
| `pnpm test:coverage` | Generate coverage reports | Shows warning if not configured |

## 🧹 Maintenance

| Command | Description | Failure Mode |
|---------|-------------|--------------|
| `pnpm clean` | Remove all build artifacts and deps | Safe, continues on error |
| `pnpm clean:build` | Remove only build outputs | Safe, continues on error |
| `pnpm clean:deps` | Remove all node_modules | Safe, continues on error |
| `pnpm clean:cache` | Clear pnpm and build caches | Safe, continues on error |

## ✅ Health Checks

| Command | Description | Expected Output |
|---------|-------------|-----------------|
| `pnpm check:repo` | Verify Node, pnpm, workspaces | `✓ Node v20.x.x`<br>`✓ pnpm 8.x.x`<br>`✓ Workspaces OK` |
| `pnpm check:deps` | Show outdated dependencies | Table of updates available |
| `pnpm check:all` | Run all checks + quality tools | All checks pass or show issues |

## 🔧 Setup

| Command | Description | When to Use |
|---------|-------------|-------------|
| `pnpm setup` | Install deps + verify setup | After cloning repo |
| `pnpm install` | Install all dependencies | After pulling changes |

## 💡 Usage Tips

### Starting Fresh
```bash
git clone <repo>
cd <repo>
pnpm setup        # Install + verify
pnpm dev          # Start development
```

### Daily Workflow
```bash
pnpm dev:all      # Start API + Admin
pnpm format       # Format before commit
pnpm check:all    # Verify before push
```

### Before Deploy
```bash
pnpm clean        # Start clean
pnpm install      # Fresh dependencies
pnpm build:all    # Build everything
pnpm check:all    # Final verification
```

## 🎯 Script Behavior

**Resilient by Design**: All scripts handle missing implementations gracefully:
- `--if-present` flag prevents crashes on missing scripts
- Fallback messages guide setup when apps aren't configured
- Parallel execution continues despite individual failures
- Error streams suppressed with `2>/dev/null` where appropriate

**Zero Configuration**: Works immediately after clone:
- No assumptions about app implementations
- Prettier works without any app code
- Check commands verify environment setup
- Clean commands safe on empty directories