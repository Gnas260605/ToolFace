-- CreateEnum
CREATE TYPE "FactSheetStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'STALE');

-- CreateEnum
CREATE TYPE "EmojiPolicy" AS ENUM ('NONE', 'LOW', 'MODERATE');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'GENERATING', 'GENERATION_FAILED', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DraftContentType" AS ENUM ('BREAKING', 'SUMMARY', 'ANALYSIS', 'RESULT', 'RUMOR', 'TRANSFER', 'MATCH_PREVIEW', 'MATCH_RECAP');

-- CreateEnum
CREATE TYPE "DraftCreatedByType" AS ENUM ('AI', 'USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVAL_REVOKED');

-- CreateEnum
CREATE TYPE "PromptTaskType" AS ENUM ('FACT_EXTRACTION', 'DRAFT_GENERATION', 'DRAFT_VERIFICATION');

-- CreateTable
CREATE TABLE "brand_profiles" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'vi',
    "tone" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "writing_rules_json" JSONB NOT NULL,
    "forbidden_phrases_json" JSONB NOT NULL,
    "default_hashtags_json" JSONB NOT NULL,
    "attribution_template" TEXT NOT NULL,
    "headline_style" TEXT NOT NULL,
    "default_post_length" INTEGER NOT NULL DEFAULT 300,
    "emoji_policy" "EmojiPolicy" NOT NULL DEFAULT 'MODERATE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fact_sheets" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "article_id" TEXT,
    "cluster_id" TEXT,
    "content_hash" TEXT NOT NULL,
    "facts_json" JSONB NOT NULL,
    "conflicts_json" JSONB,
    "uncertainty_flags_json" JSONB,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "estimated_cost_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "FactSheetStatus" NOT NULL DEFAULT 'PENDING',
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fact_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drafts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "cluster_id" TEXT,
    "primary_article_id" TEXT,
    "brand_profile_id" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "approval_revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_versions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "why_it_matters" TEXT NOT NULL,
    "discussion_question" TEXT,
    "hashtags_json" JSONB NOT NULL,
    "attribution_line" TEXT NOT NULL,
    "recommended_link" TEXT,
    "content_type" "DraftContentType" NOT NULL,
    "risk_flags_json" JSONB NOT NULL,
    "verification_json" JSONB NOT NULL,
    "similarity_score" DOUBLE PRECISION NOT NULL,
    "source_claim_ids_json" JSONB NOT NULL,
    "created_by_type" "DraftCreatedByType" NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "prompt_version" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost_minor" INTEGER,
    "currency" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_reviews" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "draft_version_id" TEXT NOT NULL,
    "reviewer_user_id" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "task_type" "PromptTaskType" NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "user_prompt_template" TEXT NOT NULL,
    "output_schema_version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deprecated_at" TIMESTAMP(3),

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_type" "PromptTaskType" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "estimated_cost_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "duration_ms" INTEGER NOT NULL,
    "metadata_json" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_policies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "require_separate_reviewer" BOOLEAN NOT NULL DEFAULT false,
    "allow_ai_verification" BOOLEAN NOT NULL DEFAULT true,
    "block_high_risk_submission" BOOLEAN NOT NULL DEFAULT true,
    "maximum_similarity_score" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "maximum_quote_words" INTEGER NOT NULL DEFAULT 25,
    "default_draft_language" TEXT NOT NULL DEFAULT 'vi',
    "monthly_ai_budget_minor" INTEGER NOT NULL DEFAULT 2000,
    "monthly_ai_generation_limit" INTEGER NOT NULL DEFAULT 200,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editorial_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_profiles_workspace_id_is_default_idx" ON "brand_profiles"("workspace_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "brand_profiles_workspace_id_name_key" ON "brand_profiles"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "fact_sheets_workspace_id_content_hash_idx" ON "fact_sheets"("workspace_id", "content_hash");

-- CreateIndex
CREATE INDEX "drafts_workspace_id_status_updated_at_idx" ON "drafts"("workspace_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "drafts_workspace_id_created_by_user_id_idx" ON "drafts"("workspace_id", "created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "draft_versions_draft_id_version_number_key" ON "draft_versions"("draft_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_task_type_version_key" ON "prompt_templates"("task_type", "version");

-- CreateIndex
CREATE INDEX "ai_usage_events_workspace_id_occurred_at_idx" ON "ai_usage_events"("workspace_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_policies_workspace_id_key" ON "editorial_policies"("workspace_id");

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_brand_profile_id_fkey" FOREIGN KEY ("brand_profile_id") REFERENCES "brand_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_versions" ADD CONSTRAINT "draft_versions_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_reviews" ADD CONSTRAINT "draft_reviews_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
