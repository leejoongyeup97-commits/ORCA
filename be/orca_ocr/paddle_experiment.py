from __future__ import annotations

import re
import time
from typing import Any

import cv2
import numpy as np

from .engine import ROI, _crop, extract_team


_PADDLE = None


def _get_paddle():
    global _PADDLE
    if _PADDLE is None:
        from paddleocr import PaddleOCR
        _PADDLE = PaddleOCR(
            lang="en",
            use_angle_cls=False,
            show_log=False,
            enable_mkldnn=False,
            cpu_threads=1,
        )
    return _PADDLE


def _digits(text: str) -> int | None:
    value = re.sub(r"\D", "", text or "")
    return int(value) if value else None


def _paddle_cell(cell: np.ndarray) -> tuple[int | None, float]:
    if cell is None or cell.size == 0:
        return None, 0.0
    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY) if len(cell.shape) == 3 else cell
    gray = cv2.resize(gray, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)
    rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)

    result = _get_paddle().ocr(rgb, cls=False)
    candidates: list[tuple[int, float]] = []
    for group in result or []:
        for item in group or []:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            rec = item[1]
            if not isinstance(rec, (list, tuple)) or len(rec) < 2:
                continue
            text, score = rec[0], rec[1]
            value = _digits(str(text))
            if value is not None:
                candidates.append((value, float(score)))
    if not candidates:
        return None, 0.0
    return max(candidates, key=lambda item: item[1])


def extract_team_paddle(img: np.ndarray) -> dict[str, Any]:
    """Experimental Team reader. Keep Tesseract output and replace numeric cells with PaddleOCR."""
    t0 = time.perf_counter()
    base = extract_team(img)
    board = _crop(img, ROI["team_board"])
    rows = base.get("players", [])
    if len(rows) != 10:
        return {**base, "ocr_engine": "paddle-experiment", "paddle_error": "team rows != 10"}

    h, w = board.shape[:2]
    row_centers = [v * h for v in [0.090,0.180,0.270,0.360,0.450,0.525,0.615,0.705,0.795,0.885]]
    columns = {"elims":0.475,"assists":0.545,"deaths":0.615,"damage":0.710,"healing":0.825,"mitigation":0.945}
    half_h = max(8, int(h * 0.028))

    for row, y in zip(rows, row_centers):
        row.setdefault("confidence", {})
        for key, nx in columns.items():
            half_w = int(w * (0.032 if key in ("elims","assists","deaths") else 0.050))
            cx = int(nx * w)
            cell = board[max(0,int(y)-half_h):min(h,int(y)+half_h),
                         max(0,cx-half_w):min(w,cx+half_w)]
            value, confidence = _paddle_cell(cell)
            if value is not None:
                row[key] = value
                row["confidence"][key] = round(confidence, 2)

    base["ocr_engine"] = "paddle-experiment"
    base["paddle_elapsed_seconds"] = round(time.perf_counter() - t0, 2)
    return base
