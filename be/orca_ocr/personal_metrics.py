from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any

COMMON_METRICS: dict[str, dict[str, Any]] = {
    "play_time": {"scope": "common", "aliases": ["플레이 시간", "플레이시간"]},
    "weapon_accuracy": {"scope": "common", "aliases": ["무기 명중률", "무기명중률", "무기 명중몰"]},
    "critical_hit_accuracy": {
        "scope": "common",
        "aliases": ["치명타 명중률", "치명타명중률", "치명타 적중률", "치명타적중률"],
    },
    "critical_hits": {"scope": "common", "aliases": ["치명타", "치명타 횟수", "치명타횟수"]},
}

# Hero-specific Personal-screen metrics. Keys are stable DB/analysis keys;
# aliases are the Korean labels verified from real Overwatch screenshots.
HERO_METRICS: dict[str, dict[str, dict[str, Any]]] = {
    "roadhog": {
        "self_healing": {"aliases": ["자가 치유"]},
        "objective_contest_time": {"aliases": ["거점 격돌 시간"]},
        "chain_hook_kills": {"aliases": ["사슬 갈고리로 처치", "시슬 갈고리로 저치", "시슬갈고리로저치"]},
        "pig_pen_kills": {"aliases": ["돼재앙으로 처치"]},
        "players_saved": {"aliases": ["보호한 플레이어", "보호한 플러이어"]},
        "chain_hook_accuracy": {"aliases": ["사슬 갈고리 명중률"]},
    },
    "symmetra": {
        "primary_fire_accuracy": {"aliases": ["기본 발사 명중률", "poa 발사 명중률"]},
        "sentry_turret_kills": {"aliases": ["감시 포탑으로 처치"]},
        "final_blows": {"aliases": ["결정타"]},
        "secondary_fire_accuracy": {"aliases": ["보조 발사 명중률"]},
        "players_teleported": {"aliases": ["순간이동한 플레이어"]},
        "solo_kills": {"aliases": ["단독 처치", "단독 저지", "단독저지"]},
        "average_charge": {"aliases": ["평균 충전 계수", "평균 중선 계수"]},
    },
    "ana": {
        "biotic_grenade_kills": {"aliases": ["생체 수류탄 처치"]},
        "healing_amplified": {"aliases": ["치유 증폭"]},
        "players_saved": {"aliases": ["구한 플레이어"]},
        "enemies_slept": {"aliases": ["재운 적"]},
        "healing_prevented": {"aliases": ["차단한 치유"]},
        "scoped_accuracy": {"aliases": ["저격 명중률"]},
        "sleep_dart_accuracy": {"aliases": ["수면총 명중률"]},
        "nano_boost_assists": {"aliases": ["나노 강화제 지원"]},
    },
    "genji": {
        "ultimates_reflected": {"aliases": ["궁극기 반사"]},
        "final_blows": {"aliases": ["결정타"]},
        "swift_strike_resets": {"aliases": ["질풍참 초기화", "질풍참 조기화"]},
        "dragonblade_kills": {"aliases": ["용검으로 처치"]},
        "solo_kills": {"aliases": ["단독 처치"]},
        "reflected_damage": {"aliases": ["반사한 피해", "반사 피해", "baw 피해", "baw피해", "fba 피해", "fba피해"]},
    },
    "domina": {
        "weapon_beam_accuracy": {"aliases": ["무기 광선 명중률"]},
        "environmental_kills": {"aliases": ["환경 요소로 처치"]},
        "objective_contest_time": {"aliases": ["거점 격돌 시간"]},
        "weapon_shot_accuracy": {"aliases": ["무기 사격 명중률"]},
        "crystal_charge_damage": {"aliases": ["수정 발사 피해"]},
        "players_saved": {"aliases": ["보호한 플레이어", "보호한 플러이어"]},
        "knockback_kills": {"aliases": ["밀쳐내기로 처치"]},
        "self_healing": {"aliases": ["자가 치유"]},
    },
    "doomfist": {
        "overhealth_generated": {"aliases": ["생성한 추가 생명력", "추가 생명력"]},
        "objective_contest_time": {"aliases": ["거점 격돌 시간"]},
        "rocket_punch_kills": {"aliases": ["로켓 펀치로 처치"]},
        "meteor_strike_kills": {"aliases": ["파멸의 일격으로 처치", "파멸의 임격으로 처치"]},
        "players_saved": {"aliases": ["보호한 플레이어", "보호한 플러이어"]},
        "seismic_slam_kills": {"aliases": ["지진 강타로 처치", "지진 강타로 저지"]},
    },
    "dmon": {
        "fusion_repeater_accuracy": {"aliases": ["융합 연발총 명중률"]},
        "limit_break_kills": {"aliases": ["한계 돌파로 처치"]},
        "objective_contest_time": {"aliases": ["거점 격돌 시간"]},
        "fusion_repeater_kills": {"aliases": ["융합 연발총으로 처치", "융합 연발총로 처치", "융합 인발종으로 처치"]},
        "damage_amplified": {"aliases": ["공격력 증폭"]},
        "players_saved": {"aliases": ["보호한 플레이어", "보호한 플러이어"]},
        "surging_strike_kills": {"aliases": ["돌진 강타로 처치", "밀쳐내기로 처치"]},
    },
    "dva": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "ultimates_negated": {"aliases": ["궁극기 차단", "차단"]},
        "objective_contest_time": {"aliases": ["거점 격돌 시간"]},
        "micro_missiles_kills": {"aliases": ["마이크로 미사일로 처치"]},
        "call_mech_kills": {"aliases": ["메카 호출로 처치"]},
        "players_saved": {"aliases": ["보호한 플레이어", "보호한 플러이어"]},
        "booster_kills": {"aliases": ["부스터로 처치", "밀쳐내기로 처치"]},
        "self_destruct_kills": {"aliases": ["자폭으로 처치"]},
    },
}

