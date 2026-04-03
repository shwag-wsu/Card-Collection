from __future__ import annotations

import math
import os
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Card Collection Analyzer", version="0.1.0")

ANALYZER_VERSION = "opencv-rules-v1.0.0"
TARGET_WIDTH = 744
TARGET_HEIGHT = 1040
MIN_CONTOUR_AREA_RATIO = 0.15
BLUR_LAPLACIAN_THRESHOLD = 110.0
GLARE_RATIO_THRESHOLD = 0.025
SKEW_DEGREES_THRESHOLD = 6.0

# The analyzer service may run in a different working directory than the web app.
# We default to the repository's upload folder but allow overrides for deployments.
STORAGE_ROOT = Path(os.getenv("STORAGE_ROOT", "/app/storage"))
ORIGINALS_DIR = STORAGE_ROOT / "originals"
PROCESSED_DIR = STORAGE_ROOT / "processed"
OVERLAYS_DIR = STORAGE_ROOT / "overlays"


class AnalyzeRequest(BaseModel):
    collection_item_id: str
    front_image_path: str | None = None
    back_image_path: str | None = None


class NormalizeResponse(BaseModel):
    collection_item_id: str
    normalized: bool
    front_normalized_path: str | None = None
    back_normalized_path: str | None = None
    front_overlay_path: str | None = None
    back_overlay_path: str | None = None
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
    crop_flag: bool
    centering_score: float = Field(..., ge=1, le=10)
    corners_score: float = Field(..., ge=1, le=10)
    edges_score: float = Field(..., ge=1, le=10)
    surface_score: float = Field(..., ge=1, le=10)
    predicted_grade_low: float = Field(..., ge=1, le=10)
    predicted_grade_high: float = Field(..., ge=1, le=10)
    confidence: float = Field(..., ge=0, le=1)
    summary: str


@dataclass
class DetectionResult:
    normalized: np.ndarray
    overlay: np.ndarray
    quality_score: float
    blur_flag: bool
    glare_flag: bool
    skew_flag: bool
    crop_flag: bool
    centering_score: float
    corners_score: float
    edges_score: float
    surface_score: float
    confidence: float
    notes: list[str]


def _resolve_image_path(image_path: str | None) -> Path | None:
    if not image_path:
        return None
    if image_path.startswith("/api/images/originals/"):
        return ORIGINALS_DIR / Path(image_path).name
    if image_path.startswith("/originals/"):
        return ORIGINALS_DIR / Path(image_path).name
    path = Path(image_path)
    return path if path.is_absolute() else STORAGE_ROOT / path


def _prepare_storage() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    OVERLAYS_DIR.mkdir(parents=True, exist_ok=True)


def _order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def _detect_card_contour(image: np.ndarray) -> tuple[np.ndarray | None, np.ndarray]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    image_area = image.shape[0] * image.shape[1]

    for contour in contours[:12]:
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        area = cv2.contourArea(approx)
        if len(approx) != 4:
            continue
        if not cv2.isContourConvex(approx):
            continue
        if area < image_area * MIN_CONTOUR_AREA_RATIO:
            continue
        return approx.reshape(4, 2).astype(np.float32), edges

    return None, edges


