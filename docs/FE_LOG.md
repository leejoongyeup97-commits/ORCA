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
