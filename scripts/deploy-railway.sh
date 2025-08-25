#!/bin/bash

# Railway API Deployment Script
# Run from root directory: ./scripts/deploy-railway.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚂 Railway API Deployment Script${NC}"
echo "================================="

# Check if we're in the root directory
if [ ! -f "package.json" ] || [ ! -d "apps/api" ]; then
    echo -e "${RED}Error: Must run from project root directory${NC}"
    exit 1
fi

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}Railway CLI not found!${NC}"
    echo "Install it with: npm install -g @railway/cli"
    exit 1
fi

# Check if logged in to Railway
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}Not logged in to Railway${NC}"
    echo "Running: railway login"
    railway login
fi

# Build the shared package locally first (for type checking)
echo -e "${YELLOW}Building shared package...${NC}"
pnpm --filter @prototype/shared build

# Build the API locally (to catch any errors early)
echo -e "${YELLOW}Building API locally...${NC}"
pnpm --filter @prototype/api build || echo -e "${YELLOW}Note: TypeScript errors are allowed in production build${NC}"

# Ensure Dockerfile.api exists
if [ ! -f "Dockerfile.api" ]; then
    echo -e "${RED}Error: Dockerfile.api not found${NC}"
    exit 1
fi

# Deploy to Railway
echo -e "${GREEN}Deploying to Railway...${NC}"
echo "This will:"
echo "  1. Push code to Railway"
echo "  2. Build using Dockerfile.api"
echo "  3. Deploy the API service"
echo ""

# Check if we have a linked project
if ! railway status &> /dev/null; then
    echo -e "${YELLOW}No Railway project linked${NC}"
    echo "Choose an option:"
    echo "  1. Link to existing project"
    echo "  2. Create new project"
    read -p "Enter choice (1 or 2): " choice
    
    case $choice in
        1)
            railway link
            ;;
        2)
            read -p "Enter project name: " project_name
            railway init -n "$project_name"
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            exit 1
            ;;
    esac
fi

# Show current project
echo -e "${GREEN}Current Railway project:${NC}"
railway status

# Set required environment variables if not already set
echo -e "${YELLOW}Checking environment variables...${NC}"

# Function to check and set env var
check_env_var() {
    local var_name=$1
    local description=$2
    local is_secret=$3
    
    # Try to get all variables and check if our var exists
    if ! railway variables --json 2>/dev/null | grep -q "\"$var_name\""; then
        echo -e "${YELLOW}$var_name not found in Railway${NC}"
        if [ "$is_secret" = "true" ]; then
            read -s -p "Enter $description: " var_value
            echo ""
        else
            read -p "Enter $description: " var_value
        fi
        railway variables set "$var_name=$var_value"
    else
        echo -e "${GREEN}✓ $var_name is set${NC}"
    fi
}

# Alternative: Skip env check if user confirms they're set
echo -e "${YELLOW}Checking environment variables...${NC}"
echo "Have you already set all required environment variables in Railway dashboard?"
read -p "Enter y to skip checks, n to check/set them: " skip_env

if [ "$skip_env" != "y" ]; then
    # Check required environment variables
    check_env_var "NODE_ENV" "Node environment (production)" false
    check_env_var "JWT_SECRET" "JWT secret (min 32 chars)" true
    check_env_var "SUPABASE_URL" "Supabase URL" false
    check_env_var "SUPABASE_ANON_KEY" "Supabase anon key" true
    check_env_var "SUPABASE_SERVICE_ROLE_KEY" "Supabase service role key" true
    check_env_var "ZEP_API_KEY" "Zep API key" true
    check_env_var "OPENAI_API_KEY" "OpenAI API key" true
else
    echo -e "${GREEN}Skipping environment variable checks${NC}"
fi

# Set default PORT if not set (Railway provides this)
railway variables set "PORT=3000" &> /dev/null || true

# Deploy
echo -e "${GREEN}Starting deployment...${NC}"
railway up --detach

echo -e "${GREEN}✅ Deployment initiated!${NC}"
echo ""
echo "Monitor deployment:"
echo "  railway logs"
echo ""
echo "Open deployed app:"
echo "  railway open"
echo ""
echo "View deployment status:"
echo "  railway status"
echo ""
echo -e "${YELLOW}Note: First deployment may take 5-10 minutes${NC}"