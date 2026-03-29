from __future__ import annotations

import hashlib
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Card Collection Analyzer", version="0.1.0")

ANALYZER_VERSION = "mock-analyzer-v0.2.0"


class AnalyzeRequest(BaseModel):
    collection_item_id: str
    front_image_path: str | None = None
    back_image_path: str | None = None


class NormalizeResponse(BaseModel):
    collection_item_id: str
    normalized: bool
    front_normalized_path: str | None = None
    back_normalized_path: str | None = None
    message: str


class QualityResponse(BaseModel):
    collection_item_id: str
    image_quality_score: float = Field(..., ge=0, le=100)
    blur_flag: bool
    glare_flag: bool
    skew_flag: bool
    crop_flag: bool
    notes: list[str]


class CardImageAnalysisResponse(BaseModel):
    collection_item_id: str
    analyzer_version: str
    image_quality_score: float = Field(..., ge=0, le=100)
    blur_flag: bool
    glare_flag: bool
    skew_flag: bool
    centering_score: float = Field(..., ge=1, le=10)
    corners_score: float = Field(..., ge=1, le=10)
    edges_score: float = Field(..., ge=1, le=10)
    surface_score: float = Field(..., ge=1, le=10)
    predicted_grade_low: float = Field(..., ge=1, le=10)
    predicted_grade_high: float = Field(..., ge=1, le=10)
    confidence: float = Field(..., ge=0, le=1)
    summary: str


def _stable_value(seed: str, low: float, high: float, decimals: int = 2) -> float:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    base = int(digest[:8], 16) / 0xFFFFFFFF
    value = low + ((high - low) * base)
    return round(value, decimals)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "analyzer",
        "version": ANALYZER_VERSION,
    }


@app.post("/analyze/normalize", response_model=NormalizeResponse)
def normalize_images(payload: AnalyzeRequest) -> NormalizeResponse:
    front_normalized = (
        payload.front_image_path.replace("/originals/", "/processed/")
        if payload.front_image_path
        else None
    )
    back_normalized = (
        payload.back_image_path.replace("/originals/", "/processed/")
        if payload.back_image_path
        else None
    )

    return NormalizeResponse(
        collection_item_id=payload.collection_item_id,
        normalized=True,
        front_normalized_path=front_normalized,
        back_normalized_path=back_normalized,
        message="Images normalized to analysis-ready orientation and contrast.",
    )


@app.post("/analyze/quality", response_model=QualityResponse)
def quality_check(payload: AnalyzeRequest) -> QualityResponse:
    quality_score = _stable_value(f"quality:{payload.collection_item_id}", 68, 96)
    blur_flag = quality_score < 74
    glare_flag = _stable_value(f"glare:{payload.collection_item_id}", 0, 1, 3) > 0.86
    skew_flag = _stable_value(f"skew:{payload.collection_item_id}", 0, 1, 3) > 0.88
    crop_flag = _stable_value(f"crop:{payload.collection_item_id}", 0, 1, 3) > 0.91

    notes: list[str] = []
    if blur_flag:
        notes.append("Detected slight softness around fine print and border edges.")
    if glare_flag:
        notes.append("Mild reflective hotspot detected on card surface.")
    if skew_flag:
        notes.append("Perspective skew detected; consider a flatter capture angle.")
    if crop_flag:
        notes.append("Card border may be clipped in one or more corners.")
    if not notes:
        notes.append("No major capture issues detected.")

    return QualityResponse(
        collection_item_id=payload.collection_item_id,
        image_quality_score=quality_score,
        blur_flag=blur_flag,
        glare_flag=glare_flag,
        skew_flag=skew_flag,
        crop_flag=crop_flag,
        notes=notes,
    )


@app.post("/analyze/card-images", response_model=CardImageAnalysisResponse)
def analyze_card_images(payload: AnalyzeRequest) -> CardImageAnalysisResponse:
    centering = _stable_value(f"centering:{payload.collection_item_id}", 6.2, 9.3, 1)
    corners = _stable_value(f"corners:{payload.collection_item_id}", 6.0, 9.1, 1)
    edges = _stable_value(f"edges:{payload.collection_item_id}", 6.1, 9.2, 1)
    surface = _stable_value(f"surface:{payload.collection_item_id}", 6.0, 9.4, 1)

    quality_score = round(((centering + corners + edges + surface) / 4) * 10, 1)

    blur_flag = quality_score < 74
    glare_flag = _stable_value(f"glare:{payload.collection_item_id}", 0, 1, 3) > 0.85
    skew_flag = _stable_value(f"skew:{payload.collection_item_id}", 0, 1, 3) > 0.89

    weighted = (centering * 0.3) + (corners * 0.25) + (edges * 0.2) + (surface * 0.25)
    predicted_low = max(1.0, round(weighted - 0.6, 1))
    predicted_high = min(10.0, round(weighted + 0.4, 1))
    if predicted_high < predicted_low:
        predicted_high = predicted_low

    confidence = _stable_value(f"confidence:{payload.collection_item_id}", 0.56, 0.89, 2)

    return CardImageAnalysisResponse(
        collection_item_id=payload.collection_item_id,
        analyzer_version=ANALYZER_VERSION,
        image_quality_score=quality_score,
        blur_flag=blur_flag,
        glare_flag=glare_flag,
        skew_flag=skew_flag,
        centering_score=centering,
        corners_score=corners,
        edges_score=edges,
        surface_score=surface,
        predicted_grade_low=predicted_low,
        predicted_grade_high=predicted_high,
        confidence=confidence,
        summary=(
            "AI Pre-Grade Estimate generated from image-only signals. "
            "Advisory only and not an official PSA grade."
        ),
    )