def _warp_card(image: np.ndarray, contour: np.ndarray) -> np.ndarray:
    rect = _order_points(contour)
    destination = np.array(
        [
            [0, 0],
            [TARGET_WIDTH - 1, 0],
            [TARGET_WIDTH - 1, TARGET_HEIGHT - 1],
            [0, TARGET_HEIGHT - 1],
        ],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(rect, destination)
    return cv2.warpPerspective(image, matrix, (TARGET_WIDTH, TARGET_HEIGHT))


def _compute_blur(normalized: np.ndarray) -> tuple[bool, float]:
    gray = cv2.cvtColor(normalized, cv2.COLOR_BGR2GRAY)
    variance = cv2.Laplacian(gray, cv2.CV_64F).var()
    return variance < BLUR_LAPLACIAN_THRESHOLD, float(variance)


def _compute_glare(normalized: np.ndarray) -> tuple[bool, float]:
    hsv = cv2.cvtColor(normalized, cv2.COLOR_BGR2HSV)
    value = hsv[:, :, 2]
    saturation = hsv[:, :, 1]
    # Simple rule: very bright + low saturation regions are likely specular glare.
    glare_mask = (value > 245) & (saturation < 40)
    ratio = float(np.mean(glare_mask))
    return ratio > GLARE_RATIO_THRESHOLD, ratio


def _compute_skew(contour: np.ndarray) -> tuple[bool, float]:
    rect = _order_points(contour)
    top_vec = rect[1] - rect[0]
    angle = math.degrees(math.atan2(float(top_vec[1]), float(top_vec[0])))
    return abs(angle) > SKEW_DEGREES_THRESHOLD, abs(angle)


def _centering_score(normalized: np.ndarray) -> float:
    gray = cv2.cvtColor(normalized, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 80, 180)

    # Heuristic assumption: a strong inner-frame/border edge exists somewhat near each side.
    col_strength = edges.sum(axis=0)
    row_strength = edges.sum(axis=1)

    w = normalized.shape[1]
    h = normalized.shape[0]
    left_idx = int(np.argmax(col_strength[int(w * 0.05) : int(w * 0.3)]) + int(w * 0.05))
    right_idx = int(np.argmax(col_strength[int(w * 0.7) : int(w * 0.95)]) + int(w * 0.7))
    top_idx = int(np.argmax(row_strength[int(h * 0.05) : int(h * 0.3)]) + int(h * 0.05))
    bottom_idx = int(np.argmax(row_strength[int(h * 0.7) : int(h * 0.95)]) + int(h * 0.7))

    left_margin = max(1.0, float(left_idx))
    right_margin = max(1.0, float(w - right_idx))
    top_margin = max(1.0, float(top_idx))
    bottom_margin = max(1.0, float(h - bottom_idx))

    horiz_imbalance = abs(left_margin - right_margin) / (left_margin + right_margin)
    vert_imbalance = abs(top_margin - bottom_margin) / (top_margin + bottom_margin)
    combined = min(1.0, (horiz_imbalance + vert_imbalance) / 2)
    return float(np.clip(10 - (combined * 9), 1, 10))


def _corner_edge_scores(normalized: np.ndarray) -> tuple[float, float]:
    gray = cv2.cvtColor(normalized, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 100, 200)
    h, w = gray.shape

    patch_h = int(h * 0.09)
    patch_w = int(w * 0.09)
    corners = [
        edges[0:patch_h, 0:patch_w],
        edges[0:patch_h, w - patch_w : w],
        edges[h - patch_h : h, 0:patch_w],
        edges[h - patch_h : h, w - patch_w : w],
    ]

    corner_density = float(np.mean([np.mean(corner > 0) for corner in corners]))

    strip = max(4, int(min(h, w) * 0.03))
    edge_regions = [
        edges[0:strip, :],
        edges[h - strip : h, :],
        edges[:, 0:strip],
        edges[:, w - strip : w],
    ]
    edge_density = float(np.mean([np.mean(region > 0) for region in edge_regions]))

    # Mapping is intentionally conservative: noisy edges/corners lower score.
    corners_score = float(np.clip(10 - (corner_density * 30), 1, 10))
    edges_score = float(np.clip(10 - (edge_density * 24), 1, 10))
    return corners_score, edges_score


def _surface_score(blur_flag: bool, glare_flag: bool, blur_var: float, glare_ratio: float) -> float:
    score = 9.4
    if blur_flag:
        score -= 2.0
    if glare_flag:
        score -= 1.8
    score -= min(1.2, glare_ratio * 24)
    if blur_var < BLUR_LAPLACIAN_THRESHOLD:
        score -= min(1.4, (BLUR_LAPLACIAN_THRESHOLD - blur_var) / BLUR_LAPLACIAN_THRESHOLD * 2)
    return float(np.clip(score, 1, 10))


def _analyze_image(image: np.ndarray) -> DetectionResult | None:
    contour, edge_preview = _detect_card_contour(image)
    if contour is None:
        return None

    normalized = _warp_card(image, contour)
    blur_flag, blur_var = _compute_blur(normalized)
    glare_flag, glare_ratio = _compute_glare(normalized)
    skew_flag, skew_degrees = _compute_skew(contour)

    centering = _centering_score(normalized)
    corners_score, edges_score = _corner_edge_scores(normalized)
    surface = _surface_score(blur_flag, glare_flag, blur_var, glare_ratio)

    crop_flag = False
    image_area = image.shape[0] * image.shape[1]
    crop_flag = cv2.contourArea(contour) < (image_area * 0.45)

    quality = float(np.clip(((centering + corners_score + edges_score + surface) / 4) * 10, 1, 100))

    notes: list[str] = []
    if blur_flag:
        notes.append("Laplacian variance is low; image appears soft.")
    if glare_flag:
        notes.append("Bright low-saturation region suggests glare hotspot(s).")
    if skew_flag:
        notes.append(f"Capture angle is tilted by ~{skew_degrees:.1f}°.")
    if crop_flag:
        notes.append("Detected contour is small relative to frame; card may be too far/cropped.")
    if not notes:
        notes.append("No major quality blockers detected for first-pass analysis.")

    confidence = float(np.clip((quality / 100) * (0.95 if not (blur_flag or glare_flag) else 0.78), 0.2, 0.95))

    overlay = image.copy()
    cv2.drawContours(overlay, [contour.astype(np.int32)], -1, (0, 255, 0), 3)
    preview = cv2.cvtColor(edge_preview, cv2.COLOR_GRAY2BGR)
    preview = cv2.resize(preview, (int(image.shape[1] * 0.28), int(image.shape[0] * 0.28)))
    overlay[0 : preview.shape[0], 0 : preview.shape[1]] = preview

    return DetectionResult(
        normalized=normalized,
        overlay=overlay,
        quality_score=quality,
        blur_flag=blur_flag,
        glare_flag=glare_flag,
        skew_flag=skew_flag,
        crop_flag=crop_flag,
        centering_score=centering,
        corners_score=corners_score,
        edges_score=edges_score,
        surface_score=surface,
        confidence=confidence,
        notes=notes,
    )


def _save_outputs(collection_item_id: str, side: str, result: DetectionResult) -> tuple[str, str]:
    _prepare_storage()
    normalized_name = f"{collection_item_id}-{side}-normalized.jpg"
    overlay_name = f"{collection_item_id}-{side}-overlay.jpg"

    normalized_disk = PROCESSED_DIR / normalized_name
    overlay_disk = OVERLAYS_DIR / overlay_name

    cv2.imwrite(str(normalized_disk), result.normalized)
    cv2.imwrite(str(overlay_disk), result.overlay)

    return f"/api/images/processed/{normalized_name}", f"/api/images/overlays/{overlay_name}"


def _analyze_path(collection_item_id: str, side: str, image_path: str | None) -> tuple[DetectionResult | None, str | None, str | None, str | None]:
    disk_path = _resolve_image_path(image_path)
    if disk_path is None or not disk_path.exists():
        return None, None, None, "Image path missing or inaccessible."

    image = cv2.imread(str(disk_path))
    if image is None:
        return None, None, None, "Image decode failed."

    result = _analyze_image(image)
    if result is None:
        return None, None, None, "Card contour could not be reliably detected."

    normalized_path, overlay_path = _save_outputs(collection_item_id, side, result)
    return result, normalized_path, overlay_path, None


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "analyzer",
        "version": ANALYZER_VERSION,
    }


