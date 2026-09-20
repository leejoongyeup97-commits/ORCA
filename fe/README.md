# Overwatch Insight Frontend v0.5

## 이번 버전
- 스크린샷 폴더 자동 읽기
- 새 파일만 분류
- 요약 화면 기준 경기 자동 묶음
- 요약 / 팀 / 개인 / 리플레이 / 미분류 판별
- 리플레이 분류 기준 개선: 고정된 우측 하단 리플레이 컨트롤 영역 비교
- 경기별 검수 화면
- 이미지 화면 종류 직접 수정
- 이미지 제외 / 복원
- 이미지 순서 변경
- 이미지 수동 추가
- 검수 조건 확인
- `local_match_key = summary:<SHA-256>`
- 연결규격 v0.1 기반 `MatchBackendAdapter`
- Mock Backend Adapter 구현
- 검수 완료 후 Mock Draft 생성 → 파일 업로드 → `pending_ocr` 상태까지 테스트
- 같은 `local_match_key` 재호출 시 Mock에서 기존 Match 재사용

## 아직 실제 연결하지 않은 기능
- Supabase 실제 업로드
- Python OCR 처리 서비스
- OCR 결과 검수
- DB 최종 저장

## 백엔드 교체 지점
`src/lib/backend/index.ts`에서 현재 Mock Adapter를 반환합니다.

실제 백엔드 완성 후 화면 컴포넌트를 수정하지 않고 이 Adapter 구현만 Supabase/REST 구현으로 교체합니다.

## 실행
`START_OVERWATCH.bat`을 더블클릭합니다.

기본 주소:
`http://localhost:3040/matches/new`

Windows Chrome 또는 Edge 사용을 권장합니다.
