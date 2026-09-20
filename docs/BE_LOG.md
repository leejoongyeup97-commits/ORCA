# BE / OCR / SUPABASE LOG

Backend, OCR, Supabase 관련 작업 내용과 전달사항을 기록합니다.

## 현재 로그

### 2026-09-20 · 제안사항: 팀 스코어보드 하이라이트 색상으로 내 행 식별
- 상태: PROPOSAL / 검토 후 작업
- 제안:
  - 닉네임 OCR로 나를 찾기보다, 팀 스코어보드에서 내 행이 주변 행보다 더 밝게 강조되는 색상/명도 차이를 이용해 `is_me`를 판정
  - 다른 플레이어 닉네임은 OCR하거나 저장하지 않음
  - 동일 닉네임 문제를 피하고, 텍스트 OCR 의존도를 줄이는 것이 목적
- 우선 확인할 것:
  - 여러 Team 스크린샷에서도 내 행 하이라이트가 일관되게 존재하는지
  - 아군/적군, 영웅/텍스트/숫자 영역 때문에 밝기 측정이 흔들리지 않는지
  - 행 전체가 아니라 배경이 잘 보이는 영역을 샘플링했을 때 안정적으로 구분되는지
  - 가장 밝은 행과 2등 행의 차이가 충분하지 않은 경우를 어떻게 미확정 처리할지
- 확인 후 구현 방향:
  - 각 행의 배경 색상/명도 점수를 계산
  - 주변 행 대비 차이가 충분한 행만 `is_me=true`
  - 판정이 애매하면 `is_me=null`로 두고 FE 검수 대상으로 넘김
  - 가능하면 `me_detection_method=row_highlight`, `me_detection_confidence`도 함께 반환
- 닉네임 관련 결정:
  - 닉네임 Pool은 사용하지 않음
  - 다른 플레이어 닉네임도 OCR/저장하지 않음
  - 내 행 식별은 닉네임이 아니라 스코어보드 행 하이라이트 방식 검토를 우선
- 관련: `be/orca_ocr/engine.py`
- 작업 조건: 위 항목을 먼저 확인하고 타당하다고 판단된 뒤 구현 시작

### 2026-09-20 · 닉네임 기반 식별안 취소
- 상태: CANCELLED
- 내용:
  - 닉네임 Pool은 사용하지 않기로 결정
  - 다른 플레이어 닉네임도 OCR/저장하지 않음
  - 내 행 식별은 Team 스코어보드의 행 하이라이트 색상/명도 차이 방식 제안을 우선 검토
- 관련: `be/orca_ocr/engine.py`
- 참고: FE의 닉네임 Pool UI와 helper도 제거됨

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


### 2026-09-20 · Team OCR 열 중심 보정 롤백
- 상태: DONE
- 결과: 처리시간 33.2초, 기존 v2 대비 일부 피해/치유 값이 크게 퇴행(예: 7434→0, 5359→8959)
- 조치: 가중 중심 열 검출을 제거하고 검증된 v2 열 검출로 복구
- 완료 커밋: `0616ea2b199dcd9f0e33cc944f6dfa34bd135b71`
- NOTE: 다음 정확도 개선은 전체 열 위치를 움직이지 않고, 동일 셀의 복수 OCR 후보/신뢰도 검수 방식으로 진행


### 2026-09-20 · Team OCR 충돌 신뢰도 처리
- 상태: IN_PROGRESS
- 내용: v2의 숫자 판독/속도는 유지하고, 기본 crop과 wider crop의 결과가 다를 때 신뢰도를 최대 0.45로 낮춰 검수 대상으로 구분
- 목적: 오인식 후보를 높은 신뢰도로 저장하는 문제 방지. 숫자 위치/ROI는 변경하지 않음
- 작업 커밋: `f26030085de75cbee8e2891cb753d3fef995c556`
- TODO: 동일 이미지에서 약 30초 처리시간 유지 및 conflict 필드 신뢰도 확인


### 2026-09-20 · Team OCR 충돌 신뢰도 테스트
- 상태: DONE
- 결과: 동일 이미지 29.5초. v2 기준선(29.8초)과 동일 수준이며 스코어보드 판독값도 기준선 유지
- 결론: 숫자 위치/판독값을 악화시키지 않고 crop 간 충돌을 낮은 신뢰도로 표시하는 로직 유지
- 검증 커밋: `f26030085de75cbee8e2891cb753d3fef995c556`
- TODO: FE 검수 화면에서 필드별 OCR confidence를 이용해 낮은 신뢰도 값을 시각적으로 표시


