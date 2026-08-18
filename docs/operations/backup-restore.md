# Database Backup and Restore Operations Guide

This guide describes how to configure, automate, and verify database backups and restores for the ToolFace (NewsFlow AI) platform.

---

## 1. Backup Automation

Automated backups are handled via the shell script `infrastructure/scripts/backup-db.sh`. It automatically connects to the running PostgreSQL container, compresses the database dump, and deletes backups older than 7 days.

### Setting up Cron Job on VPS

To automate backups on the production server, add a cron job for the `root` or deployment user:

1. Open the crontab editor:
   ```bash
   crontab -e
   ```

2. Add the following line to schedule backups daily at 02:00 AM server time:
   ```text
   0 2 * * * /bin/bash /root/ToolFaceAI/infrastructure/scripts/backup-db.sh >> /var/log/newsflow_db_backup.log 2>&1
   ```

3. Save and close the editor. Verify the job is scheduled:
   ```bash
   crontab -l
   ```

---

## 2. Emergency Restore Procedure

In the event of database corruption or data loss, you can restore from a `.sql.gz` backup file using the `infrastructure/scripts/restore-db.sh` script.

> [!CAUTION]
> A restore drops the existing `public` schema in the target database. All current data will be overwritten. Ensure you take a manual backup before performing any restore.

### Steps to Restore:

1. Locate the backup file you wish to restore (e.g., inside `backups/database/`).
2. Run the restore script, providing the path to the backup file:
   ```bash
   ./infrastructure/scripts/restore-db.sh ./backups/database/newsflow_backup_20260817_020000.sql.gz
   ```
3. Verify the output log for any SQL errors. The script will clean the `public` schema and rebuild it from the backup file.

---

## 3. Manual Backup and Restore Verification

It is a production best practice to periodically verify backup integrity:

1. Copy a backup file to your local development environment.
2. Ensure your local `newsflow-postgres` dev container is running.
3. Run the restore script locally targeting the dev database:
   ```bash
   ./infrastructure/scripts/restore-db.sh path/to/backup.sql.gz
   ```
4. Verify you can access the local UI and all tables are populated.
