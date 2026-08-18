#!/usr/bin/env bash
set -e

# Load project directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

BACKUP_FILE=$1

if [ -z "${BACKUP_FILE}" ]; then
  echo "ERROR: Vui lòng cung cấp đường dẫn tới file backup."
  echo "Sử dụng: ./restore-db.sh <path_to_backup_file.sql.gz>"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "ERROR: Không tìm thấy file backup tại: ${BACKUP_FILE}"
  exit 1
fi

echo "=== Starting database restore ==="

# Check which postgres container is running
CONTAINER_NAME="newsflow-postgres-prod"
if [ "$(docker ps -q -f name=${CONTAINER_NAME})" ]; then
  ACTIVE_CONTAINER="${CONTAINER_NAME}"
else
  DEV_CONTAINER="newsflow-postgres"
  if [ "$(docker ps -q -f name=${DEV_CONTAINER})" ]; then
    ACTIVE_CONTAINER="${DEV_CONTAINER}"
  else
    echo "ERROR: No postgres docker container found running!"
    exit 1
  fi
fi

echo ">>> Active Postgres container found: ${ACTIVE_CONTAINER}"
echo ">>> Restoring schema and data from: ${BACKUP_FILE}..."

# Drop and recreate database public schema to ensure clean slate
echo ">>> Cleaning public schema in container..."
docker exec -i "${ACTIVE_CONTAINER}" psql -U postgres -d newsflow -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Gunzip and pipe directly into postgres psql
gunzip -c "${BACKUP_FILE}" | docker exec -i "${ACTIVE_CONTAINER}" psql -U postgres -d newsflow

echo "=== Restore completed successfully ==="
