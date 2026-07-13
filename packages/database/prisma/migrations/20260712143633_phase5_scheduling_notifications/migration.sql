-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('EDITORIAL', 'PUBLISHING', 'FACEBOOK_CONNECTION', 'SOURCE_HEALTH', 'AI_USAGE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SENT', 'RETRYING', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PublishJobStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "PublishJobStatus" ADD VALUE 'DUE';
ALTER TYPE "PublishJobStatus" ADD VALUE 'RESULT_UNKNOWN';
ALTER TYPE "PublishJobStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "publish_jobs" ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_by_user_id" TEXT,
ADD COLUMN     "execution_deadline_utc" TIMESTAMP(3),
ADD COLUMN     "lock_owner" TEXT,
ADD COLUMN     "locked_at" TIMESTAMP(3),
ADD COLUMN     "next_retry_at" TIMESTAMP(3),
ADD COLUMN     "notification_state_json" JSONB,
ADD COLUMN     "publish_at_utc" TIMESTAMP(3),
ADD COLUMN     "requested_local_time" TEXT,
ADD COLUMN     "requested_timezone" TEXT,
ADD COLUMN     "rescheduled_at" TIMESTAMP(3),
ADD COLUMN     "schedule_created_at" TIMESTAMP(3),
ADD COLUMN     "schedule_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "editorial_events_json" JSONB NOT NULL DEFAULT '{}',
    "publishing_events_json" JSONB NOT NULL DEFAULT '{}',
    "operational_events_json" JSONB NOT NULL DEFAULT '{}',
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" TEXT NOT NULL DEFAULT '22:00',
    "quiet_hours_end" TEXT NOT NULL DEFAULT '07:00',
    "quiet_hours_timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "action_url" TEXT,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "deduplication_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "metadata_json" JSONB,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "provider_message_id" TEXT,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "next_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'vi',
    "version" INTEGER NOT NULL DEFAULT 1,
    "subject_template" TEXT,
    "body_template" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deprecated_at" TIMESTAMP(3),

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "correlation_id" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_workspace_id_user_id_key" ON "notification_preferences"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_deduplication_key_key" ON "notifications"("deduplication_key");

-- CreateIndex
CREATE INDEX "notifications_workspace_id_user_id_status_created_at_idx" ON "notifications"("workspace_id", "user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_workspace_id_category_created_at_idx" ON "notifications"("workspace_id", "category", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_workspace_id_status_next_attempt_at_idx" ON "notification_deliveries"("workspace_id", "status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_notification_id_user_id_channel_key" ON "notification_deliveries"("notification_id", "user_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_template_key_channel_language_versio_key" ON "notification_templates"("template_key", "channel", "language", "version");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_workspace_id_aggregate_type_aggregate_id_idx" ON "outbox_events"("workspace_id", "aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "publish_jobs_status_publish_at_utc_idx" ON "publish_jobs"("status", "publish_at_utc");

-- CreateIndex
CREATE INDEX "publish_jobs_workspace_id_status_publish_at_utc_idx" ON "publish_jobs"("workspace_id", "status", "publish_at_utc");

-- CreateIndex
CREATE INDEX "publish_jobs_workspace_id_page_connection_id_publish_at_utc_idx" ON "publish_jobs"("workspace_id", "page_connection_id", "publish_at_utc");

-- CreateIndex
CREATE INDEX "publish_jobs_next_retry_at_idx" ON "publish_jobs"("next_retry_at");

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