### 2026-09-20 · Team OCR 고정 열 중심 v4
- 상태: IN_PROGRESS
- 내용: 현재 오류 원인을 통계 열 중심의 동적 이동으로 보고, 고정된 team-board ROI에서 검증된 UI 열 중심값을 직접 사용하도록 변경. 다자리 숫자의 앞/뒤 자리 잘림 및 인접 열 이동 방지가 목적
- 유지: v2 숫자 복수 판독 + 충돌 신뢰도 처리
- 작업 커밋: `e55beee1c518b23c57b2c9c2434857f6a7edb541`
- TODO: 동일 이미지에서 처리시간과 피해/치유/경감 4자리 값 비교


### 2026-09-20 · Team OCR 고정 열 중심 v4 롤백
- 상태: DONE
- 결과: 29.6초로 속도는 유지됐으나 일부 피해값이 기준선보다 퇴행(예: 5911→59, 2908→0). 일부 값은 새 오인식(5412) 발생
- 조치: 검증된 v2 동적 열 탐색 + crop 충돌 신뢰도 처리 상태로 복구
- 완료 커밋: `80257a50b35691d78f0b871e0623f68d563f9cbc`
- NOTE: 열 중심 조정 실험은 중단. 다음은 동일 ROI에서 숫자 전처리/후보 판독 자체 개선


### 2026-09-20 · Team OCR 숫자 전처리 v5
- 상태: IN_PROGRESS
- 내용: 검증된 v2 ROI/열 위치를 유지하면서 gray/bright 후보에 adaptive threshold 숫자 후보를 1개 추가. 얇은 앞자리 숫자 보존과 다자리 판독 개선 목적
- 성능 보호: adaptive 후보는 PSM 7만 사용하여 OCR 호출 증가를 제한
- 작업 커밋: `699112623943ab555f4a0cc104219ce3843bf088`
- TODO: 동일 이미지에서 처리시간 및 피해/치유/경감 판독 비교


### 2026-09-20 · Team OCR v5 판정 + v6 적용
- 상태: IN_PROGRESS
- v5 결과: 38.1초로 기준선(약 29.5초) 대비 느려졌고 판독값 개선 없음. adaptive threshold 후보 제거
- v6 내용: 검증된 v2 판독으로 복구하고, 명백한 OCR 숫자 결합 오류만 차단하는 안전 범위 추가(K/A/D > 99, 피해/치유/경감 > 99999는 미확정 처리)
- 목적: 정상값을 임의 수정하지 않으면서 명백한 비정상값의 자동 확정 방지
- 작업 커밋: `e2aaf09b3fb004147b9b82fde12432201d186d9e`
- TODO: 동일 이미지에서 약 30초 복귀 확인. 이후 실제 정답 라벨을 기준으로 숫자 인식 개선 필요


### 2026-09-20 · PaddleOCR Team A/B 실험
- 상태: IN_PROGRESS
- 내용: 기존 /extract Tesseract 경로는 변경하지 않고 PaddleOCR 전용 `/extract-team-paddle` 엔드포인트 추가. 동일 Team 이미지에서 숫자 셀만 PaddleOCR로 읽어 정확도/속도를 비교할 수 있도록 격리
- 의존성: paddleocr / paddlepaddle 추가
- 관련 커밋: `4ee962f`, `e9c8760`, `e86b493`
- TODO: Windows Python 3.13 환경 설치 성공 여부 확인 후 동일 이미지 A/B 실행. 설치 호환성 문제 시 별도 Python 환경 또는 다른 OCR 엔진 실험으로 분리


### 2026-09-20 · PaddleOCR Team 웹 테스트 연결
- 상태: IN_PROGRESS
- 내용: 기존 경기 상세의 OCR 실행 흐름에서 Team 이미지만 `/extract-team-paddle`로 보내도록 연결. Summary/Personal/Replay는 기존 `/extract` 유지
- 목적: 기존 UI/업로드 흐름 그대로 동일 Team 이미지의 PaddleOCR 결과와 처리시간 확인
- 작업 커밋: `b66eb55d35009a18ed0553ced307cf2845e1839f`
- TODO: 동일 경기 OCR 실행 후 Team 결과 및 서버의 PADDLE elapsed 확인. 비교 후 Paddle 채택 여부 결정


