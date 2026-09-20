export type HypothesisCategory =
  | "performance"
  | "team_relative"
  | "context"
  | "composition"
  | "meta"
  | "trend";

export type HypothesisDataKey =
  | "result"
  | "map"
  | "mode"
  | "hero"
  | "player_stats"
  | "hero_detail"
  | "team_comp"
  | "manual_context"
  | "patch"
  | "meta_snapshot"
  | "profile_snapshot"
  | "duo_link";

export type HypothesisPriority = "high" | "medium" | "explore";

export type HypothesisTemplate = {
  id: string;
  category: HypothesisCategory;
  title: string;
  question: string;
  rule: string;
  requiredData: HypothesisDataKey[];
  minSamples: number;
  priority: HypothesisPriority;
};

export const HYPOTHESIS_CATEGORY_META: Record<
  HypothesisCategory,
  { label: string; description: string }
> = {
  performance: {
    label: "개인 퍼포먼스",
    description: "내 플레이 지표 변화와 승패의 관계",
  },
  team_relative: {
    label: "팀 상대값",
    description: "팀 안에서 내가 차지한 비중과 상대 역할군 대비 차이",
  },
  context: {
    label: "맵 · 상황",
    description: "맵, 모드, 선공/선수비 등 경기 맥락",
  },
  composition: {
    label: "조합",
    description: "아군/상대 영웅과 내 영웅의 상호작용",
  },
  meta: {
    label: "패치 · 메타",
    description: "패치와 외부 메타 변화가 개인 성과에 미친 영향",
  },
  trend: {
    label: "장기 변화",
    description: "최근 폼, 티어, 플레이 습관과 듀오 효과의 변화",
  },
};

export const HYPOTHESIS_DATA_LABELS: Record<HypothesisDataKey, string> = {
  result: "승패",
  map: "맵",
  mode: "게임 모드",
  hero: "내 영웅",
  player_stats: "10인 스코어보드",
  hero_detail: "내 영웅 상세",
  team_comp: "양 팀 영웅 조합",
  manual_context: "선공/선수비·세부맵",
  patch: "패치",
  meta_snapshot: "공식 메타",
  profile_snapshot: "프로필 스냅샷",
  duo_link: "듀오 경기 연결",
};