@app.post("/analyze/normalize", response_model=NormalizeResponse)
def normalize_images(payload: AnalyzeRequest) -> NormalizeResponse:
    front, front_norm, front_overlay, front_err = _analyze_path(
        payload.collection_item_id,
        "front",
        payload.front_image_path,
    )
    back, back_norm, back_overlay, back_err = _analyze_path(
        payload.collection_item_id,
        "back",
        payload.back_image_path,
    )

    normalized = front is not None or back is not None
    issues = [err for err in [front_err, back_err] if err]

    return NormalizeResponse(
        collection_item_id=payload.collection_item_id,
        normalized=normalized,
        front_normalized_path=front_norm,
        back_normalized_path=back_norm,
        front_overlay_path=front_overlay,
        back_overlay_path=back_overlay,
        message=(
            "Normalization completed." if normalized else "Normalization failed: image quality too poor."
        )
        + (f" Issues: {'; '.join(issues)}" if issues else ""),
    )


@app.post("/analyze/quality", response_model=QualityResponse)
def quality_check(payload: AnalyzeRequest) -> QualityResponse:
    selected_path = payload.front_image_path or payload.back_image_path
    result, _, _, error = _analyze_path(payload.collection_item_id, "quality", selected_path)

    if result is None:
        return QualityResponse(
            collection_item_id=payload.collection_item_id,
            image_quality_score=12.0,
            blur_flag=True,
            glare_flag=False,
            skew_flag=True,
            crop_flag=True,
            notes=[f"Unable to analyze image reliably: {error or 'unknown issue'}"],
        )

    return QualityResponse(
        collection_item_id=payload.collection_item_id,
        image_quality_score=round(result.quality_score, 1),
        blur_flag=result.blur_flag,
        glare_flag=result.glare_flag,
        skew_flag=result.skew_flag,
        crop_flag=result.crop_flag,
        notes=result.notes,
    )