### 2026-09-20 · START_OCR 의존성 동기화 수정
- 상태: DONE
- 원인: 기존 START_OCR은 .venv 최초 생성 때만 requirements.txt를 설치해서, 이후 추가된 PaddleOCR이 기존 가상환경에 설치되지 않았음
- 조치: 실행할 때마다 requirements.txt 동기화 후 PaddleOCR/Paddle import 검증. 설치/검증 실패 시 서버를 시작하지 않고 오류 표시
- 완료 커밋: `8cd556d7ebb9a392e9c1d4dedfdb3cfd614838f5`
- TODO: Pull 후 START_OCR 재실행하여 `PaddleOCR dependencies OK` 확인, 이후 Team A/B 테스트 재개


### 2026-09-20 · Supabase 세션 자동 갱신
- 상태: DONE
- 원인: 로그인 시 받은 access_token을 localStorage에 저장만 하고 만료 후 refresh_token으로 갱신하지 않아 SUPABASE_NOT_AUTHENTICATED/JWT expired가 반복될 수 있었음
- 조치: 만료 임박/만료 access token을 refresh_token으로 자동 갱신하고 Supabase Adapter가 항상 유효 세션을 사용하도록 변경
- 완료 커밋: `1d64202283723e51ce7525f47707eb3d904c734a`, `2c44acb4eb0272a6fd80f37ad027004590ae2a55`
- TODO: Pull 후 프론트 재시작/재로그인하여 경기 목록 로드 및 Paddle Team 테스트 재개


### 2026-09-20 · Supabase async 세션 호출 누락 수정
- 상태: DONE
- 원인: configAndSession을 async로 변경한 뒤 Storage 업로드/삭제/OCR 다운로드 경로 3곳이 await 없이 호출하고 있었음. 이 때문에 OCR 요청이 로컬 서버에 도달하기 전에 프론트에서 실패 가능
- 조치: 해당 경로 모두 `await configAndSession()`으로 수정
- 완료 커밋: `eedbe8f46655aba74269585091b0f293cb177cd5`
- TODO: Pull 후 프론트 재시작, 동일 경기 OCR 실행. START_OCR 창에서 POST /extract 및 /extract-team-paddle 확인


### 2026-09-20 · PaddleOCR 3.x Windows 런타임 오류 대응
- 상태: IN_PROGRESS
- 원인: PaddleOCR 3.3.1/PaddleX 경로에서 Windows CPU oneDNN 실행 중 `ConvertPirAttribute2RuntimeAttribute not support ArrayAttribute<DoubleAttribute>` 발생
- 조치: 실험 의존성을 PaddleOCR 2.10.0 + paddlepaddle 3.2.2로 고정하고, 실험 코드를 2.x `.ocr(...)` API로 전환. PaddleX 3.x 파이프라인을 우회
- 관련 커밋: `84c173d5cba34177a2e6c5e722598df692d37833`, `f52da97037bf3432b1bd84a2a14e52ab3ed54f2a`
- TODO: Pull 후 START_OCR 재실행(패키지 다운그레이드), 동일 Team OCR 테스트


### 2026-09-20 · PaddleOCR oneDNN 비활성화
- 상태: IN_PROGRESS
- 원인: PaddleOCR 2.10.0에서도 Windows CPU oneDNN 경로에서 `OneDnnContext does not have the input Filter` 오류 발생
- 조치: START_OCR에서 oneDNN/MKLDNN 관련 플래그를 비활성화하여 기본 CPU 실행 경로로 우회
- 완료 커밋: `521713cdbbb0c49bddd561b74d9bd681a95b3dee`
- TODO: Pull 후 START_OCR 재실행, 동일 Team OCR 테스트


### 2026-09-20 · PaddleOCR Predictor MKLDNN 강제 비활성화
- 상태: IN_PROGRESS
- 원인: 환경변수 수준의 oneDNN 비활성화만으로는 PaddleOCR 내부 Predictor가 여전히 oneDNN 경로를 사용해 `OneDnnContext does not have the input Filter` 오류 지속
- 조치: PaddleOCR 생성 시 `enable_mkldnn=False`, `cpu_threads=1`을 명시해 Predictor 수준에서 MKLDNN을 강제로 끔
- 작업 커밋: `b20f5abe41e64b81827313aa6fe56f59f2d4578a`
- TODO: Pull 후 START_OCR 재실행, 동일 Team OCR 테스트


