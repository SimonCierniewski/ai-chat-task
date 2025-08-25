#!/bin/bash
# Build script for Vercel deployment of admin app

set -e

echo "🔨 Building admin app for Vercel deployment..."

# Install dependencies if not present
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install --frozen-lockfile
fi

# Build shared package first
echo "🔧 Building shared package..."
cd packages/shared
pnpm run build
cd ../..

# Build admin app
echo "🚀 Building admin app..."
cd apps/admin
pnpm run build
cd ../..

echo "✅ Build complete!"