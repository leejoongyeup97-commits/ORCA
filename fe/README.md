# ORCA Frontend v0.9

## 현재 FE 범위
- ORCA 공통 사이드바 / 대시보드
- 로그인 화면 및 Supabase Auth 준비 구조
- 경기 등록 / 자동 분류 / 이미지 검수
- 경기 목록 검색 / 상태 필터
- 경기 상세 CRUD
- Mock OCR 상태 흐름
- 10인 스코어보드 OCR 검수 UI
- 내 영웅 상세 OCR 검수 UI
- 확정 경기 기초 분석
- 인사이트 화면
- 사전 가설 Library
- Mock 데이터 백업 / 복원 / 초기화

## 가설 구조
사용자가 가설을 직접 작성하지 않습니다.

ORCA가 처음부터 사전 가설 Library를 가지고 있고, 데이터가 쌓이면 각 가설의 최소 표본과 필수 데이터 준비 상태를 계산합니다.

현재 사전 가설은 다음 영역으로 구성됩니다.
- 개인 퍼포먼스
- 팀 상대값
- 맵 / 상황
- 아군 / 상대 조합
- 패치 / 메타
- 장기 변화 / 듀오

이후 ML이 발견한 패턴은 별도의 candidate 가설로 추가하는 구조입니다.

## 주요 경로
- `/` : 대시보드
- `/login` : ORCA 로그인
- `/matches/new` : 경기 등록 / 자동 분류
- `/matches` : 경기 목록
- `/matches/[id]` : 경기 상세 / 수정 / 삭제 / OCR 검수
- `/analysis` : 확정 경기 기초 분석
- `/insights` : 최근 변화 / 데이터 완성도 / 다음 검증 포인트
- `/hypotheses` : 사전 가설 Registry
- `/settings` : 개발 환경 / Mock 데이터 관리

## 경기 상세 OCR 검수
현재 Mock 환경에서도 실제 OCR 결과가 들어올 자리를 미리 만들었습니다.

- 우리 팀 5명
- 상대 팀 5명
- 닉네임
- 영웅
- 처치
- 도움
- 죽음
- 피해
- 치유
- 피해 경감
- 내 플레이 영웅
- 플레이 시간
- 명중률
- 치명타
- 영웅 고유 지표

검수 초안은 브라우저 localStorage에 자동 저장됩니다.

## 현재 구조

```
UI
  ↓
MatchManagementAdapter
  ↓
Mock Backend (현재)
  ↓
실제 Supabase / OCR Adapter (추후 교체)
```

백엔드 구조가 확정되기 전까지 Supabase 경기 저장과 Python OCR 호출은 UI에 직접 섞지 않습니다.

## Supabase 로그인 설정
`fe/.env.example`을 참고해 `.env.local`을 만듭니다.

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

환경변수가 없으면 Mock 모드로 계속 사용할 수 있습니다.

## 아직 실제 연결하지 않은 기능
- Supabase Storage 실제 업로드
- Supabase 경기 DB CRUD
- Python OCR 실제 결과
- OCR 신뢰도 기반 필드 강조
- 패치 / 메타 자동 수집
- 프로필 Snapshot OCR
- 실제 통계 / ML / AI 해석

## 실행
권장:
`START_ORCA.bat`

기존 `START_OVERWATCH.bat`도 호환용으로 남겨둡니다.

기본 주소:
`http://localhost:3040/`
