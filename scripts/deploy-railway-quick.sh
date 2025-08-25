#!/bin/bash

# Railway API Quick Deployment Script (no checks)
# Run from root directory: ./scripts/deploy-railway-quick.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚂 Railway API Quick Deployment${NC}"
echo "================================="

# Check if we're in the root directory
if [ ! -f "package.json" ] || [ ! -d "apps/api" ]; then
    echo -e "${RED}Error: Must run from project root directory${NC}"
    exit 1
fi

# Build the shared package
echo -e "${YELLOW}Building shared package...${NC}"
pnpm --filter @prototype/shared build

# Build the API
echo -e "${YELLOW}Building API...${NC}"
pnpm --filter @prototype/api build || echo -e "${YELLOW}Note: TypeScript errors are allowed${NC}"

# Deploy to Railway
echo -e "${GREEN}Deploying to Railway...${NC}"
railway up --detach

echo -e "${GREEN}✅ Deployment initiated!${NC}"
echo ""
echo "Monitor: railway logs -f"
echo "Status:  railway status"
echo "Open:    railway open"