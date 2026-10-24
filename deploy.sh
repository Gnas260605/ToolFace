#!/usr/bin/env bash

# Exit immediately if any command fails
set -e

echo "=== Starting NewsFlow AI Production Deployment ==="

# 1. Pull latest code
if [ -d .git ]; then
    echo ">>> Pulling latest changes from main branch..."
    git fetch origin
    git reset --hard origin/main
else
    echo ">>> No .git repository found. Skipping git pull, using uploaded files."
fi


# 2. Check for .env.prod file presence
if [ ! -f .env.prod ]; then
    echo "ERROR: .env.prod file not found!"
    echo "Please create a .env.prod file before deploying."
    exit 1
fi

# 2b. Ensure nginx TLS certificate exists (never stored in git)
SSL_DIR="infrastructure/nginx/ssl"
if [ ! -f "$SSL_DIR/nginx.key" ] || [ ! -f "$SSL_DIR/nginx.crt" ]; then
    echo ">>> No TLS certificate found, generating a self-signed one in $SSL_DIR..."
    mkdir -p "$SSL_DIR"
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
        -keyout "$SSL_DIR/nginx.key" -out "$SSL_DIR/nginx.crt" \
        -subj "/CN=${SSL_COMMON_NAME:-localhost}"
    chmod 600 "$SSL_DIR/nginx.key"
fi
mkdir -p infrastructure/nginx/logs

# 3. Build and start containers
echo ">>> Rebuilding and restarting containers..."
docker compose --env-file .env.prod -f docker-compose.prod.yml down
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d

# 4. Wait for postgres to be ready
echo ">>> Waiting for Database to be fully operational..."
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres pg_isready -U postgres -d newsflow -t 30

# 5. Run Database Migrations
echo ">>> Executing database migrations..."
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T api pnpm --filter @newsflow/database db:deploy

# 6. Seed databases if needed (optional)
# echo ">>> Seeding database..."
# docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T api pnpm db:seed

# 7. Docker cleanup to save disk space
echo ">>> Cleaning up old docker layers and cache..."
docker image prune -f

echo "=== Deployment Successfully Completed! ==="
docker compose --env-file .env.prod -f docker-compose.prod.yml ps

