# BE / OCR REQUESTS

FE 쪽에서 BE/OCR 수정이 필요할 때 남기는 요청 로그입니다.

## 사용 방법
새 요청은 아래 형식을 복사해서 맨 위에 추가합니다.

```
### YYYY-MM-DD · 요청 제목
- 상태: TODO
- 요청자: FE
- 대상 브랜치: be-dev
- 관련 파일:
  - be/...
- 필요한 변경:
  - ...
- 이유:
  - ...
- 완료 기준:
  - ...
- 완료 커밋/PR:
  - 미완료
```

## 요청 목록

### 2026-09-20 · Tesseract 설치 경로를 환경설정으로 처리
- 상태: TODO
- 요청자: FE / integration
- 대상 브랜치: be-dev
- 관련 파일:
  - be/orca_ocr/engine.py
  - 필요 시 be/.env.example 또는 실행 스크립트
- 필요한 변경:
  - `TESSERACT_CMD` 환경변수가 있으면 해당 경로를 최우선으로 사용
  - 환경변수가 없으면 일반 설치 경로와 PATH를 자동 탐색
  - C: 또는 D: 같은 특정 드라이브만 전제로 하드코딩하지 않기
  - 실행 파일을 못 찾으면 확인한 경로와 설정 방법이 오류 메시지에 보이게 하기
- 이유:
  - 사용자 PC마다 Tesseract 설치 위치가 다름
  - 현재 integration에서 D: 설치 대응을 임시로 추가했지만 정식 수정은 be-dev에서 필요
- 완료 기준:
  - C: 설치 PC와 D: 설치 PC 모두 동일 코드로 OCR 서버 실행 가능
  - `/health`에서 executable, has_eng, has_kor 확인 가능
- 완료 커밋/PR:
  - 미완료
