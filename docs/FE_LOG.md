# FE LOG

Frontend 관련 작업 내용, 변경사항, 전달사항, 수정 요청을 기록합니다.

## 사용 예시

```md
### YYYY-MM-DD · 제목
- 상태: TODO
- 내용: 무엇을 바꿔야 하는지
- 관련: fe/...
- 참고: 필요한 설명
- 완료 커밋: 미완료
```

## 현재 로그

### 2026-09-26 · 대시보드 아이콘 정리
- 상태: DONE
- 내용:
  - 문자/기호 기반 아이콘을 기능 의미가 분명한 선형 SVG 아이콘으로 교체
  - 전체 경기/확인 필요/OCR/분석/승률/최근 경기/빠른 이동/경기 등록/인사이트/가설 아이콘 스타일 통일
  - 별도 아이콘 패키지 의존성 없이 FE 내부 SVG 컴포넌트로 처리
- 관련: `fe/src/app/page.tsx`
- 검증: Frontend Check build 성공
- 완료 커밋: 3dcaeed83412b1ccbe5bd891397f67f44401f0d5

### 2026-09-26 · 스탯 천단위 구분기호 표시
- 상태: DONE
- 내용:
  - 스코어보드의 처치/도움/죽음/피해/치유/경감 입력값에 천단위 콤마 표시
  - Personal metrics의 순수 숫자 값에도 천단위 콤마 표시
  - DB/검수 저장값에는 콤마를 제거한 원래 숫자 문자열을 유지
  - 퍼센트/시간 등 숫자 이외 형식은 그대로 표시
- 관련: `fe/src/components/match-review-editor.tsx`
- 완료 커밋: 3cd1acfd8cce50b8c80fb326421d21ff7501c94d

### 2026-09-26 · 경기 등록 화면에 OCR 검수 통합
- 상태: DONE
- 내용:
  - 이미지 분류 검수 완료 후 다른 메뉴로 이동하지 않고 같은 경기 등록 화면에서 바로 OCR 실행
  - OCR 완료 후 같은 화면에 경기 결과/모드/시간/맵과 10인 스코어보드/Personal metrics 검수 UI 노출
  - OCR 검수값 수정 후 `confirmMatch`로 최종 저장
  - OCR 재실행 버튼을 OCR 검수 완료 버튼 옆에 배치
  - 분류를 다시 수정하면 다시 OCR 실행 가능
  - 일괄 버튼 문구를 `분류 검수 건너뛰고 전체 OCR`로 변경하여 OCR 후 개별 결과 검수 흐름 유지
- 관련: `fe/src/app/matches/new/page.tsx`
- 완료 커밋: ad395bf524d1e14d35efd14f1b9840878685a1b8

### 2026-09-26 · 경기 등록 검수 화면 OCR 재실행 버튼
- 상태: DONE
- 내용:
  - 경기 등록 검수에서 OCR 처리 완료 후 `OCR 다시 실행` 버튼 노출
  - 같은 경기의 원본 File 객체와 기존 match_id를 재사용해 OCR만 다시 실행
  - OCR 재실행 중에는 완료/다음 버튼 비활성화
- 관련: `fe/src/app/matches/new/page.tsx`
- 검증: Frontend Check build 성공
- 완료 커밋: 7dedb1aa0b2ca18239fca378f589d21b14cada4f

### 2026-09-26 · BE/DB Personal OCR 계약 반영
- 상태: DONE
- 내용:
  - Team OCR의 `hero_id=한글 표시명`, `hero_key=영문 내부 key` 구분 반영
  - Personal OCR의 `metrics[]`를 고정 필드가 아닌 동적 반복 검수 UI로 변경
  - `metric_key`, `scope`, `needs_review`, confidence를 유지하고 값만 사용자가 수정 가능하도록 변경
  - 검수 완료 시 `hero_specific={ metric_key: value }`로 변환하고 `weapon_accuracy` / `critical_hit_accuracy`는 accuracy / critical 필드로 전달
  - Supabase 확정 처리를 `confirm_orca_match` RPC 호출로 변경하여 검수된 최종값을 DB에 전달
  - 기존 nickname 입력 컬럼 제거 방향 유지
- 관련: `fe/src/lib/review-draft.ts`, `fe/src/lib/ocr-review-mapping.ts`, `fe/src/lib/ocr-integration.ts`, `fe/src/components/match-review-editor.tsx`, `fe/src/lib/backend/contracts.ts`, `fe/src/lib/backend/supabase-adapter.ts`
- 검증: Frontend Check 성공
- 완료 커밋: ae2e3f4e31b7394e98e91acf47af2d9ff65f5c1b

### 2026-09-20 · 내 닉네임 Pool 제거
- 상태: DONE
- 내용:
  - 설정 화면의 내 닉네임 Pool UI 제거
  - 브라우저 localStorage 기반 닉네임 Pool helper 제거
  - 내 플레이어 식별은 닉네임이 아니라 Team 스코어보드 행 하이라이트 방식 제안을 우선 검토
- 관련: `fe/src/app/settings/page.tsx`, 삭제된 `fe/src/lib/player-identity.ts`
- 완료 커밋: ea63ae36a87cf86f8dd1c2a9ed88cbf7affc32a9

