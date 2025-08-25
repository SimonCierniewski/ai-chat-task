#!/bin/bash

# Railway Deploy using Docker (bypasses Nixpacks issues)

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🐳 Railway Docker Deployment${NC}"
echo "=============================="

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "apps/api" ]; then
    echo -e "${RED}❌ Please run from repository root${NC}"
    exit 1
fi

# Ensure Dockerfile exists
if [ ! -f "./Dockerfile" ]; then
    echo -e "${RED}❌ Dockerfile not found at ./Dockerfile${NC}"
    exit 1
fi

echo -e "${YELLOW}Using Docker for deployment (bypasses Nixpacks)${NC}"

# Set Railway to use Docker
export RAILWAY_DOCKERFILE_PATH="./Dockerfile"

# Deploy
echo -e "${YELLOW}Deploying to Railway with Docker...${NC}"
railway up --detach

echo -e "${GREEN}✅ Deployment initiated with Docker!${NC}"
echo ""
echo "Railway will now:"
echo "1. Build using the Dockerfile"
echo "2. Skip Nixpacks entirely"
echo "3. Deploy your containerized app"
echo ""
echo "Monitor with: railway logs"
echo "Status: railway status"
