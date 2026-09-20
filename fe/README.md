# ORCA Frontend v0.8

## 이번 통합
현재 `fe-dev`는 기존 ORCA 프론트 흐름과 여자친구 버전의 사용자-facing 요소를 합친 버전입니다.

유지한 현재 FE:
- 공통 사이드바 / 대시보드
- 경기 등록 및 자동 분류
- 경기 목록 검색 / 상태 필터
- 경기 상세 / 수정 / 삭제
- OCR 검수 상태 흐름
- 확정 경기 기초 분석
- 가설 Mock CRUD
- Mock 데이터 백업 / 복원 / 초기화

여자친구 버전에서 합친 요소:
- ORCA 브랜딩
- `/login` 로그인 화면
- Supabase URL / Publishable Key 환경변수 규격
- Supabase Auth 로그인 흐름을 위한 임시 Auth Bridge
- ORCA 실행 파일 `START_ORCA.bat`

## 중요한 구조
실제 경기 저장 / OCR 백엔드는 아직 현재 Adapter 구조를 유지합니다.

```
UI
  ↓
MatchManagementAdapter
  ↓
Mock Backend (현재)
  ↓
실제 Supabase / OCR Adapter (추후 교체)
```

여자친구 버전에 있던 Supabase 직접 업로드와 OCR 직접 호출 코드는 UI 컴포넌트에 그대로 섞지 않았습니다.
백엔드 구조가 확정되면 Adapter 구현으로 옮기는 방향입니다.

## 현재 경로
- `/` : 대시보드
- `/login` : ORCA 로그인
- `/matches/new` : 경기 등록 및 스크린샷 검수
- `/matches` : 경기 목록
- `/matches/[id]` : 경기 상세 / 수정 / 삭제 / OCR 검수
- `/analysis` : 확정 경기 기초 분석
- `/hypotheses` : 가설 관리
- `/settings` : 개발 환경 및 Mock 데이터 관리

## Supabase 로그인 설정
`fe/.env.example`을 참고해 `.env.local`을 만듭니다.

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

환경변수가 없으면 로그인 화면에서 Mock 모드로 계속 사용할 수 있습니다.

## 아직 실제 연결하지 않은 기능
- Supabase Storage 실제 업로드
- Supabase 경기 DB CRUD
- Python OCR 실제 결과
- OCR 구조화 데이터 검수
- 10인 스코어보드 / 개인 영웅 상세 구조화
- 실제 통계 / ML / AI 해석

## 실행
권장:
`START_ORCA.bat`

기존 `START_OVERWATCH.bat`도 호환용으로 남겨둡니다.

기본 주소:
`http://localhost:3040/`