### 2026-09-20 · 데스크톱 앱 스타일 전환
- 상태: DONE
- 내용:
  - 웹사이트처럼 보이던 라이트 테마를 제거
  - ORCA를 다크 데스크톱 분석 앱 스타일로 전환
  - 상단 앱 바, 오렌지 액센트, 밀도 높은 카드/패널 구조 적용
  - 대시보드와 설정 화면을 우선 통일
- 관련: `fe/src/app/globals.css`, `fe/src/components/app-shell.tsx`, `fe/src/app/page.tsx`, `fe/src/app/settings/page.tsx`
- 완료 커밋: ad3038cd8fbd1cc5fb4fb2c28df5ca02dc1d48ff

### 2026-09-20 · Tesla-inspired 1차 디자인 / 내 닉네임 Pool
- 상태: DONE
- 내용:
  - DESIGN-tesla 기준으로 상단 내비게이션, 대시보드, 설정 화면을 1차 라이트 디자인으로 변경
  - White / Light Ash / Carbon 계열 + Electric Blue(#3E6AE1) 중심
  - 둥근 정도와 장식을 줄이고 4px 버튼, 0.33s 전환 적용
  - 설정에 "내 닉네임 Pool" 추가
- 관련: `fe/src/components/app-shell.tsx`, `fe/src/app/page.tsx`, `fe/src/app/settings/page.tsx`, `fe/src/lib/player-identity.ts`
- 참고: 닉네임 Pool은 현재 브라우저 저장, 이후 Supabase 사용자별 설정으로 이동 예정
- 완료 커밋: f5e3a25af2dc9f5587466503e9ce7725fa43691d

### 2026-09-20 · ORCA 풀네임 수정
- 상태: DONE
- 내용: FE에 표시되는 ORCA 풀네임을 `Overwatch Result Correlation Analysis`로 통일
- 관련: 앱 쉘, 로그인 화면, 메타데이터
- 완료 커밋: 74039c1291c557a1d32dc3745a0f82522d96a373


### 2026-09-20 · 실제 OCR 연동 코드 이동
- 상태: DONE
- 내용: 기존 integration 브랜치에 있던 FE↔OCR 연동 코드를 fe-dev로 이동
- 관련: 경기 등록/상세, backend adapter 상태 처리, ocr-client, ocr-integration
- 완료 커밋: b652eab4f578f65d0c5ab2ba146e7c148bac3c93

현재 별도 요청 없음.


### 2026-09-20 · Team OCR 내 행 자동 식별 연동
- 상태: NOTE
- 내용:
  - BE Team OCR이 row highlight 기반으로 `player.is_me`를 반환하도록 변경됨
  - Supabase adapter가 더 이상 `ally slot 1`을 고정으로 '나' 처리하지 않고, OCR의 `is_me=true` 행을 review draft의 실제 내 행으로 반영
  - OCR 판정이 확실하지 않은 경우 ally `is_me`는 null로 남을 수 있음
- 관련: `fe/src/lib/backend/supabase-adapter.ts`
- BE 연동 커밋: `80b1f2a6612b56406cd7e77fcb9b43b34333cf63`
- 참고: 현재 FE 화면 구조 변경은 요구하지 않음. review draft의 기존 `is_me` 필드를 그대로 사용


### 2026-09-20 · FE/BE develop 통합 시 주의
- 상태: NOTE
- `develop`과 `fe-dev`는 현재 동일 상태
- `be-dev`는 오래 분기되어 FE 파일 일부가 develop과 다르므로 branch 전체 merge 금지 권장
- 통합 시 develop의 FE 화면/컴포넌트/contracts를 기준으로 유지하고, BE 쪽에서 필요한 FE 변경은 adapter 수준으로 최소 반영
- 현재 필요한 최신 연동: Team OCR의 `player.is_me=true`를 review draft의 실제 '나' 행으로 반영하는 `fe/src/lib/backend/supabase-adapter.ts` 변경


### 2026-09-20 · develop에 BE/OCR 안전 통합
- 상태: DONE
- develop 기준으로 BE runtime + Team benchmark + `is_me` adapter 최소 변경만 통합
- FE pages/components/contracts는 develop 버전을 유지
- PR #3 merge 완료
- merge commit: `db6b8e3d5306a58f909818b4174c4119313f0628`
- 다음: develop Pull 후 경기 업로드 → OCR → Review 화면 통합 테스트


### 2026-09-21 · OCR 내 행 표시 실제 경로 수정
- 상태: DONE
- 원인: 실제 경기 업로드는 `runRealOcrForMatch`를 사용하므로, `supabase-adapter.ts`의 `runMockOcr` 수정만으로는 Review 화면에 `is_me`가 반영되지 않았음
- 조치: `fe/src/lib/ocr-integration.ts`의 Team 결과 적용 단계에서 OCR `is_me=true` 행을 '나'로 지정하고 기존 기본 '나' 표시 제거
- PR: #4
- develop merge commit: `46192af3450e38b0ce879a343325ea692edbff8a`


### 2026-09-21 · OCR 재실행 legacy upload type fallback
- 상태: DONE
- `screen_type`이 비어 있는 기존 Supabase upload도 `upload_type` 기준으로 summary/team/personal/replay를 복원하도록 수정
- 처리 파일 0개인 경우 명시적 오류 처리
- PR #6 / develop merge `d6cb2bf794628b3864c5f0ea20b994928b729410`
