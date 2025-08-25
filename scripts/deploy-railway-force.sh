#!/bin/bash

# Railway FORCE Deployment Script - Skips validation checks
# Use when you know it works locally but script has issues

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚂 Railway FORCE Deployment Script${NC}"
echo -e "${RED}⚠️  WARNING: This skips validation checks!${NC}"
echo "========================================="

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI is not installed${NC}"
    echo "Install it with: npm install -g @railway/cli"
    exit 1
fi

# Check if logged in to Railway
echo -e "${YELLOW}Checking Railway authentication...${NC}"
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}Please login to Railway:${NC}"
    railway login
fi

# Link to project if not already linked
if [ ! -f ".railway/config.json" ]; then
    echo -e "${YELLOW}Linking to Railway project...${NC}"
    railway link
fi

echo -e "${YELLOW}⚠️  Skipping all validation checks...${NC}"
echo -e "${RED}Make sure you know what you're doing!${NC}"

read -p "Are you sure you want to force deploy? (yes/no) " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
    echo "Deployment cancelled"
    exit 1
fi

# Force deploy
echo -e "${YELLOW}Force deploying to Railway...${NC}"
railway up --detach

echo -e "${GREEN}✅ Deployment initiated!${NC}"
echo ""
echo "Monitor deployment with:"
echo "  railway logs"
echo "  railway status"
echo "  railway open"

# Option to tail logs
read -p "Do you want to tail the logs now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    railway logs
fi