### 2026-09-20 · Paddle 실험 롤백 / Tesseract 복구
- 상태: DONE
- 내용: Team OCR 웹 호출을 안정판 `/extract`로 복구. PaddleOCR/PaddlePaddle 의존성과 START_OCR의 Paddle 전용 검사/oneDNN 설정 제거
- NOTE: Paddle 실험 코드는 비교 기록용으로 남겨두되 기본 실행 경로에서는 사용하지 않음. 현재 Windows + Python 3.13 환경에서 Paddle 런타임 oneDNN 오류가 반복되어 기본 경로 채택 보류
- 완료 커밋: `b7a25e612e4451c721bb2e3d36249ff9c67f56b1`, `d7212594d3fada8343545141d789749e25d7cc88`, `6d2bfdb7c48f539bda351d2105603b2e2ed23a3f`
- TODO: 안정판 동작 확인 후 OCR 엔진 독립 벤치마크 구조에서 대체 엔진 비교


### 2026-09-20 · Team OCR 자동 벤치마크 기반 구축
- 상태: DONE
- 내용: 제공된 Team 스크린샷 10장의 10명×6개 스탯, 총 600개 숫자 셀 정답 데이터 작성
- 내용: `be/ocr_benchmark/run_team_benchmark.py` 추가. 이미지 폴더를 입력하면 현재 `extract_team`을 실행해 전체/필드별 정확도와 오답 JSON을 자동 생성
- 완료 커밋: `1983a350dcfc9e80ef95b0e73579dd647bdf3764`, `50525e96df898edca4324c24f8cff5dfec75e094`
- TODO: 10개 원본 이미지를 로컬 benchmark 폴더에 두고 기준 정확도 1회 측정. 이후 대체 숫자 인식기는 이 점수를 이길 때만 서비스 코드에 반영


### 2026-09-20 · Team OCR 기준선 측정
- 상태: DONE
- 결과: 현재 Tesseract Team OCR은 10장 / 600셀 기준 294/600 = 49.0%
- 필드별: elims 53%, assists 52%, deaths 56%, damage 41%, healing 41%, mitigation 51%
- 전체 처리시간: 411.6초
- 결론: 기존 UI confidence와 실제 정답률 차이가 커서, Team OCR은 더 이상 소규모 Tesseract 튜닝을 반복하지 않고 별도 벤치마크에서 대체 인식기를 검증한 뒤 교체
- 산출물: `be/ocr_benchmark/last_failures.json` (로컬 실행 결과)

### 2026-09-20 · ORCA 숫자 전용 템플릿 인식 실험기
- 상태: DONE
- 내용: production OCR과 분리된 숫자 전용 실험기 추가. 고정 scoreboard 셀에서 숫자 component를 분리하고, benchmark 정답값을 이용해 digit template를 자동 학습
- 검증 방식: 각 테스트 이미지를 학습에서 제외하는 leave-one-image-out 방식으로 10장을 순환 평가하여 자기 이미지 정답 누설 방지
- 관련 파일: `be/ocr_benchmark/digit_template_experiment.py`, `be/ocr_benchmark/run_digit_template_benchmark.py`
- 완료 커밋: `c70e8ab77ec28430bfa9b47cfe178def3d5b3074`, `b6f73b116acbfa740f0e8310f2352bf2c25ab3e0`
- TODO: 로컬의 10개 benchmark 원본 이미지로 새 runner 실행 후 49.0% Tesseract 기준선과 비교. 기준선을 유의미하게 이길 때만 service OCR 후보로 승격


### 2026-09-20 · 숫자 템플릿 학습 누락 수정
- 상태: DONE
- 증상: 첫 실행에서 `template training missing digits: 2, 3, 4, 7, 8, 9`로 벤치마크가 중단됨
- 원인 후보: 실험기가 production과 다른 고정 stat 열을 사용했고, 2x2 morphology 및 엄격한 component 조건으로 얇은 숫자 획이 탈락할 수 있었음
- 조치:
  - production과 동일한 `_find_stat_columns` 사용
  - 얇은 획을 지우던 morphology 제거
  - projection 기반 digit 분리로 교체
  - 학습 시 정답 digit 개수를 이용한 강제 분리 fallback 추가
  - 일부 digit template가 부족해도 즉시 종료하지 않고 coverage 경고 후 전체 벤치마크를 끝까지 실행하도록 변경
- 관련 커밋: `1bdbde73476a2d3ff1924d47255cb8cc2d5c2081`, `2dbfff2379025e1916d2d02cfb99da2103f6da3f`
- TODO: Pull 후 동일 명령 재실행하여 전체 600셀 정확도/속도와 training coverage 확인


### 2026-09-20 · 숫자 템플릿 실험 결과
- 상태: DONE
- 결과: 10장 / 600셀 기준 3/600 = 0.5%
- 필드별: elims 0%, assists 3%, deaths 0%, damage 0%, healing 0%, mitigation 0%
- 처리시간: 0.8초
- 진단: 학습 셀 540개 중 평균 fallback이 531.9개로 거의 모든 셀이 강제 분리에 의존. 테스트 시 자릿수 경계를 안정적으로 추론하지 못해 방식 자체가 부적합
- 결론: 숫자 템플릿 방식은 더 이상 미세조정하지 않고 폐기. production OCR에는 반영하지 않음