@app.post("/analyze/card-images", response_model=CardImageAnalysisResponse)
def analyze_card_images(payload: AnalyzeRequest) -> CardImageAnalysisResponse:
    # We prefer front image for AI pre-grade estimation since most centering/border signals are on the front.
    selected = payload.front_image_path or payload.back_image_path
    side = "front" if payload.front_image_path else "back"
    result, normalized_path, overlay_path, error = _analyze_path(payload.collection_item_id, side, selected)

    if result is None:
        return CardImageAnalysisResponse(
            collection_item_id=payload.collection_item_id,
            analyzer_version=ANALYZER_VERSION,
            image_quality_score=10,
            blur_flag=True,
            glare_flag=False,
            skew_flag=True,
            crop_flag=True,
            centering_score=3.0,
            corners_score=3.0,
            edges_score=3.0,
            surface_score=2.5,
            predicted_grade_low=1.0,
            predicted_grade_high=3.5,
            confidence=0.2,
            summary=(
                "Image quality too poor for reliable card analysis. "
                f"Reason: {error or 'unknown issue'}."
            ),
        )

    weighted = (
        (result.centering_score * 0.32)
        + (result.corners_score * 0.24)
        + (result.edges_score * 0.2)
        + (result.surface_score * 0.24)
    )

    range_half_width = 0.9 if result.confidence < 0.45 else 0.6
    predicted_low = float(np.clip(round(weighted - range_half_width, 1), 1, 10))
    predicted_high = float(np.clip(round(weighted + range_half_width, 1), 1, 10))

    return CardImageAnalysisResponse(
        collection_item_id=payload.collection_item_id,
        analyzer_version=ANALYZER_VERSION,
        image_quality_score=round(result.quality_score, 1),
        blur_flag=result.blur_flag,
        glare_flag=result.glare_flag,
        skew_flag=result.skew_flag,
        crop_flag=result.crop_flag,
        centering_score=round(result.centering_score, 1),
        corners_score=round(result.corners_score, 1),
        edges_score=round(result.edges_score, 1),
        surface_score=round(result.surface_score, 1),
        predicted_grade_low=predicted_low,
        predicted_grade_high=predicted_high,
        confidence=round(result.confidence, 2),
        summary=(
            "First-pass OpenCV rules AI pre-grade estimate (non-official PSA-like range). "
            f"Saved normalized image to {normalized_path}"
            + (f" and overlay to {overlay_path}." if overlay_path else ".")
        ),
    )
