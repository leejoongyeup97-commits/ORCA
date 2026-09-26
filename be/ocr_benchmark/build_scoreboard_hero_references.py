from __future__ import annotations

"""
Build production hero reference crops from the labeled Team benchmark set.

Input screenshots stay under ocr_benchmark/images (development-only).
Output contains only small per-hero portrait crops used by the runtime matcher.
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ocr_benchmark.hero_matching_experiment import crop_team_heroes


def main() -> None:
    here = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description="Build scoreboard-native production hero references")
    p.add_argument("image_dir", type=Path)
    p.add_argument("--truth", type=Path, default=here / "team_ground_truth.json")
    p.add_argument(
        "--out",
        type=Path,
        default=ROOT / "orca_ocr" / "hero_references",
    )
    args = p.parse_args()

    doc = json.loads(args.truth.read_text(encoding="utf-8"))
    hero_truth = doc.get("hero_ids", {})
    manual_refs = doc.get("manual_hero_references", [])
    if not hero_truth:
        raise SystemExit("hero_ids ground truth is missing.")

    if args.out.exists():
        shutil.rmtree(args.out)
    args.out.mkdir(parents=True, exist_ok=True)

    saved = 0
    heroes = set()
    hero_roles = {}
    missing = 0
    conflicts = []

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

        stem = Path(image_name).stem
        for idx, hero_id in enumerate(expected[:expected_rows]):
            hero_id = str(hero_id).strip()
            if not hero_id:
                continue
            slot = (idx % 5) + 1
            role = "tank" if slot == 1 else ("damage" if slot in (2, 3) else "support")
            previous_role = hero_roles.get(hero_id)
            if previous_role and previous_role != role:
                conflicts.append({
                    "hero_id": hero_id,
                    "first_role": previous_role,
                    "conflicting_role": role,
                    "image": image_name,
                    "row": idx + 1,
                })
                continue
            hero_roles[hero_id] = role

            hero_dir = args.out / hero_id
            hero_dir.mkdir(parents=True, exist_ok=True)
            out = hero_dir / f"{stem}_r{idx+1}.png"
            if cv2.imwrite(str(out), crops[idx].image):
                saved += 1
                heroes.add(hero_id)


    for item in manual_refs:
        image_name = str(item.get("image", "")).strip()
        hero_id = str(item.get("hero_id", "")).strip()
        role = str(item.get("role", "")).strip()
        box = item.get("box")
        label = str(item.get("label", "manual")).strip() or "manual"
        if not image_name or not hero_id or role not in {"tank", "damage", "support"}:
            continue
        if not isinstance(box, list) or len(box) != 4:
            continue
        img = cv2.imread(str(args.image_dir / image_name))
        if img is None:
            missing += 1
            print(f"MISSING MANUAL: {image_name}")
            continue
        h, w = img.shape[:2]
        x1, y1, x2, y2 = [float(v) for v in box]
        crop = img[
            max(0, int(y1 * h)):min(h, int(y2 * h)),
            max(0, int(x1 * w)):min(w, int(x2 * w)),
        ]
        if crop.size == 0:
            print(f"EMPTY MANUAL CROP: {image_name} {label}")
            continue
        previous_role = hero_roles.get(hero_id)
        if previous_role and previous_role != role:
            conflicts.append({
                "hero_id": hero_id,
                "first_role": previous_role,
                "conflicting_role": role,
                "image": image_name,
                "row": label,
            })
            continue
        hero_roles[hero_id] = role
        hero_dir = args.out / hero_id
        hero_dir.mkdir(parents=True, exist_ok=True)
        out = hero_dir / f"{Path(image_name).stem}_{label}.png"
        if cv2.imwrite(str(out), crop):
            saved += 1
            heroes.add(hero_id)

    if conflicts:
        report = args.out.parent / "hero_ground_truth_conflicts.json"
        report.write_text(
            json.dumps(conflicts, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print()
        print("GROUND TRUTH CONFLICTS DETECTED")
        print(f"conflicts: {len(conflicts)}")
        print(f"report: {report}")
        raise SystemExit(
            "Hero ground-truth labels are inconsistent across roles. "
            "Fix team_ground_truth.json before building production references."
        )

    manifest = {
        "version": 1,
        "source": "scoreboard_native_benchmark",
        "heroes": sorted(heroes),
        "roles": {hero_id: hero_roles[hero_id] for hero_id in sorted(hero_roles)},
        "reference_count": saved,
    }
    (args.out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print("=== ORCA PRODUCTION HERO REFERENCES ===")
    print(f"heroes: {len(heroes)}")
    print(f"references: {saved}")
    print(f"missing images: {missing}")
    print(f"folder: {args.out}")


if __name__ == "__main__":
    main()
