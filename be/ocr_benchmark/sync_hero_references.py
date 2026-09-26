from __future__ import annotations

"""
Download/cache current Overwatch hero portraits for hero-matching experiments.

Source:
https://overfast-api.tekrop.fr/heroes

The previously tested GitHub icon repository is no longer used by this script
because raw/API file access returned HTTP 404 in the local benchmark environment.
"""

import argparse
import json
import urllib.request
from pathlib import Path

HEROES_API = "https://overfast-api.tekrop.fr/heroes"
USER_AGENT = "ORCA-hero-reference-sync/1.4"


def _request_json(url: str):
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def _download(url: str, out: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=45) as response:
        data = response.read()
    if not data:
        raise RuntimeError("empty response")
    out.write_bytes(data)


def main() -> None:
    here = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description="Cache current Overwatch hero portraits")
    p.add_argument("--out", type=Path, default=here / "hero_references")
    args = p.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    try:
        heroes = _request_json(HEROES_API)
    except Exception as exc:
        raise SystemExit(f"Failed to load current hero list: {exc}") from exc

    if not isinstance(heroes, list):
        raise SystemExit("Unexpected hero list response")

    manifest = []
    downloaded = skipped = failed = 0

    for item in heroes:
        if not isinstance(item, dict):
            continue
        hero_id = str(item.get("key", "")).strip()
        portrait = str(item.get("portrait", "")).strip()
        if not hero_id or not portrait:
            continue

        out = args.out / f"{hero_id}.png"
        if out.exists() and out.stat().st_size > 0:
            skipped += 1
        else:
            try:
                print(f"download: {hero_id}.png")
                _download(portrait, out)
                downloaded += 1
            except Exception as exc:
                failed += 1
                out.unlink(missing_ok=True)
                print(f"FAILED: {hero_id}.png -> {exc}")
                continue

        manifest.append({
            "hero_id": hero_id,
            "name": item.get("name"),
            "role": str(item.get("role", "")).strip().lower() or None,
            "file": out.name,
            "portrait_url": portrait,
        })

    manifest.sort(key=lambda row: row["hero_id"])
    manifest_path = args.out / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print("=== ORCA HERO REFERENCES ===")
    print(f"heroes: {len(manifest)}")
    print(f"downloaded: {downloaded}")
    print(f"cached: {skipped}")
    print(f"failed: {failed}")
    print(f"folder: {args.out}")
    print(f"manifest: {manifest_path}")

    if not manifest:
        raise SystemExit("No hero references were downloaded.")


if __name__ == "__main__":
    main()
