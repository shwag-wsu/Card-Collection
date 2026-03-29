-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "game" TEXT NOT NULL,
    "sport" TEXT,
    "year" INTEGER,
    "manufacturer" TEXT,
    "set_name" TEXT NOT NULL,
    "subset_name" TEXT,
    "player_name" TEXT,
    "character_name" TEXT,
    "card_number" TEXT,
    "parallel" TEXT,
    "variation" TEXT,
    "language" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "card_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "purchase_price" DECIMAL(12,2),
    "purchase_date" DATE,
    "estimated_raw_value" DECIMAL(12,2),
    "ownership_status" TEXT NOT NULL DEFAULT 'owned',
    "storage_box" TEXT,
    "notes" TEXT,
    "front_image_path" TEXT,
    "back_image_path" TEXT,
    "front_thumb_path" TEXT,
    "back_thumb_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_item_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "raw_low" DECIMAL(12,2),
    "raw_mid" DECIMAL(12,2),
    "raw_high" DECIMAL(12,2),
    "grade_8_value" DECIMAL(12,2),
    "grade_9_value" DECIMAL(12,2),
    "grade_10_value" DECIMAL(12,2),
    "confidence" DECIMAL(5,2),
    "source_note" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_estimates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_item_id" UUID NOT NULL,
    "analyzer_version" TEXT NOT NULL,
    "image_quality_score" DECIMAL(5,2),
    "blur_flag" BOOLEAN NOT NULL DEFAULT false,
    "glare_flag" BOOLEAN NOT NULL DEFAULT false,
    "skew_flag" BOOLEAN NOT NULL DEFAULT false,
    "centering_score" DECIMAL(5,2),
    "corners_score" DECIMAL(5,2),
    "edges_score" DECIMAL(5,2),
    "surface_score" DECIMAL(5,2),
    "predicted_grade_low" DECIMAL(4,1),
    "predicted_grade_high" DECIMAL(4,1),
    "confidence" DECIMAL(5,2),
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_item_id" UUID NOT NULL,
    "grader" TEXT NOT NULL DEFAULT 'PSA',
    "service_level" TEXT NOT NULL,
    "declared_value" DECIMAL(12,2),
    "grading_fee" DECIMAL(12,2) NOT NULL,
    "shipping_to_grader" DECIMAL(12,2),
    "return_shipping" DECIMAL(12,2),
    "insurance_cost" DECIMAL(12,2),
    "other_costs" DECIMAL(12,2),
    "total_cost" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roi_scenarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_item_id" UUID NOT NULL,
    "grade_label" TEXT NOT NULL,
    "expected_sale_price" DECIMAL(12,2) NOT NULL,
    "grading_cost" DECIMAL(12,2) NOT NULL,
    "selling_fee_pct" DECIMAL(5,2),
    "selling_fee_amount" DECIMAL(12,2),
    "net_after_fees" DECIMAL(12,2) NOT NULL,
    "profit_vs_raw_sale" DECIMAL(12,2),
    "profit_vs_total_cost_basis" DECIMAL(12,2),
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roi_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cards_game_set_name_idx" ON "cards"("game", "set_name");

-- CreateIndex
CREATE INDEX "cards_player_name_idx" ON "cards"("player_name");

-- CreateIndex
CREATE INDEX "cards_character_name_idx" ON "cards"("character_name");

-- CreateIndex
CREATE INDEX "cards_year_card_number_idx" ON "cards"("year", "card_number");

-- CreateIndex
CREATE INDEX "collection_items_card_id_idx" ON "collection_items"("card_id");

-- CreateIndex
CREATE INDEX "collection_items_ownership_status_idx" ON "collection_items"("ownership_status");

-- CreateIndex
CREATE INDEX "price_snapshots_collection_item_id_idx" ON "price_snapshots"("collection_item_id");

-- CreateIndex
CREATE INDEX "price_snapshots_provider_idx" ON "price_snapshots"("provider");

-- CreateIndex
CREATE INDEX "price_snapshots_captured_at_idx" ON "price_snapshots"("captured_at");

-- CreateIndex
CREATE INDEX "grade_estimates_collection_item_id_idx" ON "grade_estimates"("collection_item_id");

-- CreateIndex
CREATE INDEX "grade_estimates_created_at_idx" ON "grade_estimates"("created_at");

-- CreateIndex
CREATE INDEX "grading_quotes_collection_item_id_idx" ON "grading_quotes"("collection_item_id");

-- CreateIndex
CREATE INDEX "roi_scenarios_collection_item_id_idx" ON "roi_scenarios"("collection_item_id");

-- CreateIndex
CREATE INDEX "roi_scenarios_calculated_at_idx" ON "roi_scenarios"("calculated_at");

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "collection_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_estimates" ADD CONSTRAINT "grade_estimates_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "collection_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_quotes" ADD CONSTRAINT "grading_quotes_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "collection_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roi_scenarios" ADD CONSTRAINT "roi_scenarios_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "collection_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