### 2026-09-20 · Grid-level Tesseract 대체 실험
- 상태: IN_PROGRESS
- 내용: 기존의 셀별 다중 Tesseract 호출 대신 전체 10x6 숫자 grid를 소수의 OCR 호출로 읽고, OCR bounding box를 기존 scoreboard 행/열 좌표에 매핑하는 독립 실험기 추가
- 목적: 셀 crop 경계 문제를 줄이고 처리시간을 크게 낮추면서 49.0% 기준선을 넘는지 확인
- 관련 파일: `be/ocr_benchmark/grid_tesseract_experiment.py`, `be/ocr_benchmark/run_grid_tesseract_benchmark.py`
- 관련 커밋: `c45d144a1a0571b4be4570bd8b71903edae17508`, `22f0a037ac20f6600e71d1b8dfd972703490d0c5`
- TODO: 로컬 10장 benchmark로 전체 정확도/속도 측정. 49.0%를 유의미하게 넘지 못하면 채택하지 않음


### 2026-09-20 · Grid-level Tesseract 벤치마크 결과
- 상태: DONE
- 결과: 10장 / 600셀 기준 315/600 = 52.5%
- 필드별: elims 53%, assists 52%, deaths 54%, damage 50%, healing 50%, mitigation 56%
- 처리시간: 17.0초
- 비교: 기존 셀별 Tesseract 49.0% / 411.6초 대비 정확도 +3.5%p, 속도 약 24배 개선
- 결론: 속도 개선은 매우 크지만 정확도 52.5%는 production 채택 기준에 부족. 현재는 실험 후보로만 유지

### 2026-09-20 · Team OCR 후보 오답 겹침 분석기
- 상태: DONE
- 내용: 기존 Tesseract와 grid Tesseract의 `last_failures.json` 결과를 재사용해 재-OCR 없이 두 방식의 오답 겹침을 계산하는 분석기 추가
- 목적: 두 방식의 정답이 서로 보완적인지 확인하여 hybrid OCR을 만들 가치가 있는지 결정
- 출력: both correct / baseline only / grid only / both wrong / 필드별 oracle 상한 / hybrid headroom
- 관련 파일: `be/ocr_benchmark/compare_team_candidates.py`
- 완료 커밋: `068d241c15bb98669914025f8edfc9f581a7ea70`
- TODO: 로컬에서 분석기 실행. oracle 상한이 충분히 높으면 confidence-based hybrid 실험, 낮으면 Tesseract 계열 조합을 중단하고 다른 OCR 계열로 이동


### 2026-09-20 · Tesseract Hybrid 가능성 판정
- 상태: DONE
- 결과: baseline 49.0%, grid 52.5%, oracle 52.8%
- 겹침: both correct 292, baseline only 2, grid only 23, both wrong 283
- 결론: 두 Tesseract 방식의 이론적 결합 상한도 52.8%라서 hybrid 구현 가치는 거의 없음. Tesseract 계열 조합 실험 종료

### 2026-09-20 · RapidOCR 독립 후보 추가
- 상태: IN_PROGRESS
- 내용: Tesseract 계열을 종료하고 다른 인식 모델 계열로 이동. RapidOCR + ONNX Runtime을 production과 분리된 benchmark 후보로 추가
- 방식: 기존 scoreboard 행/열 좌표로 60개 숫자 셀을 crop하고, RapidOCR recognition-only 모드로 숫자를 읽어 600셀 자동 채점
- 관련 파일: `be/ocr_benchmark/rapidocr_experiment.py`, `be/ocr_benchmark/run_rapidocr_benchmark.py`, `be/ocr_benchmark/requirements_rapidocr.txt`
- 관련 커밋: `1f88309b9b7c7b0c2a8b87503b73797a92b843ba`, `d344d33bd79fa2319a564b51f3f509aeae0030e9`, `2761eb44aac2c7450f76e1a527c63ba8e39e1f97`
- NOTE: 공식 RapidOCR 최신 문서 기준 `rapidocr` + `onnxruntime` 조합을 사용. production requirements에는 아직 추가하지 않음
- TODO: 별도 benchmark dependency 설치 후 10장 / 600셀 정확도와 전체 처리시간 측정. 기준선 52.5%를 유의미하게 넘지 못하면 채택하지 않음


