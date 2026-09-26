from __future__ import annotations

"""
Scan newly added 5v5 Team screenshots that are not yet in team_ground_truth.json.

Known heroes are matched against the validated production scoreboard reference
library. Low-confidence/ambiguous rows are surfaced for manual labeling so they
can reveal heroes that are still missing from the reference set.
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ocr_benchmark.hero_matching_experiment import crop_team_heroes
from orca_ocr.engine import _hero_similarity

HERE = Path(__file__).resolve().parent
IMAGE_DIR = HERE / "images"
TRUTH = HERE / "team_ground_truth.json"
REF_ROOT = ROOT / "orca_ocr" / "hero_references"


def role_for_slot(slot: int) -> str:
    if slot == 1:
        return "tank"
    if slot in (2, 3):
        return "damage"
    return "support"


def load_library():
    manifest = REF_ROOT / "manifest.json"
    roles = {}
    if manifest.exists():
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        raw = payload.get("roles", {}) if isinstance(payload, dict) else {}
        if isinstance(raw, dict):
            roles = {str(k): str(v) for k, v in raw.items()}

    library = {}
    for hero_dir in sorted(p for p in REF_ROOT.iterdir() if p.is_dir()):
        refs = []
        for path in sorted(hero_dir.iterdir()):
            if path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
                continue
            img = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if img is not None:
                refs.append(img)
        if refs:
            library[hero_dir.name] = refs
    return library, roles


def main():
    truth = json.loads(TRUTH.read_text(encoding="utf-8"))
    known_images = set((truth.get("images") or {}).keys())

    image_paths = sorted(
        p for p in IMAGE_DIR.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
        and p.name not in known_images
    )

    if not image_paths:
        print("No new 5v5 screenshots found.")
        return

    library, roles = load_library()
    if not library:
        raise SystemExit("Production hero reference library is empty.")

    rows = []
    review_tiles = []
    accepted = review = failed_images = 0

    # Same-geometry 5v5 matching should be much stronger than cross-layout 6v6.
    score_threshold = 0.46
    margin_threshold = 0.05

    for image_path in image_paths:
        img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if img is None:
            failed_images += 1
            continue

        crops = crop_team_heroes(img)
        if len(crops) < 10:
            failed_images += 1
            print(f"{image_path.name}: could not crop 10 players")
            continue

        for idx, item in enumerate(crops[:10]):
            slot = item.slot
            role = role_for_slot(slot)
            scored = []

            for hero_id, refs in library.items():
                if roles and roles.get(hero_id) != role:
                    continue
                scores = sorted(
                    (_hero_similarity(item.image, ref) for ref in refs),
                    reverse=True,
                )
                top = scores[:2]
                score = (sum(top) / len(top)) if top else 0.0
                scored.append((float(score), hero_id))

            scored.sort(reverse=True)
            best_score, best_id = scored[0] if scored else (0.0, None)
            second_score = scored[1][0] if len(scored) > 1 else 0.0
            margin = best_score - second_score
            auto = bool(
                best_id
                and best_score >= score_threshold
                and margin >= margin_threshold
            )

            if auto:
                accepted += 1
            else:
                review += 1

            row = {
                "image": image_path.name,
                "team": item.team,
                "slot": slot,
                "role": role,
                "candidate": best_id,
                "score": round(best_score, 4),
                "margin": round(margin, 4),
                "accepted": auto,
            }
            rows.append(row)

            if not auto:
                tile = cv2.resize(item.image, (170, 170), interpolation=cv2.INTER_AREA)
                canvas = cv2.copyMakeBorder(
                    tile, 58, 0, 0, 0, cv2.BORDER_CONSTANT, value=(0, 0, 0)
                )
                short = image_path.stem[-10:]
                cv2.putText(
                    canvas,
                    f"{short} {item.team[0]}{slot} {role[0].upper()}",
                    (4, 18),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.38,
                    (255,255,255),
                    1,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    canvas,
                    f"{best_id or '?'} s={best_score:.2f} m={margin:.2f}",
                    (4, 42),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.38,
                    (255,255,255),
                    1,
                    cv2.LINE_AA,
                )
                review_tiles.append(canvas)

        print(f"{image_path.name}: scanned 10 players")

    report = HERE / "new_5v5_hero_scan.json"
    report.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    montage = HERE / "new_5v5_needs_review.jpg"
    if review_tiles:
        cols = 5
        blank = np.zeros_like(review_tiles[0])
        while len(review_tiles) % cols:
            review_tiles.append(blank.copy())
        mats = [
            cv2.hconcat(review_tiles[i:i+cols])
            for i in range(0, len(review_tiles), cols)
        ]
        cv2.imwrite(str(montage), cv2.vconcat(mats))

    print()
    print("=== ORCA NEW 5V5 HERO SCAN ===")
    print(f"new screenshots: {len(image_paths)}")
    print(f"failed screenshots: {failed_images}")
    print(f"rows scanned: {len(rows)}")
    print(f"known/high-confidence: {accepted}")
    print(f"needs review: {review}")
    print(f"report: {report}")
    print(f"review montage: {montage if review_tiles else 'NOT NEEDED'}")
    print("NEXT: review montage rows are the best candidates for missing/new heroes.")


if __name__ == "__main__":
    main()
