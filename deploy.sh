#!/usr/bin/env bash

# Exit immediately if any command fails
set -e

echo "=== Starting NewsFlow AI Production Deployment ==="

# 1. Pull latest code
echo ">>> Pulling latest changes from main branch..."
git fetch origin
git reset --hard origin/main

# 2. Check for .env.prod file presence
if [ ! -f .env.prod ]; then
    echo "ERROR: .env.prod file not found!"
    echo "Please create a .env.prod file before deploying."
    exit 1
fi

# 3. Build and start containers
echo ">>> Rebuilding and restarting containers..."
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up --build -d

# 4. Wait for postgres to be ready
echo ">>> Waiting for Database to be fully operational..."
docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U postgres -d newsflow -t 30

# 5. Run Database Migrations
echo ">>> Executing database migrations..."
docker compose -f docker-compose.prod.yml exec -T api pnpm --filter @newsflow/database db:deploy

# 6. Seed databases if needed (optional)
# echo ">>> Seeding database..."
# docker compose -f docker-compose.prod.yml exec -T api pnpm db:seed

# 7. Docker cleanup to save disk space
echo ">>> Cleaning up old docker layers and cache..."
docker image prune -f

echo "=== Deployment Successfully Completed! ==="
docker compose -f docker-compose.prod.yml ps