HERO_NAME_ALIASES: dict[str, list[str]] = {
    "roadhog": ["로드호그"],
    "symmetra": ["시메트라"],
    "ana": ["아나"],
    "genji": ["겐지"],
    "domina": ["도미나"],
    "doomfist": ["둠피스트", "DOOMFIST"],
    "dmon": ["D.Mon", "DMon", "디몬"],
    "dva": ["D.VA", "D.Va", "DVA", "디바"],
}


# Verified card order on the Personal screen. This is only a fallback when
# label OCR is too noisy; label-based matching remains authoritative.
HERO_METRIC_ORDER: dict[str, list[str]] = {
    "roadhog": [
        "weapon_accuracy","self_healing","objective_contest_time",
        "chain_hook_kills","pig_pen_kills","players_saved","chain_hook_accuracy",
    ],
    "symmetra": [
        "primary_fire_accuracy","sentry_turret_kills","final_blows",
        "secondary_fire_accuracy","players_teleported","solo_kills","average_charge",
    ],
    "ana": [
        "biotic_grenade_kills","healing_amplified","players_saved","enemies_slept",
        "healing_prevented","scoped_accuracy","sleep_dart_accuracy","nano_boost_assists",
    ],
    "dmon": [
        "fusion_repeater_accuracy","limit_break_kills","objective_contest_time",
        "fusion_repeater_kills","damage_amplified","players_saved","surging_strike_kills",
    ],
    "dva": [
        "weapon_accuracy","ultimates_negated","objective_contest_time",
        "micro_missiles_kills","call_mech_kills","players_saved",
        "booster_kills","self_destruct_kills",
    ],
}


def metric_from_verified_order(hero_key: str | None, metric_index: int) -> dict[str, Any] | None:
    if not hero_key:
        return None
    order=HERO_METRIC_ORDER.get(hero_key)
    if not order or metric_index<0 or metric_index>=len(order):
        return None
    key=order[metric_index]
    scope="common" if key in COMMON_METRICS else "hero_specific"
    return {
        "metric_key": key,
        "scope": scope,
        "label_match_score": 0.75,
        "needs_review": False,
    }


