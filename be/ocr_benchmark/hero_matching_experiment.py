from __future__ import annotations

"""
Experimental Team hero portrait matcher.

This stays isolated from production until the crop geometry and reference-image
matching are validated on the fixed Team benchmark.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np

from orca_ocr.engine import ROI, _crop, _team_hero_row_centers


@dataclass
class HeroCrop:
    team: str
    slot: int
    image: np.ndarray


def crop_team_heroes(img: np.ndarray) -> list[HeroCrop]:
    board = _crop(img, ROI["team_board"])
    h, w = board.shape[:2]
    y_rows = _team_hero_row_centers(board)
    if len(y_rows) < 10:
        return []

    gap = float(np.median(np.diff(y_rows[:5])))
    half_h = max(10, int(gap * 0.42))

    x1 = int(w * 0.034)
    x2 = int(w * 0.112)

    crops: list[HeroCrop] = []
    for idx, y in enumerate(y_rows[:10]):
        y1 = max(0, int(round(y)) - half_h)
        y2 = min(h, int(round(y)) + half_h)
        crop = board[y1:y2, x1:x2]
        crops.append(
            HeroCrop(
                team="blue" if idx < 5 else "red",
                slot=(idx % 5) + 1,
                image=crop,
            )
        )
    return crops


def _normalize_portrait(image: np.ndarray, size: int = 96) -> np.ndarray:
    if image is None or image.size == 0:
        return np.zeros((size, size, 3), dtype=np.uint8)
    h, w = image.shape[:2]
    side = min(h, w)
    x1 = max(0, (w - side) // 2)
    y1 = max(0, (h - side) // 2)
    square = image[y1:y1 + side, x1:x1 + side]
    return cv2.resize(square, (size, size), interpolation=cv2.INTER_AREA)


def _phash(image: np.ndarray) -> np.ndarray:
    image = _normalize_portrait(image, 96)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    gray = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA)
    dct = cv2.dct(np.float32(gray))
    low = dct[:8, :8]
    med = float(np.median(low[1:, :]))
    return (low > med).astype(np.uint8).reshape(-1)


def phash_distance(a: np.ndarray, b: np.ndarray) -> int:
    return int(np.count_nonzero(_phash(a) != _phash(b)))


def _hist_distance(a: np.ndarray, b: np.ndarray) -> float:
    a = cv2.cvtColor(_normalize_portrait(a), cv2.COLOR_BGR2HSV)
    b = cv2.cvtColor(_normalize_portrait(b), cv2.COLOR_BGR2HSV)
    ha = cv2.calcHist([a], [0, 1], None, [24, 24], [0, 180, 0, 256])
    hb = cv2.calcHist([b], [0, 1], None, [24, 24], [0, 180, 0, 256])
    cv2.normalize(ha, ha)
    cv2.normalize(hb, hb)
    return float(cv2.compareHist(ha, hb, cv2.HISTCMP_BHATTACHARYYA))


def _orb_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a = cv2.cvtColor(_normalize_portrait(a), cv2.COLOR_BGR2GRAY)
    b = cv2.cvtColor(_normalize_portrait(b), cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(nfeatures=180, fastThreshold=8)
    ka, da = orb.detectAndCompute(a, None)
    kb, db = orb.detectAndCompute(b, None)
    if da is None or db is None or len(ka) < 4 or len(kb) < 4:
        return 0.0
    matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(da, db)
    if not matches:
        return 0.0
    matches = sorted(matches, key=lambda m: m.distance)
    keep = matches[: min(24, len(matches))]
    good = [m for m in keep if m.distance <= 52]
    return min(1.0, len(good) / 12.0)


def load_reference_library(root: Path) -> dict[str, list[np.ndarray]]:
    library: dict[str, list[np.ndarray]] = {}
    if not root.exists():
        return library

    for hero_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        samples: list[np.ndarray] = []
        for path in sorted(hero_dir.iterdir()):
            if path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
                continue
            img = cv2.imread(str(path))
            if img is not None:
                samples.append(img)
        if samples:
            library[hero_dir.name] = samples
    return library


def match_hero(
    crop: np.ndarray,
    library: dict[str, list[np.ndarray]],
) -> tuple[str | None, float, int | None]:
    if not library:
        return None, 0.0, None

    scored: list[tuple[float, int, str]] = []
    for hero_id, refs in library.items():
        best_score = -1.0
        best_phash = 64
        for ref in refs:
            pd = phash_distance(crop, ref)
            phash_sim = max(0.0, 1.0 - pd / 64.0)
            hist_sim = max(0.0, 1.0 - _hist_distance(crop, ref))
            orb_sim = _orb_similarity(crop, ref)
            score = orb_sim * 0.55 + hist_sim * 0.25 + phash_sim * 0.20
            if score > best_score:
                best_score = score
                best_phash = pd
        scored.append((best_score, best_phash, hero_id))

    scored.sort(reverse=True)
    best_score, best_dist, best_id = scored[0]
    second_score = scored[1][0] if len(scored) > 1 else 0.0
    margin = max(0.0, best_score - second_score)
    confidence = min(0.99, max(0.0, best_score * 0.8 + margin * 1.6))
    return best_id, round(confidence, 3), best_dist


def build_montage(crops: Iterable[HeroCrop], tile: int = 112) -> np.ndarray | None:
    rendered: list[np.ndarray] = []
    for item in crops:
        img = cv2.resize(item.image, (tile, tile), interpolation=cv2.INTER_AREA)
        canvas = cv2.copyMakeBorder(img, 24, 0, 0, 0, cv2.BORDER_CONSTANT, value=(0, 0, 0))
        cv2.putText(
            canvas,
            f"{item.team} {item.slot}",
            (4, 17),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )
        rendered.append(canvas)

    if not rendered:
        return None

    while len(rendered) % 5:
        rendered.append(np.zeros_like(rendered[0]))

    rows = [cv2.hconcat(rendered[i:i + 5]) for i in range(0, len(rendered), 5)]
    return cv2.vconcat(rows)