### 2026-09-20 · RapidOCR 벤치마크 결과
- 상태: DONE
- 결과: 10장 / 600셀 기준 317/600 = 52.8%
- 필드별: elims 53%, assists 52%, deaths 56%, damage 50%, healing 50%, mitigation 56%
- 처리시간: 6.4초
- 비교: grid Tesseract 52.5% / 17.0초 대비 정확도 +0.3%p, 속도 약 2.7배 개선
- 결론: 속도는 우수하지만 정확도 개선이 거의 없어 production 채택 기준에는 부족

### 2026-09-20 · RapidOCR 오답 패턴 분석기 추가
- 상태: DONE
- 내용: 엔진을 또 바꾸기 전에 오답이 팀 색상/행 위치/0값/자릿수 잘림 중 어디에 집중되는지 확인하는 분석기 추가
- 출력: blue/red 정확도, 필드×팀 정확도, expected zero/nonzero 정확도, None/0/자릿수 오류 유형, 행별 정확도
- 관련 파일: `be/ocr_benchmark/analyze_rapidocr_failures.py`
- 완료 커밋: `5bc95b4229fbf504eda6be45990616c6fcbd3a42`
- TODO: 로컬에서 분석기 실행 후 결과에 따라 다음 실험을 결정. 구조적 문제면 crop/layout을 수정하고, 구조적 편향이 없으면 다른 OCR 계열로 이동


### 2026-09-20 · RapidOCR 구조적 원인 확인 / 적군 행 탐지 수정
- 상태: IN_PROGRESS
- 분석 결과:
  - blue 300/300 = 100.0%
  - red 17/300 = 5.7%
  - row 1~5는 모두 60/60, row 6~10은 0~10% 수준
- 결론: OCR 엔진 자체가 아니라 Team scoreboard의 하단 5개 행 좌표 탐지가 핵심 병목으로 확인됨
- 조치:
  - 기존처럼 10개 행을 한 번에 찾지 않고, 정확한 blue 5개 행을 기준으로 row spacing을 계산
  - team separator 아래에서 동일 spacing의 red 5개 행 시퀀스를 별도로 탐색하도록 RapidOCR 실험기 수정
  - production OCR은 아직 변경하지 않음
- 관련 파일: `be/ocr_benchmark/rapidocr_experiment.py`
- 완료 커밋: `03ea3bbd49159851a164fc0bb2d8e6ad2a246674`
- TODO: 동일 600셀 benchmark 재실행. red 정확도가 크게 회복되면 해당 row detector를 production 후보로 승격


### 2026-09-20 · RapidOCR 적군 행 수정 벤치마크 결과
- 상태: DONE
- 결과: 10장 / 600셀 기준 599/600 = 99.8%
- 필드별: elims 100%, assists 100%, deaths 99%, damage 100%, healing 100%, mitigation 100%
- 처리시간: 7.7초
- 비교: 기존 production Tesseract 49.0% / 411.6초 대비 정확도 +50.8%p, 전체 처리시간 약 53배 개선
- 결론: 목표 기준(최종 97% 이상)을 초과했으며 Team 숫자 인식 후보로 채택

### 2026-09-20 · RapidOCR Team reader production 승격
- 상태: IN_PROGRESS
- 내용:
  - `be/requirements.txt`에 `rapidocr>=3.9,<4`, `onnxruntime` 추가
  - `be/orca_ocr/engine.py`의 Team 경로를 검증된 RapidOCR + blue/red 분리 행 탐지 방식으로 교체
  - Summary / Personal / Replay Tesseract 경로는 변경하지 않음
  - 기존 `/extract` API 계약은 유지
  - Team 응답 `ocr_version=0.9.10-dev`, `stat_reading=rapidocr_split_rows_v1`
  - API 버전 0.2.9로 갱신
- 관련 커밋: `9c3d0f0acfebfb393cfc33c6c9b2cd064ee37472`, `3164382c29523261393b48e700f7acddfb43e594`, `3ceb6878ab683ae81013e4b926a1d1fc5dc21eae`
- TODO: Pull 후 START_OCR로 runtime dependency 동기화, production `run_team_benchmark.py` 재실행하여 599/600 수준 유지 확인 후 DONE 처리