export const PREDEFINED_HYPOTHESES: HypothesisTemplate[] = [
  {
    id: "perf-deaths-above-average",
    category: "performance",
    title: "데스 증가와 승률",
    question: "내 평균보다 데스/10분이 증가한 경기에서 승률이 낮아지는가?",
    rule: "deaths_per_10 > personal_baseline → compare win rate",
    requiredData: ["result", "player_stats"],
    minSamples: 30,
    priority: "high",
  },
  {
    id: "perf-elims-above-average",
    category: "performance",
    title: "처치 증가와 승률",
    question: "내 평균보다 처치/10분이 높은 경기에서 승률이 달라지는가?",
    rule: "elims_per_10 > personal_baseline → compare win rate",
    requiredData: ["result", "player_stats"],
    minSamples: 30,
    priority: "high",
  },
  {
    id: "perf-assists-above-average",
    category: "performance",
    title: "도움 증가와 승률",
    question: "도움/10분이 높은 경기에서 승률이 달라지는가?",
    rule: "assists_per_10 > personal_baseline → compare win rate",
    requiredData: ["result", "player_stats"],
    minSamples: 30,
    priority: "medium",
  },
  {
    id: "perf-damage-above-average",
    category: "performance",
    title: "피해량 증가와 승률",
    question: "피해/10분이 내 평소보다 높은 경기에서 승률이 달라지는가?",
    rule: "damage_per_10 > personal_baseline → compare win rate",
    requiredData: ["result", "player_stats"],
    minSamples: 30,
    priority: "high",
  },
  {
    id: "perf-healing-above-average",
    category: "performance",
    title: "치유량 증가와 승률",
    question: "치유/10분이 내 평소보다 높은 경기에서 승률이 달라지는가?",
    rule: "healing_per_10 > personal_baseline → compare win rate",
    requiredData: ["result", "player_stats"],
    minSamples: 30,
    priority: "medium",
  },
  {
    id: "perf-mitigation-above-average",
    category: "performance",
    title: "피해 경감과 승률",
    question: "피해 경감/10분이 높은 경기에서 승률이 달라지는가?",
    rule: "mitigation_per_10 > personal_baseline → compare win rate",
    requiredData: ["result", "player_stats"],
    minSamples: 30,
    priority: "medium",
  },
  {
    id: "perf-accuracy",
    category: "performance",
    title: "명중률 변화와 승률",
    question: "내 영웅별 평균보다 명중률이 높은 경기에서 승률이 높아지는가?",
    rule: "accuracy > hero_baseline → compare win rate",
    requiredData: ["result", "hero", "hero_detail"],
    minSamples: 25,
    priority: "medium",
  },
  {
    id: "perf-crit",
    category: "performance",
    title: "치명타 지표와 승률",
    question: "치명타 관련 지표가 좋은 경기에서 승률이 달라지는가?",
    rule: "critical_metric > hero_baseline → compare win rate",
    requiredData: ["result", "hero", "hero_detail"],
    minSamples: 25,
    priority: "explore",
  },

  {
    id: "team-damage-share",
    category: "team_relative",
    title: "팀 딜 비중과 승률",
    question: "팀 전체 피해 중 내 비율이 높을 때 승률이 달라지는가?",
    rule: "my_damage / team_damage → grouped win rate",
    requiredData: ["result", "player_stats"],
    minSamples: 30,
    priority: "high",
  },
  {
    id: "team-heal-share",
    category: "team_relative",
    title: "팀 치유 비중과 승률",
    question: "팀 전체 치유 중 내 비율이 높을 때 승률이 달라지는가?",
    rule: "my_healing / team_healing → grouped win rate",
    requiredData: ["result", "player_stats"],
    minSamples: 30,
    priority: "medium",
  },
  {
    id: "team-death-share",
    category: "team_relative",
    title: "팀 데스 비중과 승률",
    question: "팀 전체 데스 중 내 비율이 높아질수록 승률이 낮아지는가?",
    rule: "my_deaths / team_deaths → grouped win rate",
    requiredData: ["result", "player_stats"],
    minSamples: 30,
    priority: "high",
  },
  {
    id: "team-role-diff",
    category: "team_relative",
    title: "같은 역할 상대와 성과 차이",
    question: "같은 역할의 상대보다 내 핵심 지표가 우세할 때 승률이 달라지는가?",
    rule: "my_role_metric - opponent_role_metric → win rate",
    requiredData: ["result", "player_stats", "team_comp"],
    minSamples: 35,
    priority: "high",
  },
  {
    id: "team-performance-spread",
    category: "team_relative",
    title: "팀 내 퍼포먼스 편차",
    question: "팀원 간 성과 편차가 큰 경기에서 승률이 달라지는가?",
    rule: "team_metric_dispersion → compare win rate",
    requiredData: ["result", "player_stats"],
    minSamples: 40,
    priority: "explore",
  },
  {
    id: "team-my-outlier",
    category: "team_relative",
    title: "내 성과가 팀 평균에서 벗어난 정도",
    question: "내 지표가 팀 평균보다 크게 높거나 낮을 때 경기 결과가 달라지는가?",
    rule: "my_metric z-score within team → compare result",
    requiredData: ["result", "player_stats"],
    minSamples: 40,
    priority: "explore",
  },

  {
    id: "context-map",
    category: "context",
    title: "맵별 승률 차이",
    question: "특정 맵에서 내 승률이 전체 평균과 반복적으로 다른가?",
    rule: "map_name → compare win rate against personal baseline",
    requiredData: ["result", "map"],
    minSamples: 40,
    priority: "high",
  },
  {
    id: "context-mode",
    category: "context",
    title: "게임 모드별 승률 차이",
    question: "호위, 점령, 쟁탈 등 모드별로 내 승률 차이가 있는가?",
    rule: "game_mode → grouped win rate",
    requiredData: ["result", "mode"],
    minSamples: 40,
    priority: "medium",
  },
  {
    id: "context-map-hero",
    category: "context",
    title: "맵 × 내 영웅",
    question: "같은 영웅이라도 특정 맵에서 성과와 승률이 달라지는가?",
    rule: "map_name × my_hero → interaction effect",
    requiredData: ["result", "map", "hero"],
    minSamples: 60,
    priority: "high",
  },
  {
    id: "context-attack-defense",
    category: "context",
    title: "선공/선수비 효과",
    question: "같은 맵에서 선공과 선수비에 따라 승률이 달라지는가?",
    rule: "side × map_name → compare win rate",
    requiredData: ["result", "map", "manual_context"],
    minSamples: 50,
    priority: "medium",
  },
  {
    id: "context-control-submap",
    category: "context",
    title: "쟁탈 세부 맵",
    question: "쟁탈의 특정 세부 맵에서 반복적으로 성과 차이가 발생하는가?",
    rule: "control_submap → grouped result",
    requiredData: ["result", "manual_context"],
    minSamples: 50,
    priority: "medium",
  },
  {
    id: "context-round-order",
    category: "context",
    title: "세부 맵 진행 순서",
    question: "세트 또는 세부 맵 진행 순서에 따라 이후 승률이 달라지는가?",
    rule: "round_sequence → next_round / match result",
    requiredData: ["result", "manual_context"],
    minSamples: 60,
    priority: "explore",
  },
  {
    id: "context-match-length",
    category: "context",
    title: "긴 경기와 성과 변화",
    question: "경기 시간이 길어질수록 내 데스나 효율이 악화되는가?",
    rule: "match_duration × personal_metrics → result",
    requiredData: ["result", "player_stats"],
    minSamples: 40,
    priority: "explore",
  },

  {
    id: "comp-ally-hero",
    category: "composition",
    title: "특정 아군 영웅과의 궁합",
    question: "특정 아군 영웅과 함께할 때 내 승률이 달라지는가?",
    rule: "ally_hero present → compare win rate",
    requiredData: ["result", "team_comp"],
    minSamples: 60,
    priority: "high",
  },
  {
    id: "comp-enemy-hero",
    category: "composition",
    title: "특정 상대 영웅 상성",
    question: "특정 상대 영웅이 있을 때 내 승률이나 데스가 달라지는가?",
    rule: "enemy_hero present → compare result and deaths",
    requiredData: ["result", "team_comp", "player_stats"],
    minSamples: 60,
    priority: "high",
  },
  {
    id: "comp-ally-myhero",
    category: "composition",
    title: "아군 영웅 × 내 영웅",
    question: "내가 선택한 영웅과 특정 아군 영웅의 조합에서 승률 차이가 있는가?",
    rule: "ally_hero × my_hero → interaction effect",
    requiredData: ["result", "team_comp", "hero"],
    minSamples: 80,
    priority: "high",
  },
  {
    id: "comp-enemy-myhero",
    category: "composition",
    title: "상대 영웅 × 내 영웅",
    question: "내 영웅이 특정 상대 영웅을 만났을 때 성과 차이가 있는가?",
    rule: "enemy_hero × my_hero → interaction effect",
    requiredData: ["result", "team_comp", "hero"],
    minSamples: 80,
    priority: "high",
  },
  {
    id: "comp-full-team",
    category: "composition",
    title: "특정 아군 조합 패턴",
    question: "특정 역할/영웅 조합 패턴에서 내 승률이 반복적으로 달라지는가?",
    rule: "team_composition cluster → compare win rate",
    requiredData: ["result", "team_comp"],
    minSamples: 100,
    priority: "explore",
  },
  {
    id: "comp-mode",
    category: "composition",
    title: "조합 × 게임 모드",
    question: "같은 조합 유형이라도 게임 모드에 따라 효과가 달라지는가?",
    rule: "composition cluster × game_mode → interaction effect",
    requiredData: ["result", "team_comp", "mode"],
    minSamples: 100,
    priority: "explore",
  },

  {
    id: "meta-patch-before-after",
    category: "meta",
    title: "패치 전/후 내 성과",
    question: "같은 영웅의 내 성과가 패치 전후로 실제 변했는가?",
    rule: "patch boundary × my_hero → compare personal metrics",
    requiredData: ["result", "hero", "player_stats", "patch"],
    minSamples: 50,
    priority: "high",
  },
  {
    id: "meta-official-winrate",
    category: "meta",
    title: "공식 승률 변화와 내 승률",
    question: "영웅 공식 승률 변화와 내 개인 승률 변화가 같은 방향인가?",
    rule: "official_winrate_delta vs personal_winrate_delta",
    requiredData: ["result", "hero", "meta_snapshot"],
    minSamples: 60,
    priority: "high",
  },
  {
    id: "meta-pickrate",
    category: "meta",
    title: "픽률 변화와 내 경기",
    question: "영웅 픽률이 급변한 기간에 내 매치업이나 승률도 변하는가?",
    rule: "official_pickrate_delta → personal matchup/result shift",
    requiredData: ["result", "team_comp", "meta_snapshot"],
    minSamples: 70,
    priority: "medium",
  },
  {
    id: "meta-banrate",
    category: "meta",
    title: "밴률 변화와 내 경기",
    question: "밴률 변화가 큰 패치 구간에서 내 영웅 선택과 승률이 달라지는가?",
    rule: "banrate_delta × my_hero → result shift",
    requiredData: ["result", "hero", "meta_snapshot"],
    minSamples: 70,
    priority: "explore",
  },
  {
    id: "meta-personal-vs-tier",
    category: "meta",
    title: "내 변화와 동일 티어 평균 비교",
    question: "내 성과 변화가 동일 티어 전체 변화보다 큰 개인적 변화인가?",
    rule: "personal_delta - same_tier_meta_delta",
    requiredData: ["result", "player_stats", "profile_snapshot", "meta_snapshot"],
    minSamples: 80,
    priority: "high",
  },

  {
    id: "trend-recent-deaths",
    category: "trend",
    title: "최근 승률 변화와 데스 변화",
    question: "최근 승률 변화 구간에서 데스/10분 변화가 함께 반복되는가?",
    rule: "rolling_winrate_delta vs rolling_deaths_per_10_delta",
    requiredData: ["result", "player_stats"],
    minSamples: 50,
    priority: "high",
  },
  {
    id: "trend-recent-accuracy",
    category: "trend",
    title: "최근 승률 변화와 명중률",
    question: "최근 승률 변화 구간에서 명중률이 의미 있게 변하는가?",
    rule: "rolling_winrate_delta vs rolling_accuracy_delta",
    requiredData: ["result", "hero_detail"],
    minSamples: 50,
    priority: "medium",
  },
  {
    id: "trend-rank",
    category: "trend",
    title: "티어 변화 전후 플레이 지표",
    question: "티어 상승 또는 하락 전후에 반복적으로 변하는 개인 지표가 있는가?",
    rule: "rank_snapshot boundary → compare rolling personal metrics",
    requiredData: ["result", "player_stats", "profile_snapshot"],
    minSamples: 70,
    priority: "medium",
  },
  {
    id: "trend-duo",
    category: "trend",
    title: "듀오 여부와 승률",
    question: "같이 플레이한 경기와 각자 플레이한 경기의 승률과 성과 차이가 있는가?",
    rule: "duo_link present → compare result and personal metrics",
    requiredData: ["result", "duo_link"],
    minSamples: 50,
    priority: "high",
  },
];

export const PREDEFINED_HYPOTHESIS_COUNT = PREDEFINED_HYPOTHESES.length;
