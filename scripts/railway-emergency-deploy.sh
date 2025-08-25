#!/bin/bash

# Emergency Railway Deploy - Uses Docker instead of Nixpacks

echo "🚨 Emergency Railway Deployment"
echo "=============================="

# Create a simple package.json at root if it doesn't exist
if [ ! -f "package.json" ]; then
  echo '{
    "name": "ai-chat-monorepo",
    "private": true,
    "engines": {
      "node": ">=20.0.0"
    },
    "scripts": {
      "install": "pnpm install",
      "build": "pnpm --filter @prototype/shared build && pnpm --filter @prototype/api build",
      "start": "cd apps/api && pnpm start"
    }
  }' > package.json
fi

# Deploy using Docker
echo "Deploying with Docker..."
railway up --detach

echo "✅ Deployment initiated"
echo "Check logs: railway logs"