### 2026-09-20 · RapidOCR Team reader production 검증 완료
- 상태: DONE
- production benchmark: 10장 / 600셀 기준 599/600 = 99.8%
- 필드별: elims 100%, assists 100%, deaths 99%, damage 100%, healing 100%, mitigation 100%
- 전체 처리시간: 7.4초
- 결론: 실험기와 production 코드에서 동일한 99.8% 정확도를 재현했으며 Team 숫자 OCR 교체 완료
- 현재 production Team OCR: RapidOCR + blue/red 분리 행 탐지
- 관련 production 커밋: `9c3d0f0acfebfb393cfc33c6c9b2cd064ee37472`, `3164382c29523261393b48e700f7acddfb43e594`, `3ceb6878ab683ae81013e4b926a1d1fc5dc21eae`
- NOTE: 남은 오답은 deaths 1셀. 현재 99.8% 기준에서는 production 차단 사유로 보지 않고 추후 추가 샘플이 쌓일 때 재검토


### 2026-09-20 · Team 내 행(is_me) 하이라이트 분석기 추가
- 상태: IN_PROGRESS
- 내용:
  - Team 숫자 OCR 완료 후 다음 작업으로 내 행 자동 식별 실험 시작
  - 닉네임 OCR/저장 없이 아군 5개 행의 배경 명도 차이를 비교
  - 영웅 초상화/밝은 숫자 텍스트 영향을 줄이기 위해 stats 쪽 넓은 배경에서 밝은 텍스트를 마스킹한 뒤 median/p70 명도 점수 계산
  - 가장 밝은 행과 2위 행의 margin 및 robust z-score로 confident 여부 판단
  - production `is_me`는 아직 변경하지 않음
- 관련 파일: `be/ocr_benchmark/analyze_team_highlight.py`
- 출력: `last_highlight_analysis.json`, `highlight_montage.jpg`, `highlight_debug/*.jpg`
- 완료 커밋: `aa37fe2d1f71839436cd089e8ca020b7e0530f75`
- TODO: 고정 10개 Team 이미지에서 candidate/confidence와 debug montage를 확인. 일관되면 production `is_me` 판정으로 승격


### 2026-09-20 · Team 내 행 하이라이트 검증 및 production 승격
- 상태: IN_PROGRESS
- 검증 결과:
  - 고정 10개 Team 이미지 모두 실제 강조된 내 행과 candidate가 일치
  - confident detections 10/10
  - 1위/2위 명도 margin 22.6% ~ 24.3%로 충분히 분리됨
  - candidate는 이미지에 따라 ally slot 4 또는 5였고, debug 이미지에서 실제 강조 행과 일치
- production 조치:
  - `be/orca_ocr/engine.py`에 row highlight 기반 `is_me` 판정 추가
  - 확실한 경우 해당 ally 1명만 `is_me=true`, 다른 ally는 false
  - 애매한 경우 ally 행은 `is_me=null`; enemy는 false
  - 응답에 `me_detection_method=row_highlight`, `me_detection_slot`, `me_detection_confidence`, `me_detection_margin_pct` 추가
  - Team OCR 버전 `0.9.11-dev`, API 버전 `0.2.10`
  - benchmark ground truth에 10장 `me_slots`를 추가하고 production benchmark가 `is_me` 정확도도 함께 출력하도록 확장
- FE/Supabase 연동:
  - review draft의 기존 고정값 `ally slot 1 = 나`를 제거
  - OCR `player.is_me=true`인 ally 행을 실제 '나' 행으로 반영
- 관련 커밋: `ac5ab7b7b425269806bbed1d8f5e69cbc7ca7676`, `907fd5c8e410933e0bd3778e156801cae01f7f5b`, `5efa37dbc7f5b89b2c19a1c0acf24c23e71fa36a`, `e613d734bd49035ebefe4c0b0f1484668865c0a7`, `80b1f2a6612b56406cd7e77fcb9b43b34333cf63`
- TODO: Pull 후 production `run_team_benchmark.py` 재실행하여 숫자 599/600 유지 + `is_me 10/10` 확인 후 DONE 처리


### 2026-09-20 · Team 내 행(is_me) production 검증 완료
- 상태: DONE
- production benchmark:
  - 숫자 599/600 = 99.8%
  - is_me 10/10 = 100.0%
  - 처리시간 7.5초
- 결론: Team 숫자 OCR과 내 행 자동 식별 모두 production 기준 통과
- 현재 Team 처리: RapidOCR + blue/red 분리 행 탐지 + row highlight is_me 판정


### 2026-09-20 · 다음 작업: Team 영웅 초상화 매칭 실험 시작
- 상태: IN_PROGRESS
- 배경: PRD의 다음 캡처 자동 인식 항목은 양 팀 10명 영웅 이미지 매칭
- 내용:
  - production OCR과 분리된 영웅 초상화 crop/matching 실험기 추가
  - 검증된 Team 행 좌표를 재사용해 10개 영웅 초상화를 자동 crop
  - perceptual hash 기반 reference matching 뼈대 추가
  - 10장 benchmark용 hero crop 개별 이미지 / montage / manifest 생성 runner 추가
