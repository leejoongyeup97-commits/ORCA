from __future__ import annotations

"""
Benchmark hero recognition using scoreboard-native references.

For each query crop, all reference crops from the same screenshot are excluded
(leave-one-image-out). This is stricter than excluding only the exact crop and
better estimates performance on a new screenshot.
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ocr_benchmark.hero_matching_experiment import crop_team_heroes


def _norm(img: np.ndarray, size: int = 160) -> np.ndarray:
    h, w = img.shape[:2]
    x1 = int(w * 0.10)
    x2 = int(w * 0.90)
    y1 = int(h * 0.05)
    y2 = int(h * 0.95)
    roi = img[y1:y2, x1:x2]
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    return cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)


def _corr(a: np.ndarray, b: np.ndarray) -> float:
    a = _norm(a).astype(np.float32)
    b = _norm(b).astype(np.float32)
    a -= float(a.mean())
    b -= float(b.mean())
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom <= 1e-6:
        return 0.0
    return max(0.0, min(1.0, float(np.sum(a * b) / denom)))


def _sift(a: np.ndarray, b: np.ndarray) -> float:
    a = _norm(a)
    b = _norm(b)
    if hasattr(cv2, "SIFT_create"):
        det = cv2.SIFT_create(nfeatures=240)
        norm = cv2.NORM_L2
    else:
        det = cv2.ORB_create(nfeatures=300, fastThreshold=6)
        norm = cv2.NORM_HAMMING

    ka, da = det.detectAndCompute(a, None)
    kb, db = det.detectAndCompute(b, None)
    if da is None or db is None or len(ka) < 4 or len(kb) < 4:
        return 0.0

    pairs = cv2.BFMatcher(norm).knnMatch(da, db, k=2)
    good = 0
    for pair in pairs:
        if len(pair) < 2:
            continue
        m, n = pair
        if m.distance < 0.74 * n.distance:
            good += 1
    return min(1.0, good / max(8, min(len(ka), len(kb))))


def similarity(a: np.ndarray, b: np.ndarray) -> float:
    return _sift(a, b) * 0.82 + _corr(a, b) * 0.18


def role_for_slot(slot: int) -> str:
    if slot == 1:
        return "tank"
    if slot in {2, 3}:
        return "damage"
    return "support"


def main() -> None:
    here = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description="Leave-one-out scoreboard-native hero benchmark")
    p.add_argument("image_dir", type=Path)
    p.add_argument("--truth", type=Path, default=here / "team_ground_truth.json")
    args = p.parse_args()

    doc = json.loads(args.truth.read_text(encoding="utf-8"))
    hero_truth = doc.get("hero_ids", {})
    manual_refs = doc.get("manual_hero_references", [])
    if not hero_truth:
        raise SystemExit("hero_ids ground truth is missing.")

    samples = []
    missing = 0

    for image_name, expected in hero_truth.items():
        img = cv2.imread(str(args.image_dir / image_name))
        if img is None:
            missing += 1
            print(f"MISSING: {image_name}")
            continue

        crops = crop_team_heroes(img)
        expected_rows = min(10, len(expected))
        if len(crops) < expected_rows:
            print(f"NO CROPS: {image_name} ({len(crops)}/{expected_rows})")
            continue

        for idx, hero_id in enumerate(expected[:expected_rows]):
            hero_id = str(hero_id).strip()
            if not hero_id:
                continue
            crop = crops[idx]
            samples.append({
                "image": image_name,
                "index": idx,
                "hero_id": hero_id,
                "role": role_for_slot(crop.slot),
                "crop": crop.image,
            })

    reference_samples = list(samples)
    for item in manual_refs:
        image_name = str(item.get("image", "")).strip()
        hero_id = str(item.get("hero_id", "")).strip()
        role = str(item.get("role", "")).strip()
        box = item.get("box")
        if not image_name or not hero_id or role not in {"tank", "damage", "support"}:
            continue
        if not isinstance(box, list) or len(box) != 4:
            continue
        img = cv2.imread(str(args.image_dir / image_name))
        if img is None:
            continue
        h, w = img.shape[:2]
        x1, y1, x2, y2 = [float(v) for v in box]
        crop = img[
            max(0, int(y1 * h)):min(h, int(y2 * h)),
            max(0, int(x1 * w)):min(w, int(x2 * w)),
        ]
        if crop.size == 0:
            continue
        reference_samples.append({
            "image": image_name,
            "index": -1,
            "hero_id": hero_id,
            "role": role,
            "crop": crop,
        })

    by_hero = defaultdict(list)
    for i, s in enumerate(reference_samples):
        by_hero[s["hero_id"]].append(i)

    strategies = ("max", "top2_mean", "top3_mean")
    correct = {name: 0 for name in strategies}
    scored = singleton = 0
    failures_by_strategy = {name: [] for name in strategies}
    started = time.perf_counter()

    for i, sample in enumerate(samples):
        hero_scores = defaultdict(list)
        for ref in reference_samples:
            if ref["image"] == sample["image"] or ref["role"] != sample["role"]:
                continue
            hero_scores[ref["hero_id"]].append(similarity(sample["crop"], ref["crop"]))

        expected_scores = hero_scores.get(sample["hero_id"], [])
        if not expected_scores:
            singleton += 1
            continue

        scored += 1

        def aggregate(values, strategy):
            values = sorted(values, reverse=True)
            if strategy == "max":
                return values[0]
            if strategy == "top2_mean":
                take = values[:2]
            else:
                take = values[:3]
            return sum(take) / len(take)

        for strategy in strategies:
            ranked = sorted(
                (
                    (aggregate(values, strategy), hero_id)
                    for hero_id, values in hero_scores.items()
                    if values
                ),
                reverse=True,
            )
            best_score, best_id = ranked[0]
            second_score = ranked[1][0] if len(ranked) > 1 else 0.0
            expected_score = aggregate(expected_scores, strategy)

            if best_id == sample["hero_id"]:
                correct[strategy] += 1
            else:
                failures_by_strategy[strategy].append({
                    "image": sample["image"],
                    "row": sample["index"] + 1,
                    "expected": sample["hero_id"],
                    "actual": best_id,
                    "score": round(best_score, 4),
                    "expected_score": round(expected_score, 4),
                    "margin": round(best_score - second_score, 4),
                    "top3": [
                        {"hero_id": hero_id, "score": round(score, 4)}
                        for score, hero_id in ranked[:3]
                    ],
                })

    best_strategy = max(
        strategies,
        key=lambda name: (correct[name], -len(failures_by_strategy[name])),
    )
    failures = failures_by_strategy[best_strategy]

    elapsed = time.perf_counter() - started
    out = here / "last_scoreboard_hero_failures.json"
    out.write_text(json.dumps(failures, ensure_ascii=False, indent=2), encoding="utf-8")

    detail = here / "last_scoreboard_hero_strategy_report.json"
    detail.write_text(
        json.dumps(
            {
                "best_strategy": best_strategy,
                "rows": len(samples),
                "scored": scored,
                "singletons": singleton,
                "strategies": {
                    name: {
                        "correct": correct[name],
                        "accuracy": (correct[name] / scored) if scored else None,
                        "failures": len(failures_by_strategy[name]),
                    }
                    for name in strategies
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=== ORCA SCOREBOARD-NATIVE HERO BENCHMARK (IMAGE HOLDOUT) ===")
    print(f"rows: {len(samples)}")
    print(f"missing images: {missing}")
    print(f"scored rows (hero appears in another image): {scored}")
    print(f"image-singletons (no reference in another image): {singleton}")
    if scored:
        for name in strategies:
            print(f"{name}: {correct[name]}/{scored} ({correct[name]/scored:.1%})")
        print(f"best strategy: {best_strategy}")
    else:
        print("accuracy: no scorable rows")
    print(f"elapsed: {elapsed:.2f}s")
    print(f"failures ({best_strategy}): {out}")
    print(f"strategy report: {detail}")
    print("NOTE: This is leave-one-image-out; the query screenshot contributes no references.")


if __name__ == "__main__":
    main()
