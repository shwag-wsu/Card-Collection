from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Card Collection Analyzer", version="0.1.0")


class AnalyzeRequest(BaseModel):
    collection_item_id: str
    front_image_path: str | None = None
    back_image_path: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze/normalize")
def normalize_images(payload: AnalyzeRequest) -> dict:
    return {
        "collection_item_id": payload.collection_item_id,
        "normalized": True,
        "message": "Normalization stub for MVP scaffold"
    }


@app.post("/analyze/quality")
def quality_check(payload: AnalyzeRequest) -> dict:
    return {
        "collection_item_id": payload.collection_item_id,
        "blur_flag": False,
        "glare_flag": False,
        "skew_flag": False,
        "message": "Quality stub for MVP scaffold"
    }


@app.post("/analyze/card-images")
def analyze_card_images(payload: AnalyzeRequest) -> dict:
    return {
        "collection_item_id": payload.collection_item_id,
        "image_quality_score": 80.0,
        "blur_flag": False,
        "glare_flag": False,
        "skew_flag": False,
        "centering_score": 8.0,
        "corners_score": 8.0,
        "edges_score": 8.0,
        "surface_score": 8.0,
        "predicted_grade_low": 7.0,
        "predicted_grade_high": 8.0,
        "confidence": 0.5,
        "summary": "AI Pre-Grade Estimate (advisory only; not an official PSA grade)."
    }
