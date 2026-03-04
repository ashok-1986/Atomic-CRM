#!/bin/bash

# Twenty CRM - Automated Database Backup Script
# Designed to be run via cron on the Hostinger VPS
# Usage: ./backup_db.sh

set -e

# Configuration
BACKUP_DIR="/opt/twenty/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
CONTAINER_NAME="twenty-db-1"
DB_USER="postgres"
DB_NAME="default"
RETENTION_DAYS=30

echo "Starting Twenty CRM Database Backup..."

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Step 1: Create pg_dump from the active Docker container
BACKUP_FILE="$BACKUP_DIR/twenty_db_backup_$TIMESTAMP.sql.gz"
echo "Running pg_dump on container $CONTAINER_NAME..."
docker exec -t $CONTAINER_NAME pg_dumpall -c -U $DB_USER | gzip > "$BACKUP_FILE"

# Step 2: Set permissions (optional, ensuring only root/cron can read)
chmod 600 "$BACKUP_FILE"

echo "Backup created successfully at: $BACKUP_FILE"

# Step 3: Cleanup old backups (Retention Policy)
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -type f -name "twenty_db_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Step 4: Off-site Sync (Uncomment and configure your preferred provider)
# Example using AWS CLI to an S3 bucket (or Hostinger Object Storage/Backblaze)
# S3_BUCKET="s3://my-offsite-backup-bucket/twenty-crm/"
# echo "Syncing to off-site storage: $S3_BUCKET"
# aws s3 cp "$BACKUP_FILE" "$S3_BUCKET"

echo "Backup process completed successfully."
