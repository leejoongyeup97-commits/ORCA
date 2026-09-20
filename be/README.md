# ORCA OCR backend v0.1

4종 화면(summary/team/personal/replay)을 처음부터 모두 받는 OCR 백엔드 뼈대입니다.

## 실행 (Windows)
`START_OCR.bat` 더블클릭. 최초 1회 Python 패키지를 설치합니다.

- 상태 확인: http://localhost:8001/health
- API 문서: http://localhost:8001/docs

현재 단계:
- Summary: 승/패, 경기시간, 최종점수 후보 추출
- Team: 10행 숫자 통계 ROI 추출. 영웅 초상화 매칭은 기준 이미지 라이브러리 추가 후 연결
- Personal: 상세 통계 OCR 원문 + 숫자/라벨 후보 추출
- Replay: 왼쪽 이벤트 목록의 시간/이벤트 후보 추출

OCR 결과는 반드시 사용자 검수 후 확정 DB에 반영하는 구조를 전제로 합니다.

## v0.9.2-dev debugging
If `/extract` fails, the OCR console now prints the filename, screen type, exception type/message, and full Python traceback between `EXTRACT FAILED` separators.
