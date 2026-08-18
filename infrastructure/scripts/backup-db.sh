#!/usr/bin/env bash
set -e

# Load project directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Define backup paths
BACKUP_DIR="${PROJECT_DIR}/backups/database"
mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/newsflow_backup_${TIMESTAMP}.sql.gz"

echo "=== Starting database backup ==="

# Check if postgres container is running
CONTAINER_NAME="newsflow-postgres-prod"
if [ "$(docker ps -q -f name=${CONTAINER_NAME})" ]; then
  echo ">>> Dumping from running production docker container: ${CONTAINER_NAME}..."
  docker exec -t "${CONTAINER_NAME}" pg_dump -U postgres -d newsflow | gzip > "${BACKUP_FILE}"
else
  # Fallback to local dev postgres if running locally
  DEV_CONTAINER="newsflow-postgres"
  if [ "$(docker ps -q -f name=${DEV_CONTAINER})" ]; then
    echo ">>> Dumping from running dev docker container: ${DEV_CONTAINER}..."
    docker exec -t "${DEV_CONTAINER}" pg_dump -U postgres -d newsflow | gzip > "${BACKUP_FILE}"
  else
    echo "ERROR: No postgres docker container found running!"
    exit 1
  fi
fi

echo ">>> Backup saved to: ${BACKUP_FILE}"
echo ">>> File size: $(du -sh "${BACKUP_FILE}" | cut -f1)"

# Prune old backups (keep only last 7 days)
echo ">>> Pruning old backups (keeping last 7)..."
find "${BACKUP_DIR}" -name "newsflow_backup_*.sql.gz" -type f | sort -r | tail -n +8 | xargs -r rm

echo "=== Backup completed successfully ==="
