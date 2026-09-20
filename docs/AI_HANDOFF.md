# ORCA AI HANDOFF

이 브랜치(`coordination`)는 FE/BE/OCR 작업자와 각자의 AI가 공통으로 읽는 작업 조율 전용 브랜치입니다.

## 브랜치 역할
- `main`: 안정판
- `fe-dev`: FE 개발
- `be-dev`: Supabase / OCR 개발
- `integration`: FE + BE 통합 테스트
- `coordination`: 작업 요청 / 인수인계 / 공통 규칙

## 작업 시작 규칙
각 AI는 작업 시작 전에 반드시 아래 파일을 읽습니다.
1. `docs/AI_HANDOFF.md`
2. 자신의 담당 영역으로 들어온 요청 파일

FE 작업자는:
- `docs/requests/FE_REQUESTS.md`

BE/OCR 작업자는:
- `docs/requests/BE_REQUESTS.md`

## 요청 기록 규칙
다른 파트의 수정이 필요하면 상대 파트 코드를 임의로 고치기 전에 요청 로그를 남깁니다.

요청에는 아래를 적습니다.
- 날짜
- 상태: TODO / IN_PROGRESS / DONE / BLOCKED
- 요청한 쪽
- 작업 대상 브랜치
- 관련 파일
- 필요한 변경
- 이유
- 완료 기준
- 완료 커밋 또는 PR

## 공통 개발 원칙
- `main` 직접 개발 금지
- FE 기능 개발은 `fe-dev`
- BE/OCR 개발은 `be-dev`
- 실제 연동 검증은 `integration`
- PC마다 달라질 수 있는 경로/키/주소는 코드에 하드코딩하지 않음
- 환경 차이는 환경변수나 설정값으로 처리
- `.env.local`, 비밀키, 개인 토큰은 GitHub에 올리지 않음
- 통합 테스트에서 발견한 원인이 FE라면 FE 요청 로그, BE/OCR이라면 BE 요청 로그에 되돌려 기록

## 현재 연동 기준
- Frontend: Next.js, 기본 포트 3040
- OCR API: Python/FastAPI, 기본 포트 8001
- FE → OCR: `/health`, `/extract`
- 경기 저장은 아직 Mock Adapter가 중심이며 Supabase 실제 저장은 BE 작업에서 연결 예정

## AI에게 처음 보낼 문장
### FE AI
`coordination` 브랜치의 `docs/AI_HANDOFF.md`와 `docs/requests/FE_REQUESTS.md`를 먼저 읽고, FE 요청사항부터 처리해줘. 작업 중 BE/OCR 수정이 필요하면 직접 고치지 말고 `docs/requests/BE_REQUESTS.md`에 요청을 남겨줘.

### BE/OCR AI
`coordination` 브랜치의 `docs/AI_HANDOFF.md`와 `docs/requests/BE_REQUESTS.md`를 먼저 읽고, BE/OCR 요청사항부터 처리해줘. 작업 중 FE 수정이 필요하면 직접 고치지 말고 `docs/requests/FE_REQUESTS.md`에 요청을 남겨줘.
