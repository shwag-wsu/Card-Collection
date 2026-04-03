-- CreateTable
CREATE TABLE "grading_runs" (
    "id" UUID NOT NULL,
    "collection_item_id" UUID,
    "request_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grading_runs_collection_item_id_idx" ON "grading_runs"("collection_item_id");

-- CreateIndex
CREATE INDEX "grading_runs_request_id_idx" ON "grading_runs"("request_id");

-- CreateIndex
CREATE INDEX "grading_runs_status_idx" ON "grading_runs"("status");

-- CreateIndex
CREATE INDEX "grading_runs_created_at_idx" ON "grading_runs"("created_at");

-- AddForeignKey
ALTER TABLE "grading_runs" ADD CONSTRAINT "grading_runs_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "collection_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
