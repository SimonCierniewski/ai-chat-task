#!/bin/bash

# Create a new Railway service that uses Docker

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🚂 Creating New Railway Service with Docker${NC}"
echo "==========================================="

# Get current project ID
PROJECT_ID=$(railway status --json 2>/dev/null | jq -r '.projectId' || echo "")

if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}Linking to Railway project...${NC}"
    railway link
fi

echo -e "${YELLOW}Creating new service via Railway Dashboard...${NC}"
echo ""
echo -e "${RED}⚠️  Railway CLI doesn't support service creation anymore${NC}"
echo ""
echo "Please do this manually:"
echo "1. Go to Railway Dashboard"
echo "2. Click 'New Service' in your project"
echo "3. Select 'GitHub Repo' (not template)"
echo "4. Choose your repository"
echo "5. IMPORTANT: In settings, change Builder to 'Railpack'"
echo ""
echo -e "${YELLOW}Once created, deploy with:${NC}"
echo "railway up --service [new-service-name]"

echo -e "${GREEN}✅ Deployment started!${NC}"
echo ""
echo "Next steps:"
echo "1. Go to Railway Dashboard"
echo "2. Find the new 'api-docker' service"
echo "3. Set all your environment variables"
echo "4. Delete the old service when ready"
echo ""
echo "Monitor logs: railway logs --service api-docker"