- 관련 파일: `be/ocr_benchmark/hero_matching_experiment.py`, `be/ocr_benchmark/prepare_hero_crops.py`
- 관련 커밋: `5813ae69deff7b62e850dfec946f369afeacfed1`, `55518671f870eab8f67546ecd36047343f40a52e`
- TODO: 로컬 10장으로 crop montage 생성 후 초상화 잘림/오프셋 확인. crop이 안정적이면 hero ground truth + reference library를 붙여 실제 정확도 측정


### 2026-09-20 · FE/BE develop 통합 준비
- 상태: NOTE
- 현재 GitHub 상태 확인:
  - `develop`과 `fe-dev`는 동일 커밋 상태
  - `be-dev`는 `develop`과 크게 diverged되어 있어 전체 branch merge는 위험
  - `fe/src/lib/auth.ts`, `fe/src/lib/review-draft.ts`, `fe/package.json`은 develop/be-dev 동일
  - `fe/src/lib/backend/supabase-adapter.ts`, `fe/src/lib/backend/contracts.ts`, `fe/src/app/matches/[id]/page.tsx`는 develop/be-dev 내용이 다름
- 통합 원칙:
  - `develop`을 기준으로 유지
  - `be-dev`를 통째로 merge하지 않고, 검증된 `be/**` 변경만 선택적으로 반영
  - FE 영역은 필요한 연동 변경만 수동 반영. 현재 확정된 추가 연동은 Team OCR `is_me` 처리
  - `fe/src/app/**`, `fe/src/components/**`, 최신 FE contracts 등은 develop 버전을 우선 유지
- 최근 검증 상태:
  - Team 숫자 OCR 599/600 = 99.8%
  - is_me 10/10 = 100%
  - Team OCR 처리시간 7.5초
- 다음: develop에서 안전 통합용 체크리스트대로 BE 파일 + 필요한 FE adapter 변경만 반영 후 통합 테스트


### 2026-09-20 · FE/BE develop 안전 통합 완료
- 상태: DONE
- 방식: `develop`을 기준으로 별도 `integration/be-safe-sync` 브랜치를 만들고 검증된 BE 변경만 선택 반영
- develop에 반영한 파일:
  - `be/app.py`
  - `be/orca_ocr/engine.py`
  - `be/requirements.txt`
  - `be/ocr_benchmark/run_team_benchmark.py`
  - `be/ocr_benchmark/team_ground_truth.json`
  - `fe/src/lib/backend/supabase-adapter.ts`의 `is_me` 최소 연동
- 의도적으로 유지한 것: develop의 최신 FE pages/components/contracts
- PR: #3 `Integrate validated backend OCR into develop`
- merge commit: `db6b8e3d5306a58f909818b4174c4119313f0628`
- 다음: develop을 로컬에서 Pull 후 전체 FE + OCR 통합 실행 테스트


### 2026-09-20 · Team 영웅 초상화 매칭 실험 확장
- 상태: IN_PROGRESS
- 내용:
  - 기존 crop/matcher 실험에 hero reference 자동 동기화 스크립트 추가
  - 2026-08 기준 53명 영웅 아이콘을 제공하는 공개 GitHub reference 저장소의 `normal` 아이콘 세트를 로컬 cache로 내려받도록 구성
  - 10장 Team benchmark 전체에서 100개 portrait를 자동 crop → hero 후보/신뢰도/distance를 출력하고 prediction montage를 생성하는 runner 추가
  - reference/cache/crop/montage/last_*.json은 Git 추적 대상에서 제외하여 GitHub Desktop에 불필요한 변경이 쌓이지 않도록 처리
- 관련 파일:
  - `be/ocr_benchmark/sync_hero_references.py`
  - `be/ocr_benchmark/run_hero_matching_benchmark.py`
  - `.gitignore`
- 관련 커밋:
  - `407bef8d88b09ea2bb52b8c314ad5841397f896a`
  - `f9c9a86fdbca211f56ee1086e2caa4bd87272780`
  - `ceee67e4d04b93166a905532d1dbb085bf0da586`
  - `da60fadc159771a77eefe31884553c7b45560089`
- TODO: 로컬에서 reference sync 후 hero matching benchmark 실행. prediction montage/결과를 확인해 crop 정합성과 matching 정확도를 검증한 뒤 production `hero_id` 승격 여부 결정
