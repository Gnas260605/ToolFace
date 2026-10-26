-- AlterEnum
ALTER TYPE "PromptTaskType" ADD VALUE 'VIDEO_PLANNING';

-- CreateEnum
CREATE TYPE "VideoJobStatus" AS ENUM ('QUEUED', 'PLANNING', 'RENDERING', 'READY', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "video_jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "script" TEXT NOT NULL,
    "request" TEXT,
    "style" TEXT,
    "aspects_json" JSONB NOT NULL,
    "voice" TEXT,
    "options_json" JSONB,
    "image_keys_json" JSONB NOT NULL,
    "music_key" TEXT,
    "plan_json" JSONB,
    "plan_revision" INTEGER NOT NULL DEFAULT 0,
    "planner_id" TEXT,
    "status" "VideoJobStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "render_kind" TEXT,
    "error_message" TEXT,
    "preview_json" JSONB,
    "preview_revision" INTEGER,
    "outputs_json" JSONB,
    "outputs_revision" INTEGER,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "video_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_jobs_workspace_id_created_at_idx" ON "video_jobs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "video_jobs_status_updated_at_idx" ON "video_jobs"("status", "updated_at");
