-- CreateEnum
CREATE TYPE "FacebookConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'NEEDS_REAUTH', 'INSUFFICIENT_PERMISSION', 'REVOKED', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "PublishJobStatus" AS ENUM ('QUEUED', 'PUBLISHING', 'PUBLISHED', 'RETRYING', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PublicationType" AS ENUM ('TEXT', 'LINK', 'PHOTO');

-- CreateTable
CREATE TABLE "facebook_oauth_states" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "state_hash" TEXT NOT NULL,
    "pkce_verifier_ciphertext" TEXT,
    "pkce_verifier_iv" TEXT,
    "pkce_verifier_auth_tag" TEXT,
    "redirect_uri" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,

    CONSTRAINT "facebook_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_page_connections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT NOT NULL,
    "page_category" TEXT,
    "status" "FacebookConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "granted_tasks_json" JSONB NOT NULL,
    "granted_scopes_json" JSONB NOT NULL,
    "token_ciphertext" TEXT NOT NULL,
    "token_iv" TEXT NOT NULL,
    "token_auth_tag" TEXT NOT NULL,
    "token_key_version" TEXT NOT NULL,
    "token_fingerprint" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "last_validated_at" TIMESTAMP(3),
    "last_validation_status" TEXT,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "connected_by_user_id" TEXT NOT NULL,
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "facebook_page_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "draft_version_id" TEXT NOT NULL,
    "page_connection_id" TEXT NOT NULL,
    "status" "PublishJobStatus" NOT NULL DEFAULT 'QUEUED',
    "publication_type" "PublicationType" NOT NULL,
    "message_snapshot" TEXT NOT NULL,
    "link_snapshot" TEXT,
    "media_snapshot_json" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "facebook_post_id" TEXT,
    "facebook_permalink" TEXT,
    "last_error_category" TEXT,
    "last_error_code" TEXT,
    "last_error_subcode" TEXT,
    "last_error_message" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "publish_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_attempts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "publish_job_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "http_status" INTEGER,
    "provider_error_category" TEXT,
    "provider_error_code" TEXT,
    "provider_error_subcode" TEXT,
    "sanitized_response_json" JSONB,
    "request_correlation_id" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publish_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "facebook_oauth_states_expires_at_idx" ON "facebook_oauth_states"("expires_at");

-- CreateIndex
CREATE INDEX "facebook_page_connections_workspace_id_status_idx" ON "facebook_page_connections"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_page_connections_workspace_id_page_id_key" ON "facebook_page_connections"("workspace_id", "page_id");

-- CreateIndex
CREATE UNIQUE INDEX "publish_jobs_idempotency_key_key" ON "publish_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "publish_jobs_workspace_id_status_created_at_idx" ON "publish_jobs"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "publish_jobs_workspace_id_page_connection_id_created_at_idx" ON "publish_jobs"("workspace_id", "page_connection_id", "created_at");

-- CreateIndex
CREATE INDEX "publish_jobs_facebook_post_id_idx" ON "publish_jobs"("facebook_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "publish_attempts_publish_job_id_attempt_number_key" ON "publish_attempts"("publish_job_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_page_connection_id_fkey" FOREIGN KEY ("page_connection_id") REFERENCES "facebook_page_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_publish_job_id_fkey" FOREIGN KEY ("publish_job_id") REFERENCES "publish_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
