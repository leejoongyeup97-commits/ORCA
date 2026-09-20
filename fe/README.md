# Overwatch Insight Frontend v0.7

## 이번 버전
- 공통 사이드바 / 대시보드
- 경기 등록 및 자동 분류
- 경기 목록 검색 / 상태 필터
- 경기 상세 화면
- 경기 정보 수정 / 삭제
- Mock OCR 실행
- OCR 검수 상태 흐름
  - pending_ocr
  - processing_ocr
  - needs_review
  - confirmed
- 경기 검수 확정 / 다시 검수
- 확정 경기 기반 기초 분석
  - 전체 승률
  - 맵별
  - 영웅별
  - 모드별
- 가설 Mock CRUD
- 설정에서 Mock 데이터 JSON 백업 / 복원 / 초기화
- `local_match_key = summary:<SHA-256>`
- 연결규격 v0.1 기반 `MatchBackendAdapter`
- FE 확장 기능은 `MatchManagementAdapter`로 분리

## 현재 경로
- `/` : 대시보드
- `/matches/new` : 경기 등록 및 스크린샷 검수
- `/matches` : 경기 목록
- `/matches/[id]` : 경기 상세 / 수정 / 삭제 / OCR 검수
- `/analysis` : 확정 경기 기초 분석
- `/hypotheses` : 가설 관리
- `/settings` : 개발 환경 및 Mock 데이터 관리

## Mock 단계에서 실제로 되는 것
1. 로컬 스크린샷 자동 분류
2. 경기별 이미지 검수
3. Mock Draft 생성 및 업로드 흐름
4. `pending_ocr` 상태 생성
5. Mock OCR 실행
6. 경기 필드 수정
7. 사용자 검수 확정
8. 경기 목록 / 상세 / 삭제
9. 확정 경기 기반 단순 집계 분석
10. 가설 작성 / 수정 / 상태변경 / 삭제

## 아직 실제 연결하지 않은 기능
- Supabase 실제 Storage 업로드
- Supabase DB 저장
- Python OCR 처리 서비스
- 실제 OCR 결과
- 10인 스코어보드 구조화 데이터 검수
- 개인 영웅 상세 OCR
- 실제 통계 / ML / AI 해석
- hypotheses / hypothesis_runs 서버 저장

## 백엔드 교체 지점
`src/lib/backend/index.ts`에서 현재 Mock Adapter를 반환합니다.

기본 서버 계약은 `MatchBackendAdapter`에 유지하고, 프론트 개발용 목록 / 수정 / 삭제 / Mock OCR 기능은 `MatchManagementAdapter`에 분리했습니다.

실제 백엔드 완성 후 Adapter 구현을 Supabase/REST 구현으로 교체하는 방향입니다.

## 실행
`START_OVERWATCH.bat`을 더블클릭합니다.

기본 주소:
`http://localhost:3040/`

Windows Chrome 또는 Edge 사용을 권장합니다.
