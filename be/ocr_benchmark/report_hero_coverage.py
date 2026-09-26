from __future__ import annotations

import json
import urllib.request
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
TRUTH = HERE / "team_ground_truth.json"
HEROES_API = "https://overfast-api.tekrop.fr/heroes"
USER_AGENT = "ORCA-hero-coverage/1.0"


def load_roster():
    req = urllib.request.Request(
        HEROES_API,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        rows = json.loads(response.read().decode("utf-8"))
    result = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        key = str(row.get("key", "")).strip()
        role = str(row.get("role", "")).strip().lower()
        name = str(row.get("name", key)).strip()
        if key:
            result[key] = {"name": name, "role": role}
    return result


def main():
    doc = json.loads(TRUTH.read_text(encoding="utf-8"))
    hero_truth = doc.get("hero_ids", {})
    counts = Counter()

    for rows in hero_truth.values():
        for hero_id in rows:
            if hero_id:
                counts[str(hero_id)] += 1

    roster = load_roster()
    # OverFast can lag behind live releases. Keep known live heroes covered locally.
    roster.setdefault("dmon", {"name": "D.Mon", "role": "tank"})
    covered = sorted(h for h in roster if counts[h] > 0)
    missing = sorted(h for h in roster if counts[h] == 0)

    print("=== ORCA HERO COVERAGE ===")
    print(f"current roster: {len(roster)}")
    print(f"covered heroes: {len(covered)}")
    print(f"missing heroes: {len(missing)}")
    print()

    by_role = {"tank": [], "damage": [], "support": [], "other": []}
    for hero_id in missing:
        role = roster[hero_id]["role"]
        by_role.setdefault(role if role in by_role else "other", []).append(hero_id)

    for role in ("tank", "damage", "support", "other"):
        heroes = by_role.get(role) or []
        if not heroes:
            continue
        print(f"[{role.upper()}] {len(heroes)}")
        print(", ".join(heroes))
        print()

    singletons = sorted(h for h, n in counts.items() if n == 1)
    singleton_by_role = {"tank": [], "damage": [], "support": [], "other": []}
    for hero_id in singletons:
        role = roster.get(hero_id, {}).get("role", "other")
        singleton_by_role.setdefault(role if role in singleton_by_role else "other", []).append(hero_id)

    print(f"covered only once: {len(singletons)}")
    if singletons:
        print(", ".join(singletons))
    print()

    print("=== CAPTURE TARGET ===")
    print("Goal: at least 2 scoreboard references per hero")
    needed_by_role = {}
    total_needed = 0
    for role in ("tank", "damage", "support"):
        missing_need = len(by_role.get(role, [])) * 2
        singleton_need = len(singleton_by_role.get(role, []))
        need = missing_need + singleton_need
        needed_by_role[role] = need
        total_needed += need
        print(
            f"{role}: {need} appearances "
            f"(missing x2={missing_need}, singleton +1={singleton_need})"
        )

    # Each screenshot contains 2 tank, 4 damage, 4 support portraits.
    import math
    min_screens = max(
        math.ceil(needed_by_role.get("tank", 0) / 2),
        math.ceil(needed_by_role.get("damage", 0) / 4),
        math.ceil(needed_by_role.get("support", 0) / 4),
    )
    print(f"theoretical minimum new screenshots: {min_screens}")
    print(f"total additional hero appearances needed: {total_needed}")
    print()
    print("=== CAPTURE PRIORITY ===")
    print("P1: missing heroes -> capture each at least 2 times")
    for role in ("tank", "damage", "support"):
        heroes = by_role.get(role, [])
        if heroes:
            print(f"{role}: " + ", ".join(f"{h} x2" for h in heroes))
    print()
    print("P2: singleton heroes -> capture each at least 1 more time")
    for role in ("tank", "damage", "support"):
        heroes = singleton_by_role.get(role, [])
        if heroes:
            print(f"{role}: " + ", ".join(f"{h} +1" for h in heroes))

    out = HERE / "hero_coverage_report.json"
    out.write_text(
        json.dumps(
            {
                "roster_count": len(roster),
                "covered_count": len(covered),
                "missing_count": len(missing),
                "covered_counts": dict(sorted(counts.items())),
                "missing": {
                    role: by_role.get(role, [])
                    for role in ("tank", "damage", "support", "other")
                },
                "singletons": singletons,
                "singletons_by_role": singleton_by_role,
                "capture_target": {
                    "goal_references_per_hero": 2,
                    "additional_appearances_by_role": needed_by_role,
                    "total_additional_appearances": total_needed,
                    "theoretical_minimum_screenshots": min_screens,
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print()
    print(f"report: {out}")


if __name__ == "__main__":
    main()
