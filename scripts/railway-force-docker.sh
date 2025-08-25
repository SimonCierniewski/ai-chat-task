#!/bin/bash

# Force Railway to use Docker by creating a new service

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🐳 Forcing Railway to use Docker${NC}"
echo "===================================="

# Set environment variables to force Docker
echo -e "${YELLOW}Setting environment variables...${NC}"
railway variables set NIXPACKS_DISABLE=1
railway variables set RAILWAY_DOCKERFILE_PATH=Dockerfile

# Deploy with Docker
echo -e "${YELLOW}Deploying with Docker...${NC}"
railway up --detach

echo -e "${GREEN}✅ Deployment started with Docker!${NC}"
echo ""
echo "If it still uses Nixpacks, you need to:"
echo "1. Go to Railway Dashboard"
echo "2. Settings → Build Configuration"
echo "3. Change Builder to 'Dockerfile'"
echo "4. Save and Redeploy"