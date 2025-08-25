#!/bin/bash

# Vercel Deployment Script for Admin Dashboard
# This script deploys the Admin app to Vercel using the CLI

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}▲ Vercel Deployment Script${NC}"
echo "================================"

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}❌ Vercel CLI is not installed${NC}"
    echo "Install it with: npm install -g vercel"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "apps/admin" ]; then
    echo -e "${RED}❌ Please run this script from the repository root${NC}"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
    read -p "Do you want to continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "${GREEN}Current branch: ${BRANCH}${NC}"

# Determine deployment type
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
    DEPLOY_TYPE="production"
    echo -e "${GREEN}Deploying to PRODUCTION${NC}"
else
    DEPLOY_TYPE="preview"
    echo -e "${YELLOW}Deploying to PREVIEW${NC}"
fi

# Build shared package first
echo -e "${YELLOW}Building shared package...${NC}"
pnpm --filter @prototype/shared build
echo -e "${GREEN}✓ Shared package built${NC}"

# Navigate to admin directory
cd apps/admin

# Check if already linked to Vercel project
if [ ! -f ".vercel/project.json" ]; then
    echo -e "${YELLOW}First time deployment - linking to Vercel...${NC}"
    vercel link
fi

# Check environment variables
echo -e "${YELLOW}Checking environment variables...${NC}"

# Create a temporary env check file
cat > .env.check.mjs << 'EOF'
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_API_BASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const missing = [];

// Check if .env.local exists
import { existsSync, readFileSync } from 'fs';

if (existsSync('.env.local')) {
  const env = readFileSync('.env.local', 'utf-8');
  required.forEach(key => {
    if (!env.includes(key)) {
      missing.push(key);
    }
  });
  
  if (missing.length > 0) {
    console.error('Missing:', missing.join(', '));
    process.exit(1);
  }
} else {
  console.error('No .env.local file found');
  process.exit(1);
}
EOF

if ! node .env.check.mjs 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Some environment variables may be missing${NC}"
    echo "Make sure they are set in Vercel Dashboard"
    rm .env.check.mjs
    
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        cd ../..
        exit 1
    fi
else
    echo -e "${GREEN}✓ Environment variables checked${NC}"
fi
rm -f .env.check.mjs

# Run local build to catch errors
echo -e "${YELLOW}Running local build test...${NC}"
if pnpm build; then
    echo -e "${GREEN}✓ Local build successful${NC}"
else
    echo -e "${RED}❌ Local build failed${NC}"
    cd ../..
    exit 1
fi

# Deploy to Vercel
echo -e "${YELLOW}Deploying to Vercel...${NC}"

if [ "$DEPLOY_TYPE" = "production" ]; then
    # Production deployment
    vercel --prod --yes
    DEPLOYMENT_URL=$(vercel ls --json | jq -r '.[0].url')
else
    # Preview deployment
    vercel --yes
    DEPLOYMENT_URL=$(vercel ls --json | jq -r '.[0].url')
fi

# Get deployment info
if [ ! -z "$DEPLOYMENT_URL" ] && [ "$DEPLOYMENT_URL" != "null" ]; then
    echo ""
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo -e "URL: ${GREEN}https://${DEPLOYMENT_URL}${NC}"
    echo ""
    
    # Test the deployment
    echo "Testing deployment..."
    sleep 5
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DEPLOYMENT_URL}")
    
    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "307" ]; then
        echo -e "${GREEN}✓ Application is responding${NC}"
    else
        echo -e "${YELLOW}⚠️  Application returned status code: ${HTTP_STATUS}${NC}"
        echo "This might be normal if authentication is required"
    fi
else
    echo -e "${GREEN}Deployment initiated${NC}"
    echo "Check status with: vercel ls"
fi

# Return to root
cd ../..

echo ""
echo -e "${GREEN}📝 Next steps:${NC}"
echo "1. Check deployment: vercel ls"
echo "2. View logs: vercel logs"
echo "3. Open dashboard: vercel"
echo "4. Set up custom domain: vercel domains"

if [ "$DEPLOY_TYPE" = "preview" ]; then
    echo ""
    echo -e "${YELLOW}Note: This was a preview deployment${NC}"
    echo "To deploy to production, merge to main branch or run:"
    echo "vercel --prod"
fi

# Option to open in browser
read -p "Open deployment in browser? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ ! -z "$DEPLOYMENT_URL" ]; then
        open "https://${DEPLOYMENT_URL}" 2>/dev/null || xdg-open "https://${DEPLOYMENT_URL}" 2>/dev/null || echo "Please open: https://${DEPLOYMENT_URL}"
    else
        vercel open
    fi
fi