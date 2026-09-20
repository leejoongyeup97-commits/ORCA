# BE / OCR / SUPABASE LOG

Backend, OCR, Supabase 관련 작업 내용과 전달사항을 기록합니다.

## 현재 로그

### 2026-09-20 · Tesseract 경로 설정
- 상태: TODO
- 내용: 사용자 PC마다 설치 위치가 달라도 OCR이 실행되도록 경로 설정 방식을 정리
- 관련: `be/orca_ocr/engine.py`
- 참고: integration 브랜치의 임시 D: 경로 대응을 대체하는 정식 수정입니다. 이 작업 완료 후 integration 브랜치를 삭제해도 됩니다.
- 완료 커밋: 미완료


### 2026-09-20 · Team OCR v3 비교 및 롤백
- 상태: DONE
- 내용: 숫자 component 경계 검출 v3를 테스트했으나 v2 대비 정확도 이득 없이 처리시간이 29.8초 → 36.8초로 증가하여 v2로 롤백
- 관련: `be/orca_ocr/engine.py`
- 완료 커밋: `3902e9c41acab932c0420eed306c823832fb4939`

### 2026-09-20 · Team OCR 정확도 개선
- 상태: IN_PROGRESS
- 내용: v2(약 30초)를 기준선으로 유지. 다음 단계는 스코어보드 통계값의 잘림/오인식 개선이며, 속도 악화 없이 정확도 개선을 우선
- 관련: `be/orca_ocr/engine.py`


### 2026-09-20 · Team OCR 열 중심 보정
- 상태: IN_PROGRESS
- 내용: v2 속도/판독 방식을 유지하면서, 다자리 숫자에서 한 숫자 획에 열 중심이 끌리는 문제를 줄이도록 통계 열 중심 검출을 가중 중심 방식으로 변경
- 관련: `be/orca_ocr/engine.py`
- 테스트 필요: 동일 Team 이미지에서 처리시간 약 30초 유지 여부 및 피해/치유/경감 값 비교
- 작업 커밋: `beba40c2d95ee114ee693b66f2cce38845185786`
