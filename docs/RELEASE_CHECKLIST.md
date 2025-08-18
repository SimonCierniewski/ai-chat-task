# Release Checklist

## Pre-Release Verification

### 🔍 Code Quality

- [ ] All code formatted with Prettier (`pnpm format:check`)
- [ ] ESLint passes (when configured)
- [ ] TypeScript compilation successful (no type errors)
- [ ] No `console.log` statements in production code
- [ ] No commented-out code blocks
- [ ] No TODO comments that block release

### 🔒 Security

- [ ] No hardcoded secrets or API keys in code
- [ ] All sensitive configuration in environment variables
- [ ] `.env` files are in `.gitignore`
- [ ] API endpoints have proper authentication
- [ ] Input validation implemented on all user inputs
- [ ] CORS properly configured for production domains
- [ ] Rate limiting configured on public endpoints

### 🧪 Testing

- [ ] All critical user flows manually tested
- [ ] API endpoints tested with sample requests
- [ ] Admin dashboard tested in Chrome, Firefox, Safari
- [ ] Android app tested on physical device
- [ ] Error states handled gracefully
- [ ] Loading states implemented
- [ ] Offline handling (if applicable)

### 📦 Build & Dependencies

- [ ] `pnpm install` runs without errors
- [ ] `pnpm build:shared` successful
- [ ] `pnpm build:api` successful
- [ ] `pnpm build:admin` successful
- [ ] Android APK/AAB builds successfully
- [ ] No outdated dependencies with security vulnerabilities
- [ ] Production builds optimized (minified, tree-shaken)

### 🌍 Environment Configuration

- [ ] Production environment variables documented
- [ ] Database migrations ready (if applicable)
- [ ] API base URLs configured correctly
- [ ] Third-party service credentials verified
- [ ] Error tracking service configured
- [ ] Logging configured appropriately

### 📱 Mobile App (Android)

- [ ] Version code and version name updated
- [ ] Release signing configured
- [ ] ProGuard/R8 rules configured (if using)
- [ ] App permissions justified and minimal
- [ ] App icon and splash screen finalized
- [ ] Store listing assets prepared

### 🚀 Deployment Preparation

- [ ] Production servers/services provisioned
- [ ] Domain names configured
- [ ] SSL certificates installed
- [ ] Database backed up (if updating existing)
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured

### 📋 Documentation

- [ ] README.md updated with latest setup instructions
- [ ] API documentation current
- [ ] Environment variable list complete
- [ ] Known issues documented
- [ ] Deployment instructions clear

### 🎯 Business Requirements

- [ ] All acceptance criteria from brief met
- [ ] Core features functional
- [ ] Performance acceptable for prototype
- [ ] UI/UX matches requirements
- [ ] Data privacy requirements satisfied

## Release Process

### 1. Final Checks

```bash
# Clean install and build
pnpm clean
pnpm install
pnpm build:shared
pnpm build:api
pnpm build:admin
```

### 2. Version Tagging

```bash
git tag -a v0.1.0 -m "Initial prototype release"
git push origin v0.1.0
```

### 3. Deployment Order

1. Deploy shared package updates
2. Deploy API service
3. Deploy admin dashboard
4. Release Android app

### 4. Post-Deployment

- [ ] Smoke test all services
- [ ] Check error tracking dashboard
- [ ] Monitor server resources
- [ ] Verify analytics tracking
- [ ] Test critical user journeys

## Rollback Procedure

If issues are discovered:

1. **API**: Revert to previous Docker image/deployment
2. **Admin**: Revert static file deployment
3. **Android**: Prepare hotfix or use staged rollout
4. **Database**: Restore from backup if schema changed

## Emergency Contacts

- **DevOps Lead**: [Contact]
- **Backend Lead**: [Contact]
- **Frontend Lead**: [Contact]
- **Product Owner**: [Contact]

## Notes

- This checklist is for a prototype/MVP release
- Adjust based on specific project requirements
- For production releases, add automated testing requirements
- Consider adding performance benchmarks for critical operations

---

✅ **Sign-off Required**: Product Owner & Tech Lead must approve before release
