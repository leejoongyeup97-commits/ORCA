# Overwatch Insight Frontend v0.6

## 이번 버전
- 공통 사이드바 추가
- 대시보드 화면 추가
- 경기 목록 화면 추가
- 경기 상태 필터: 전체 / 확인 필요 / OCR 대기 / 완료
- 경기 등록 / 목록 / 분석 / 가설 / 설정 네비게이션 구성
- 분석 / 가설 / 설정 기본 화면 추가
- 기존 경기 등록 및 검수 화면을 공통 앱 레이아웃에 통합
- Mock backend 경기 목록 조회 지원
- 스크린샷 폴더 자동 읽기
- 요약 화면 기준 경기 자동 묶음
- 요약 / 팀 / 개인 / 리플레이 / 미분류 판별
- 경기별 검수 및 Mock 업로드
- `local_match_key = summary:<SHA-256>`
- 연결규격 v0.1 기반 `MatchBackendAdapter`
- Mock Draft 생성 → 파일 업로드 → `pending_ocr` 상태까지 테스트

## 현재 구조
- `/` : 대시보드
- `/matches/new` : 경기 등록 및 검수
- `/matches` : 경기 목록
- `/analysis` : 분석 준비 화면
- `/hypotheses` : 가설 준비 화면
- `/settings` : 설정

## 아직 실제 연결하지 않은 기능
- Supabase 실제 업로드
- Python OCR 처리 서비스
- OCR 결과 검수
- DB 최종 저장
- 경기 상세 화면

## 백엔드 교체 지점
`src/lib/backend/index.ts`에서 현재 Mock Adapter를 반환합니다.

실제 백엔드 완성 후 화면 컴포넌트를 크게 수정하지 않고 Adapter 구현을 Supabase/REST 구현으로 교체하는 구조입니다.

## 실행
`START_OVERWATCH.bat`을 더블클릭합니다.

기본 주소:
`http://localhost:3040/matches/new`

Windows Chrome 또는 Edge 사용을 권장합니다.