def normalize_metric_label(label: str) -> str:
    text=(label or "").strip().lower()
    return re.sub(r"[^0-9a-z가-힣]+", "", text)


def resolve_hero_key(text: str) -> str | None:
    norm=normalize_metric_label(text)
    if not norm:
        return None
    for hero_key,aliases in HERO_NAME_ALIASES.items():
        for alias in aliases:
            if normalize_metric_label(alias) in norm:
                return hero_key
    return None


def _label_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 0.96
    return SequenceMatcher(None, a, b).ratio()


def infer_hero_from_metric_labels(labels: list[str]) -> dict[str, Any]:
    """Infer the selected hero from several hero-specific Personal stat labels.

    This is a fallback for cases where the hero-name OCR is poor. A hero must have
    multiple reasonably strong label matches before we accept the inference.
    """
    normalized=[normalize_metric_label(v) for v in labels if normalize_metric_label(v)]
    ranked: list[tuple[int, float, str, list[dict[str, Any]]]]=[]

    for hero_key,metrics in HERO_METRICS.items():
        hits=[]
        used_keys=set()
        total_score=0.0

        for label in normalized:
            best=None
            for metric_key,meta in metrics.items():
                if metric_key in used_keys:
                    continue
                for alias in meta.get("aliases", []):
                    score=_label_similarity(label,normalize_metric_label(alias))
                    if best is None or score>best[0]:
                        best=(score,metric_key,alias)

            if best and best[0]>=0.68:
                score,metric_key,alias=best
                used_keys.add(metric_key)
                total_score+=score
                hits.append({
                    "label": label,
                    "metric_key": metric_key,
                    "alias": alias,
                    "score": round(score,3),
                })

        ranked.append((len(hits),total_score,hero_key,hits))

    ranked.sort(reverse=True,key=lambda item:(item[0],item[1]))
    if not ranked:
        return {"hero_key":None,"confidence":0.0,"matches":[]}

    count,total,hero_key,hits=ranked[0]
    second_count=ranked[1][0] if len(ranked)>1 else 0
    confident=count>=2 and count>second_count
    confidence=min(0.99,0.55+0.10*count+0.08*max(0,count-second_count)) if confident else 0.0

    return {
        "hero_key": hero_key if confident else None,
        "confidence": round(confidence,3),
        "matches": hits,
    }


def resolve_metric_label(label: str, hero_key: str | None = None) -> dict[str, Any]:
    norm=normalize_metric_label(label)
    if not norm:
        return {
            "metric_key": None,
            "scope": "unknown",
            "label_normalized": "",
            "needs_review": True,
        }

    candidates: list[tuple[float, str, str]]=[]

    if hero_key and hero_key in HERO_METRICS:
        for key,meta in HERO_METRICS[hero_key].items():
            for alias in meta.get("aliases", []):
                score=_label_similarity(norm,normalize_metric_label(alias))
                candidates.append((score,key,"hero_specific"))

    for key,meta in COMMON_METRICS.items():
        for alias in meta.get("aliases", []):
            score=_label_similarity(norm,normalize_metric_label(alias))
            candidates.append((score,key,"common"))

    if candidates:
        score,key,scope=max(candidates,key=lambda item:item[0])
        # Korean OCR commonly adds one stray leading symbol/syllable or confuses
        # one character. Keep the threshold conservative and expose low-confidence
        # fuzzy matches for review.
        if score>=0.72:
            return {
                "metric_key": key,
                "scope": scope,
                "label_normalized": norm,
                "label_match_score": round(score,3),
                "needs_review": score<0.86,
            }

    return {
        "metric_key": None,
        "scope": "hero_specific" if hero_key else "unknown",
        "label_normalized": norm,
        "label_match_score": 0.0,
        "needs_review": True,
    }

