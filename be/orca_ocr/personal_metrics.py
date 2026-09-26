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
    "ramattra": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "ravenous_vortex_kills": {"aliases": ["탐식의 소용돌이로 처치", "탐식의 소용돌이로 저치"]},
        "objective_contest_time": {"aliases": ["거점 격돌 시간"]},
        "pummel_accuracy": {"aliases": ["응징 명중률"]},
        "annihilation_efficiency": {"aliases": ["절멸 활용도"]},
        "players_saved": {"aliases": ["보호한 플레이어", "보호한 플러이어"]},
        "pummel_kills": {"aliases": ["응징으로 처치"]},
        "annihilation_kills": {"aliases": ["절멸로 처치"]},
    },
    "lifeweaver": {
        "thorn_volley_kills": {"aliases": ["가시 연사로 처치", "가시 면사로 처치"]},
        "self_healing": {"aliases": ["자가 치유"]},
        "players_saved": {"aliases": ["구한 플레이어"]},
        "life_grip_saves": {"aliases": ["구원의 손길로 선방", "구원의 손길 선방"]},
        "weapon_accuracy": {"aliases": ["무기 명중률", "무기명중률"]},
        "tree_of_life_healing": {"aliases": ["생명의 나무로 치유"]},
    },
    "reinhardt": {
        "charge_kills": {"aliases": ["돌진으로 처치"]},
        "knockback_kills": {"aliases": ["밀쳐내기로 처치"]},
        "objective_contest_time": {"aliases": ["거점 격돌 시간"]},
        "fire_strike_kills": {"aliases": ["화염 강타로 처치", "화염 강타로 처 치"]},
        "earthshatter_hits": {"aliases": ["대지분쇄 명중"]},
        "players_saved": {"aliases": ["보호한 플레이어", "보호한 플러이어"]},
        "fire_strike_accuracy": {"aliases": ["화염 강타 명중률"]},
        "earthshatter_stuns": {"aliases": ["대지분쇄로 기절"]},
    },
    "lucio": {
        "healing_boost_usage": {"aliases": ["치유 증폭 사용"]},
        "knockback_kills": {"aliases": ["밀쳐내기로 처치"]},
        "players_saved": {"aliases": ["구한 플레이어"]},
        "speed_boost_usage": {"aliases": ["속도 증폭 사용"]},
        "environmental_kills": {"aliases": ["환경 요소로 처치"]},
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "players_knocked_back": {"aliases": ["밀쳐낸 플레이어"]},
        "sound_barriers_provided": {"aliases": ["소리 방벽 제공"]},
    },
    "reaper": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "death_blossom_kills": {"aliases": ["죽음의 꽃으로 처치", "죽음의 꽂으로 처지"]},
        "final_blows": {"aliases": ["결정타"]},
        "critical_hit_accuracy": {"aliases": ["치명타 명중률"]},
        "solo_kills": {"aliases": ["단독 처치"]},
        "self_healing": {"aliases": ["자가 치유", "지가 치유"]},
    },
    "mauga": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "self_healing": {"aliases": ["자가 치유"]},
        "objective_contest_time": {"aliases": ["거점 격돌 시간"]},
        "critical_damage": {"aliases": ["치명타로 준 피해", "시멍타로 준 피해"]},
        "overhealth_generated": {"aliases": ["생성한 추가 생명력"]},
        "players_saved": {"aliases": ["보호한 플레이어", "보호한 플러이어"]},
        "overrun_kills": {"aliases": ["돌파로 처치"]},
        "cage_fight_kills": {"aliases": ["케이지 혈투로 처치"]},
    },
    "mercy": {
        "damage_amplified": {"aliases": ["공격력 증폭"]},
        "players_resurrected": {"aliases": ["부활한 플레이어"]},
        "players_saved": {"aliases": ["구한 플레이어"]},
        "damage_boost_beam_usage": {"aliases": ["증폭 광선 사용"]},
        "valkyrie_healing": {"aliases": ["발키리로 치유"]},
        "blaster_kills": {"aliases": ["블라스터로 처치"]},
        "healing_beam_usage": {"aliases": ["치유 광선 사용"]},
        "valkyrie_damage": {"aliases": ["발키리로 준 피해", "발키2로준피하"]},
    },
    "mei": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "enemies_frozen": {"aliases": ["얼린 적", "빙결한 적"]},
        "final_blows": {"aliases": ["결정타"]},
        "icicle_accuracy": {"aliases": ["고드름 명중률"]},
        "blizzard_kills": {"aliases": ["눈보라로 처치"]},
        "solo_kills": {"aliases": ["단독 처치", "단독 저지", "단독저지"]},
        "icicle_critical_hit_accuracy": {"aliases": ["고드름 치명타 명중률"]},
    },
    "mizuki": {
        "healing_hat_healing": {"aliases": ["치유의 삿갓으로 치유"]},
        "enemies_bound": {"aliases": ["속박한 적", "방해한 적", "방하하 적"]},
        "players_saved": {"aliases": ["구한 플레이어"]},
        "barrier_sanctuary_absorbed": {"aliases": ["결계 성역으로 흡수", "흡수한 피해"]},
        "spirit_shuriken_accuracy": {"aliases": ["영혼 수리검 명중률"]},
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "healing_hat_accuracy": {"aliases": ["치유의 삿갓 명중률"]},
        "ultimates_negated": {"aliases": ["궁극기 차단"]},
    },
    "baptiste": {
        "healing_accuracy": {"aliases": ["치유 명중률", "시유 명중률"]},
        "deaths_prevented": {"aliases": ["불사 장치로 사망 저지"]},
        "players_saved": {"aliases": ["구한 플레이어"]},
        "critical_hit_accuracy": {"aliases": ["치명타 명중률"]},
        "amplification_matrix_assists": {"aliases": ["증폭 매트릭스 지원", "증폭매트릭스지원"]},
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "damage_amplified": {"aliases": ["공격력 증폭"]},
    },
    "brigitte": {
        "inspire_triggers": {"aliases": ["격려 발동"]},
        "inspire_uptime": {"aliases": ["격려 활성 시간 비율"]},
        "shield_bash_kills": {"aliases": ["방패 밀쳐내기로 처치"]},
        "knockback_kills": {"aliases": ["밀쳐내기로 처치"]},
        "whip_shot_accuracy": {"aliases": ["도리깨 투척 명중률"]},
        "overhealth_provided": {"aliases": ["추가 생명력 제공"]},
    },
    "sojourn": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "charged_shot_kills": {"aliases": ["충전된 사격으로 처치", "sng 사격으로 처치"]},
        "long_range_final_blows": {"aliases": ["장거리 결정타"]},
        "charged_shot_accuracy": {"aliases": ["충전된 사격 명중률"]},
        "disruptor_shot_kills": {"aliases": ["분열 사격으로 처치", "분임 사격으로 처치"]},
        "solo_kills": {"aliases": ["단독 처치", "단독 저지", "단독저지"]},
        "charged_shot_critical_hit_accuracy": {"aliases": ["충전된 사격 치명타 명중률"]},
        "overclock_kills": {"aliases": ["오버클럭으로 처치"]},
    },
    "soldier76": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "long_range_final_blows": {"aliases": ["장거리 결정타"]},
        "final_blows": {"aliases": ["결정타"]},
        "critical_hit_accuracy": {"aliases": ["치명타 명중률"]},
        "helix_rocket_kills": {"aliases": ["나선 로켓으로 처치"]},
        "self_healing": {"aliases": ["자가 치유"]},
        "helix_rocket_accuracy": {"aliases": ["나선 로켓 명중률"]},
        "tactical_visor_kills": {"aliases": ["전술 조준경으로 처치", "전술 조준경으로저지"]},
    },
    "sigma": {
        "weapon_accuracy": {"aliases": ["무기 명중률", "오기 명중률"]},
        "accretion_accuracy": {"aliases": ["강착 명중률"]},
        "objective_contest_time": {"aliases": ["거점 격돌 시간"]},
        "direct_hit_accuracy": {"aliases": ["적중률"]},
        "overhealth_generated": {"aliases": ["생성한 추가 생명력"]},
        "players_saved": {"aliases": ["보호한 플레이어", "보호한 플러이어"]},
        "accretion_kills": {"aliases": ["강착으로 처치"]},
        "gravity_flux_kills": {"aliases": ["중력 붕괴로 처치"]},
        "ultimates_negated": {"aliases": ["궁극기 차단"]},
    },
    "shion": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "joyride_damage": {"aliases": ["조이라이드로 준 피해", "조이리이드로 준 피하"]},
        "joyride_kills": {"aliases": ["조이라이드로 처치"]},
        "critical_hit_accuracy": {"aliases": ["치명타 명중률"]},
        "satsuriku_spree_kills": {"aliases": ["광란의 살육으로 처치"]},
        "solo_kills": {"aliases": ["단독 처치", "단독 저지", "단독저지"]},
        "execution_kills": {"aliases": ["처형으로 처치", "저형으로저시"]},
        "execution_accuracy": {"aliases": ["처형 명중률"]},
        "joyride_ground_launch_accuracy": {"aliases": ["조이라이드 지상 발사 명중률"]},
        "joyride_air_launch_accuracy": {"aliases": ["조이라이드 공중 발사 명중률"]},
    },
    "anran": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "enemies_ignited": {"aliases": ["불태운 적"]},
        "critical_hit_kills": {"aliases": ["치명타 처치"]},
        "fan_the_flames_accuracy": {"aliases": ["불난 데 부채질 명중률"]},
        "dancing_blaze_kills": {"aliases": ["춤추는 불꽃으로 처치", "춤추는 불꽂으로 처치"]},
        "final_blows": {"aliases": ["결정타"]},
        "critical_hit_damage": {"aliases": ["치명타로 준 피해"]},
        "ultimate_kills": {"aliases": ["궁극기로 처치"]},
    },
    "ashe": {
        "scoped_accuracy": {"aliases": ["저격 명중률", "명중률"]},
        "dynamite_kills": {"aliases": ["다이너마이트로 처치"]},
        "final_blows": {"aliases": ["결정타"]},
        "scoped_critical_hit_accuracy": {"aliases": ["저격 치명타 명중률"]},
        "bob_kills": {"aliases": ["B.O.B.으로 처치", "B.O.B. 처치", "밥으로 처치", "106 평균"]},
        "solo_kills": {"aliases": ["단독 처치", "단독 저지"]},
        "long_range_final_blows": {"aliases": ["장거리 결정타"]},
    },
    "echo": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "sticky_bomb_accuracy": {"aliases": ["점착 폭탄 적중률"]},
        "final_blows": {"aliases": ["결정타"]},
        "focusing_beam_accuracy": {"aliases": ["광선 집중 명중률"]},
        "sticky_bomb_kills": {"aliases": ["점착 폭탄으로 처치"]},
        "solo_kills": {"aliases": ["단독 처치", "단독 저지"]},
        "focusing_beam_kills": {"aliases": ["광선 집중으로 처치"]},
        "duplicate_kills": {"aliases": ["복제로 처치"]},
    },
    "emre": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "siphon_blaster_damage": {"aliases": ["사이펀 블라스터로 준 피해"]},
        "final_blows": {"aliases": ["결정타"]},
        "scoped_accuracy": {"aliases": ["저격 명중률"]},
        "cyber_fragment_grenade_damage": {"aliases": ["사이버 파편 수류탄으로 준 피해"]},
        "self_healing": {"aliases": ["자가 치유", "Sosa"]},
        "critical_hit_accuracy": {"aliases": ["치명타 명중률"]},
        "override_protocol_kills": {"aliases": ["오버라이드 프로토콜로 처치"]},
    },
    "widowmaker": {
        "scoped_accuracy": {"aliases": ["저격 명중률"]},
        "recon_assists": {"aliases": ["처치 시야 지원"]},
        "final_blows": {"aliases": ["결정타"]},
        "scoped_critical_hit_accuracy": {"aliases": ["저격 치명타 명중률"]},
        "venom_mine_kills": {"aliases": ["맹독 지뢰로 처치", "맹독 지뢰로저치"]},
        "solo_kills": {"aliases": ["단독 처치", "단독 저지"]},
        "scoped_critical_hit_kills": {"aliases": ["저격 치명타 처치", "저격치명타처치"]},
    },
    "wuyang": {
        "weapon_accuracy": {"aliases": ["무기 명중률"]},
        "guardian_wave_kills": {"aliases": ["수호의 파도로 처치"]},
        "water_staff_direct_hits": {"aliases": ["현무 지팡이 직격", "물 지팡이 직격"]},
        "healing_amplified": {"aliases": ["치유 증폭", "회복의 물결 치유 강화"]},
        "tidal_blast_kills": {"aliases": ["해일 폭발로 처치", "하일 폭발로 처치"]},
        "direct_hit_accuracy": {"aliases": ["직격 명중률", "직격 적중률"]},
        "players_saved": {"aliases": ["구한 플레이어"]},
        "self_healing": {"aliases": ["자가 치유"]},
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
    "ramattra": ["라마트라", "RAMATTRA"],
    "lifeweaver": ["라이프위버", "LIFEWEAVER"],
    "reinhardt": ["라인하르트", "REINHARDT"],
    "lucio": ["루시우", "LUCIO", "LÚCIO"],
    "reaper": ["리퍼", "REAPER"],
    "mauga": ["마우가", "MAUGA"],
    "mercy": ["메르시", "MERCY"],
    "mei": ["메이", "MEI"],
    "mizuki": ["미즈키", "MIZUKI"],
    "baptiste": ["바티스트", "BAPTISTE"],
    "brigitte": ["브리기테", "BRIGITTE"],
    "sojourn": ["소전", "SOJOURN"],
    "soldier76": ["솔저: 76", "솔저76", "솔저", "SOLDIER: 76", "SOLDIER 76"],
    "sigma": ["시그마", "SIGMA"],
    "shion": ["시온", "SHION"],
    "anran": ["안란", "ANRAN"],
    "ashe": ["애쉬", "ASHE"],
    "echo": ["에코", "ECHO"],
    "emre": ["엠레", "EMRE"],
    "widowmaker": ["위도우메이커", "WIDOWMAKER"],
    "wuyang": ["우양", "WUYANG"],
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
    "ramattra": [
        "weapon_accuracy","ravenous_vortex_kills","objective_contest_time",
        "pummel_accuracy","annihilation_efficiency","players_saved",
        "pummel_kills","annihilation_kills",
    ],
    "lifeweaver": [
        "thorn_volley_kills","self_healing","players_saved",
        "life_grip_saves","weapon_accuracy","tree_of_life_healing",
    ],
    "reinhardt": [
        "charge_kills","knockback_kills","objective_contest_time","fire_strike_kills",
        "earthshatter_hits","players_saved","fire_strike_accuracy","earthshatter_stuns",
    ],
    "lucio": [
        "healing_boost_usage","knockback_kills","players_saved","speed_boost_usage",
        "environmental_kills","weapon_accuracy","players_knocked_back","sound_barriers_provided",
    ],
    "reaper": [
        "weapon_accuracy","death_blossom_kills","final_blows",
        "critical_hit_accuracy","solo_kills","self_healing",
    ],
    "mauga": [
        "weapon_accuracy","self_healing","objective_contest_time","critical_damage",
        "overhealth_generated","players_saved","overrun_kills","cage_fight_kills",
    ],
    "mercy": [
        "damage_amplified","players_resurrected","players_saved","damage_boost_beam_usage",
        "valkyrie_healing","blaster_kills","healing_beam_usage","valkyrie_damage",
    ],
    "mei": [
        "weapon_accuracy","enemies_frozen","final_blows","icicle_accuracy",
        "blizzard_kills","solo_kills","icicle_critical_hit_accuracy",
    ],
    "mizuki": [
        "healing_hat_healing","enemies_bound","players_saved","barrier_sanctuary_absorbed",
        "spirit_shuriken_accuracy","weapon_accuracy","healing_hat_accuracy","ultimates_negated",
    ],
    "baptiste": [
        "healing_accuracy","deaths_prevented","players_saved","critical_hit_accuracy",
        "amplification_matrix_assists","weapon_accuracy","damage_amplified",
    ],
    "brigitte": [
        "inspire_triggers","inspire_uptime","shield_bash_kills",
        "knockback_kills","whip_shot_accuracy","overhealth_provided",
    ],
    "sojourn": [
        "weapon_accuracy","charged_shot_kills","long_range_final_blows",
        "charged_shot_accuracy","disruptor_shot_kills","solo_kills",
        "charged_shot_critical_hit_accuracy","overclock_kills",
    ],
    "soldier76": [
        "weapon_accuracy","long_range_final_blows","final_blows",
        "critical_hit_accuracy","helix_rocket_kills","self_healing",
        "helix_rocket_accuracy","tactical_visor_kills",
    ],
    "sigma": [
        "weapon_accuracy","accretion_accuracy","objective_contest_time",
        "direct_hit_accuracy","overhealth_generated","players_saved",
        "accretion_kills","gravity_flux_kills",
    ],
    "shion": [
        "weapon_accuracy","joyride_damage","joyride_kills",
        "critical_hit_accuracy","satsuriku_spree_kills","solo_kills",
        "execution_kills",
    ],
    "anran": [
        "weapon_accuracy","enemies_ignited","critical_hit_kills",
        "fan_the_flames_accuracy","dancing_blaze_kills","final_blows",
        "critical_hit_damage","ultimate_kills",
    ],
    "ashe": [
        "scoped_accuracy","dynamite_kills","final_blows",
        "scoped_critical_hit_accuracy","bob_kills","solo_kills","long_range_final_blows",
    ],
    "echo": [
        "weapon_accuracy","sticky_bomb_accuracy","final_blows",
        "focusing_beam_accuracy","sticky_bomb_kills","solo_kills",
        "focusing_beam_kills","duplicate_kills",
    ],
    "emre": [
        "weapon_accuracy","siphon_blaster_damage","final_blows","scoped_accuracy",
        "cyber_fragment_grenade_damage","self_healing","critical_hit_accuracy",
        "override_protocol_kills",
    ],
    "widowmaker": [
        "scoped_accuracy","recon_assists","final_blows",
        "scoped_critical_hit_accuracy","venom_mine_kills","solo_kills",
        "scoped_critical_hit_kills",
    ],
    "wuyang": [
        "weapon_accuracy","guardian_wave_kills","water_staff_direct_hits",
        "healing_amplified","tidal_blast_kills","direct_hit_accuracy","self_healing",
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
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.96
    return SequenceMatcher(None, a, b).ratio()


def infer_hero_from_metric_labels(labels: list[str]) -> dict[str, Any]:
    """Infer hero only from labels that are unique to one registered hero.

    Shared labels such as objective contest time / players saved must never be
    enough to identify a hero. Two unique metric matches are required.
    """
    normalized=[normalize_metric_label(v) for v in labels if normalize_metric_label(v)]

    alias_owners: dict[str,set[str]]={}
    for owner,metrics in HERO_METRICS.items():
        for meta in metrics.values():
            for alias in meta.get("aliases", []):
                alias_norm=normalize_metric_label(alias)
                if alias_norm:
                    alias_owners.setdefault(alias_norm,set()).add(owner)

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
                    alias_norm=normalize_metric_label(alias)
                    if len(alias_owners.get(alias_norm,set()))!=1:
                        continue
                    score=_label_similarity(label,alias_norm)
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
    confidence=min(0.99,0.60+0.10*count+0.08*max(0,count-second_count)) if confident else 0.0

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

