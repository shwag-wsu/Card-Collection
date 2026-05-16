ALTER TABLE "grade_estimates"
ADD COLUMN "grading_status" TEXT,
ADD COLUMN "gradable" BOOLEAN,
ADD COLUMN "predicted_grade" DECIMAL(4,1),
ADD COLUMN "detected_issues" JSONB,
ADD COLUMN "limitations" JSONB,
ADD COLUMN "retake_guidance" JSONB,
ADD COLUMN "raw_ai_response" JSONB;
