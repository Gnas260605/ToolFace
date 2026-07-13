-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'CANCEL_AT_PERIOD_END', 'CANCELLED', 'EXPIRED', 'SUSPENDED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "BillingWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('AI_DRAFT_GENERATIONS', 'AI_TOKENS', 'ARTICLE_EXTRACTIONS', 'CONNECTED_PAGES', 'NEWS_SOURCES', 'TEAM_MEMBERS', 'PUBLISHED_POSTS', 'SCHEDULED_POSTS', 'BRAND_PROFILES');

-- CreateEnum
CREATE TYPE "UsageReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FeatureFlagStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeatureFlagScopeType" AS ENUM ('SYSTEM', 'PLAN', 'WORKSPACE', 'USER');

-- CreateEnum
CREATE TYPE "SettingStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SettingsHistoryScopeType" AS ENUM ('SYSTEM', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "SettingsChangeSource" AS ENUM ('UI', 'API', 'MIGRATION', 'SYSTEM', 'ROLLBACK');

-- CreateEnum
CREATE TYPE "WhiteLabelStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'HIDDEN',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "trial_eligible" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "monthly_price_minor" INTEGER,
    "annual_price_minor" INTEGER,
    "limits_json" JSONB NOT NULL,
    "features_json" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_versions" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "monthly_price_minor" INTEGER,
    "annual_price_minor" INTEGER,
    "limits_json" JSONB NOT NULL,
    "features_json" JSONB NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_customers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_customer_id" TEXT NOT NULL,
    "billing_email" TEXT,
    "billing_name" TEXT,
    "billing_country" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "plan_version_id" TEXT,
    "billing_customer_id" TEXT,
    "provider" TEXT NOT NULL,
    "provider_subscription_id" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "billing_interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "trial_started_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "grace_period_ends_at" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "suspension_reason" TEXT,
    "last_provider_sync_at" TIMESTAMP(3),
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "signature_verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "BillingWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload_hash" TEXT NOT NULL,
    "safe_payload_json" JSONB NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error_message" TEXT,

    CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "used_quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "limit_quantity" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_reservations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reservation_key" TEXT NOT NULL,
    "status" "UsageReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "FeatureFlagStatus" NOT NULL DEFAULT 'ACTIVE',
    "rollout_percentage" INTEGER NOT NULL DEFAULT 100,
    "rules_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_overrides" (
    "id" TEXT NOT NULL,
    "feature_flag_id" TEXT NOT NULL,
    "scope_type" "FeatureFlagScopeType" NOT NULL,
    "workspace_id" TEXT,
    "user_id" TEXT,
    "plan_code" TEXT,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "is_runtime_editable" BOOLEAN NOT NULL DEFAULT true,
    "requires_restart" BOOLEAN NOT NULL DEFAULT false,
    "status" "SettingStatus" NOT NULL DEFAULT 'ACTIVE',
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_settings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_change_history" (
    "id" TEXT NOT NULL,
    "scope_type" "SettingsHistoryScopeType" NOT NULL,
    "workspace_id" TEXT,
    "setting_key" TEXT NOT NULL,
    "old_value_json" JSONB,
    "new_value_json" JSONB,
    "changed_by_user_id" TEXT,
    "reason" TEXT,
    "change_source" "SettingsChangeSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_change_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "white_label_profiles" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "product_display_name" TEXT,
    "logo_object_key" TEXT,
    "favicon_object_key" TEXT,
    "accent_color" TEXT,
    "support_email" TEXT,
    "support_url" TEXT,
    "privacy_url" TEXT,
    "terms_url" TEXT,
    "email_sender_name" TEXT,
    "status" "WhiteLabelStatus" NOT NULL DEFAULT 'DISABLED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "white_label_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plans_status_is_public_sort_order_idx" ON "plans"("status", "is_public", "sort_order");

-- CreateIndex
CREATE INDEX "plan_versions_plan_id_effective_from_idx" ON "plan_versions"("plan_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "plan_versions_plan_id_version_key" ON "plan_versions"("plan_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "billing_customers_provider_provider_customer_id_key" ON "billing_customers"("provider", "provider_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_customers_workspace_id_provider_key" ON "billing_customers"("workspace_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_workspace_id_key" ON "subscriptions"("workspace_id");

-- CreateIndex
CREATE INDEX "subscriptions_workspace_id_status_idx" ON "subscriptions"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_provider_provider_subscription_id_idx" ON "subscriptions"("provider", "provider_subscription_id");

-- CreateIndex
CREATE INDEX "billing_webhook_events_provider_status_received_at_idx" ON "billing_webhook_events"("provider", "status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_webhook_events_provider_provider_event_id_key" ON "billing_webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "usage_counters_workspace_id_metric_updated_at_idx" ON "usage_counters"("workspace_id", "metric", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_workspace_id_metric_period_start_period_end_key" ON "usage_counters"("workspace_id", "metric", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "usage_reservations_workspace_id_metric_status_idx" ON "usage_reservations"("workspace_id", "metric", "status");

-- CreateIndex
CREATE INDEX "usage_reservations_expires_at_status_idx" ON "usage_reservations"("expires_at", "status");

-- CreateIndex
CREATE UNIQUE INDEX "usage_reservations_workspace_id_reservation_key_key" ON "usage_reservations"("workspace_id", "reservation_key");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "feature_flag_overrides_feature_flag_id_scope_type_workspace_idx" ON "feature_flag_overrides"("feature_flag_id", "scope_type", "workspace_id", "user_id", "plan_code");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "system_settings_category_status_idx" ON "system_settings"("category", "status");

-- CreateIndex
CREATE INDEX "workspace_settings_workspace_id_category_idx" ON "workspace_settings"("workspace_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_settings_workspace_id_key_key" ON "workspace_settings"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "settings_change_history_scope_type_workspace_id_setting_key_idx" ON "settings_change_history"("scope_type", "workspace_id", "setting_key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "white_label_profiles_workspace_id_key" ON "white_label_profiles"("workspace_id");

-- CreateIndex
CREATE INDEX "system_announcements_status_starts_at_ends_at_idx" ON "system_announcements"("status", "starts_at", "ends_at");

-- AddForeignKey
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_billing_customer_id_fkey" FOREIGN KEY ("billing_customer_id") REFERENCES "billing_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_feature_flag_id_fkey" FOREIGN KEY ("feature_flag_id") REFERENCES "feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
