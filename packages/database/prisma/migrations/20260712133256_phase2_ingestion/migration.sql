-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OFFICIAL_RSS', 'OFFICIAL_API', 'APPROVED_WEB_PAGE', 'MANUAL_URL');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'DISABLED', 'AUTO_DISABLED', 'DELETED');

-- CreateEnum
CREATE TYPE "SourceHealthStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'FAILING', 'DISABLED');

-- CreateEnum
CREATE TYPE "SourceTrustLevel" AS ENUM ('OFFICIAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ArticleExtractionStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'SUCCESS', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ArticleRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ClusterStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PollRunStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "news_sources" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "feed_url" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL DEFAULT 'OFFICIAL_RSS',
    "language" TEXT NOT NULL DEFAULT 'vi',
    "country" TEXT NOT NULL DEFAULT 'VN',
    "category" TEXT NOT NULL DEFAULT 'general',
    "trust_level" "SourceTrustLevel" NOT NULL DEFAULT 'MEDIUM',
    "poll_interval_seconds" INTEGER NOT NULL DEFAULT 900,
    "allow_page_extraction" BOOLEAN NOT NULL DEFAULT false,
    "attribution_name" TEXT NOT NULL,
    "license_notes" TEXT,
    "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "health_status" "SourceHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "last_polled_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "next_poll_at" TIMESTAMP(3) NOT NULL,
    "etag" TEXT,
    "last_modified" TEXT,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "news_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "original_url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "author" TEXT,
    "published_at" TIMESTAMP(3),
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "language" TEXT NOT NULL DEFAULT 'vi',
    "category" TEXT NOT NULL DEFAULT 'general',
    "image_url" TEXT,
    "content_excerpt" TEXT,
    "content_hash" TEXT NOT NULL,
    "normalized_title" TEXT NOT NULL,
    "normalized_title_hash" TEXT NOT NULL,
    "extraction_status" "ArticleExtractionStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "risk_level" "ArticleRiskLevel" NOT NULL DEFAULT 'LOW',
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_clusters" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "canonical_topic" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_article_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ClusterStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_cluster_articles" (
    "cluster_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "similarity_score" DOUBLE PRECISION NOT NULL,
    "is_primary_source" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_cluster_articles_pkey" PRIMARY KEY ("cluster_id","article_id")
);

-- CreateTable
CREATE TABLE "source_poll_runs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "status" "PollRunStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "http_status" INTEGER,
    "entries_received" INTEGER NOT NULL DEFAULT 0,
    "articles_created" INTEGER NOT NULL DEFAULT 0,
    "articles_updated" INTEGER NOT NULL DEFAULT 0,
    "duplicates_skipped" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "sanitized_error_message" TEXT,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_poll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "before_values" JSONB,
    "after_values" JSONB,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_sources_workspace_id_status_idx" ON "news_sources"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "news_sources_workspace_id_next_poll_at_idx" ON "news_sources"("workspace_id", "next_poll_at");

-- CreateIndex
CREATE INDEX "news_sources_workspace_id_health_status_idx" ON "news_sources"("workspace_id", "health_status");

-- CreateIndex
CREATE UNIQUE INDEX "news_sources_workspace_id_feed_url_key" ON "news_sources"("workspace_id", "feed_url");

-- CreateIndex
CREATE INDEX "articles_workspace_id_published_at_idx" ON "articles"("workspace_id", "published_at");

-- CreateIndex
CREATE INDEX "articles_workspace_id_source_id_published_at_idx" ON "articles"("workspace_id", "source_id", "published_at");

-- CreateIndex
CREATE INDEX "articles_workspace_id_category_published_at_idx" ON "articles"("workspace_id", "category", "published_at");

-- CreateIndex
CREATE INDEX "articles_workspace_id_normalized_title_hash_idx" ON "articles"("workspace_id", "normalized_title_hash");

-- CreateIndex
CREATE INDEX "articles_workspace_id_content_hash_idx" ON "articles"("workspace_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "articles_workspace_id_canonical_url_key" ON "articles"("workspace_id", "canonical_url");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "news_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_cluster_articles" ADD CONSTRAINT "story_cluster_articles_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "story_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_cluster_articles" ADD CONSTRAINT "story_cluster_articles_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_poll_runs" ADD CONSTRAINT "source_poll_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "news_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
