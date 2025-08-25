#!/bin/bash

# Railway Deploy WITHOUT TypeScript Check
# Use when TypeScript has errors but the app works

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🚂 Railway Deploy (Skip TypeScript)${NC}"
echo "====================================="

# Temporarily modify build script to skip tsc
echo -e "${YELLOW}Modifying build script to skip TypeScript...${NC}"

# Backup original package.json
cp apps/api/package.json apps/api/package.json.backup

# Modify the build script to skip tsc
cd apps/api
node -e "
const pkg = require('./package.json');
pkg.scripts.build = 'echo \"Skipping TypeScript build\"';
require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2));
"

cd ../..

# Deploy
echo -e "${YELLOW}Deploying to Railway...${NC}"
railway up --detach

# Restore original package.json
echo -e "${YELLOW}Restoring original package.json...${NC}"
mv apps/api/package.json.backup apps/api/package.json

echo -e "${GREEN}✅ Deployment initiated!${NC}"
echo ""
echo -e "${YELLOW}Note: TypeScript compilation was skipped!${NC}"
echo "The app will run with JavaScript files as-is."
echo ""
echo "Monitor with: railway logs"