# ORCA 패치노트 수집 기능 인수인계 / 작업 프롬프트

## 1. 현재 작업 브랜치

현재 작업 브랜치:

```text
patchnote-dev
```

이 브랜치에서 그대로 이어서 작업하면 됩니다.

별도 새 브랜치는 만들지 않는 방향입니다.

패치노트 기능이 충분히 검증된 뒤 최종적으로:

```text
patchnote-dev → develop
```

순서로 머지할 예정입니다.

---

## 2. 현재까지 완료된 기능

넥슨 오버워치 공식 패치노트:

```text
https://overwatch.nexon.com/news/patchnotes
```

현재 아래 API가 구현되어 있습니다.

```text
GET /patchnotes/list?limit=5

GET /patchnotes/preview?url=<상세 패치노트 URL>

GET /patchnotes/debug
```

관련 파일:

```text
be/patchnotes/__init__.py
be/patchnotes/scraper.py
be/patchnotes/browser_worker.py
be/app.py
be/requirements.txt
```

### 목록 수집

넥슨 사이트의 패치노트 카드는 일반적인 `<a href>` 구조가 아니며,
Vue 클릭 이벤트를 통해 상세 페이지로 이동합니다.

따라서 목록 수집은 최종적으로:

```text
FastAPI
→ subprocess
→ browser_worker.py
→ Playwright
→ 설치된 Chrome
→ .news-list-item 클릭
→ 이동 후 page.url 수집
```

구조로 동작합니다.

Windows Uvicorn 내부에서 Playwright를 직접 실행했을 때 발생했던
`NotImplementedError` 문제를 피하기 위해 별도 Python 프로세스를 사용합니다.

### 상세 본문 수집

상세 페이지에서는 아래 값을 수집합니다.

```text
title
published_date
url
body_text
```

본문 정제 시 아래 요소들은 제거됩니다.

```text
play now / news 등의 상단 UI
"3일 전", "2시간 전" 같은 상대시간
2026.09.18 같은 제목 아래 중복 게시일
URL 공유하기 이후의 사이트 푸터
회사정보 / 약관 / 주소 / 저작권 등
```

영웅명, 기술명, 특전명, 수치 변경 문장은 원문 그대로 보존합니다.

---

## 3. 실제 검증 완료 예시

### 목록 API

```text
GET /patchnotes/list?limit=5
```

정상적으로 아래 항목들이 수집됨.

```text
2026-09-23
https://overwatch.nexon.com/news/patchnotes/835/patch-2026-09-22

2026-09-18
https://overwatch.nexon.com/news/patchnotes/830/patch-2026-09-16

2026-09-11
https://overwatch.nexon.com/news/patchnotes/823/patch-2026-09-10

2026-09-09
https://overwatch.nexon.com/news/patchnotes/820/patch-2026-09-08

2026-08-22
https://overwatch.nexon.com/news/patchnotes/810/patch-2026-08-20
```

### 2026-09-18 상세 패치

최종 정제된 `body_text` 예:

```text
핫픽스 업데이트
핫픽스 업데이트입니다. 2026년 9월 9일 패치의 리플레이 코드는 계속 사용할 수 있습니다.
영웅 업데이트
D.Mon
방어력이 325에서 275로 감소했습니다. (5대5)
방어력이 300에서 250으로 감소했습니다. (6대6)
집중 융합 - 주요 특전
탄환당 피해가 45에서 36으로 감소했습니다.
추진기
연료 소모 속도가 25에서 30으로 증가했습니다.
융합 연발총
공격력이 16에서 15로 감소했습니다.
재사용 대기시간이 4초에서 5초로 증가했습니다.
버그 수정
스타디움
...
```

따라서 목록 수집 + 상세 본문 수집/정제 단계는 현재 완료 상태로 봐도 됩니다.

---

# 4. 패치노트 최신화 운영 방식

## 결론

상시 서버나 예약 스케줄러는 사용하지 않습니다.

FE에서 사용자가 직접:

```text
[ 패치노트 최신화 ]
```

버튼을 눌렀을 때만 최신 패치를 확인하고 누락분을 저장하는 방식으로 갑니다.

ORCA는 2명이 사용하는 개인용 프로그램이므로 이 방식이면 충분합니다.

---

## 5. 최신화 버튼 동작 흐름

목표 동작:

```text
사용자가 ORCA 실행
↓
FE에서 "패치노트 최신화" 클릭
↓
BE가 DB에서 현재 저장된 가장 최신 패치 확인
↓
넥슨 패치노트 목록 조회
↓
DB 최신 패치 날짜 ~ 현재 날짜 사이의 후보 확인
↓
DB에 없는 패치 상세 페이지 수집
↓
신규 패치만 저장
↓
FE에 결과 반환
```

예:

DB에 가장 최신 패치가:

```text
2026-09-18
```

이고 넥슨에는:

```text
2026-09-23  신규
2026-09-18  기존
2026-09-11  기존
```

가 있다면:

```text
09-23 → DB에 없음 → 상세 수집 후 저장
09-18 → 이미 있음 → 건너뜀
09-11 → 최신 DB 날짜보다 과거 → 더 내려갈 필요 없음
```

최종 FE 응답 예:

```text
새로운 패치노트 1건을 추가했습니다.
- 2026.09.23
```

또는:

```text
이미 최신 상태입니다.
```

---

## 6. 신규/중복 판단에서 중요한 규칙

### 날짜만으로 중복 판단하면 안 됨

같은 날짜에 패치노트/핫픽스가 여러 건 올라올 가능성을 고려해야 합니다.

따라서 후보 탐색 범위는:

```text
published_date >= DB의 가장 최신 published_date
```

로 보고,

최종 중복 판단은:

```text
source_url
```

기준으로 하는 것을 권장합니다.

즉:

```text
날짜 = 어디까지 목록을 확인할지 판단하는 기준
URL = 실제 동일 패치인지 판단하는 기준
```

### URL 내부 날짜를 패치 날짜로 사용하지 말 것

예:

```text
제목/게시일:
2026-09-23

URL:
.../patch-2026-09-22
```

처럼 둘이 다를 수 있습니다.

경기와 패치를 연결할 때 기본 날짜 기준은:

```text
published_date
```

를 사용합니다.

URL slug 내부 날짜는 기준으로 사용하지 않습니다.

---

## 7. 기존 게시물 수정 감지

필수 V1 기능은 아닙니다.

다만 넥슨이 같은 URL의 본문을 나중에 수정하는 상황까지 대응하려면:

```text
source_url = 동일 게시물 여부
content_hash = 본문 변경 여부
```

로 사용할 수 있습니다.

추천 방식:

```text
최신화 버튼 클릭
→ 신규 URL 확인
→ 필요하면 가장 최근 1~3개 기존 패치도 다시 상세 수집
→ content_hash가 다르면 수정된 것으로 처리
```

이 부분은 DB 구현 시 선택적으로 적용하면 됩니다.

---

# 8. 역할 분담

## 현재 사용자 작업

FE에서:

```text
"패치노트 최신화" 버튼
```

까지만 추가 예정.

버튼 클릭 시 어떤 BE API를 호출할지는 BE 구현 시 계약을 맞추면 됩니다.

## 이어받는 BE/DB 작업

아래 부분부터 이어서 작업하면 됩니다.

```text
1. DB에 저장된 최신 패치 조회
2. 최신화 요청용 BE API 구현
3. /patchnotes/list를 이용해 후보 패치 확인
4. DB에 없는 source_url 확인
5. 신규 URL에 대해 상세 패치 수집
6. DB 저장
7. 중복 방지
8. FE에 최신화 결과 반환
```

DB 스키마와 저장 방식은 BE 담당자가 결정합니다.

기존 논의에서 후보 필드는 다음과 같았지만 확정된 것은 아닙니다.

```text
patch_date
title
source_url
raw_text
content_hash
fetched_at
```

현재 수집기에서는:

```text
published_date
title
url
body_text
```

형태로 값을 제공합니다.

필드 매핑은 DB 구조에 맞게 결정하면 됩니다.

---

# 9. 아직 하지 않은 작업

현재 아래 항목은 미구현입니다.

```text
- Supabase patches 저장
- 최신 DB 패치 조회
- 신규/누락 패치 자동 판별
- 최신화 전용 API
- content_hash 생성/비교
- patch_hero_changes 구조화
- 경기 played_at과 patch 연결
- FE 최신화 버튼과 BE 연결
```

즉 현재 브랜치는:

```text
"넥슨 패치노트를 안정적으로 읽어오는 수집기까지 완료"
```

된 상태입니다.

---

# 10. 브랜치 관련 주의

현재 `patchnote-dev`는 `develop`에서 갈라진 뒤 양쪽에 추가 작업이 진행되어 있습니다.

특히 `be/app.py`는:

```text
patchnote-dev
→ 패치노트 API 추가

develop
→ 최신 OCR / hero reference health 기능 추가
```

로 양쪽이 수정되어 있어 나중에 머지할 때 충돌 가능성이 있습니다.

패치노트 기능이 아직 실험 단계이므로 현재는 굳이 `develop`을 `patchnote-dev`에 머지하지 않고,
기능을 완성한 뒤:

```text
patchnote-dev → develop
```

시점에 충돌을 정리하는 방향입니다.

---

# 11. 이어서 작업할 때 사용할 프롬프트

아래 내용을 새 ChatGPT 채팅에 그대로 전달하고 작업을 이어가면 됩니다.

---

## START PROMPT

ORCA 프로젝트의 `patchnote-dev` 브랜치에서 이어서 작업해줘.

현재 넥슨 오버워치 공식 패치노트 수집기는 구현과 테스트가 완료된 상태야.

현재 구현 API:

```text
GET /patchnotes/list?limit=5
GET /patchnotes/preview?url=<상세 URL>
GET /patchnotes/debug
```

관련 파일:

```text
be/patchnotes/__init__.py
be/patchnotes/scraper.py
be/patchnotes/browser_worker.py
be/app.py
be/requirements.txt
```

넥슨 패치노트 목록은 Vue 클릭형 카드라서 일반 href 파싱이 안 되고,
Playwright를 별도 Python subprocess로 실행해 실제 카드를 클릭한 뒤 상세 URL을 가져오는 방식이다.

상세 페이지에서는 현재 아래 값을 정상 수집한다.

```text
title
published_date
url
body_text
```

본문에서는 상단 메뉴, 상대시간, 중복 게시일, URL 공유하기 이후 푸터를 제거하고,
영웅명/기술명/특전명/수치 변경 문장은 그대로 보존한다.

2026-09-23 버그 수정 패치와
2026-09-18 D.Mon 밸런스 패치 모두 정상 수집되는 것을 확인했다.

이제 구현할 목표는 "패치노트 최신화" 기능이다.

자동 스케줄러나 상시 서버 방식은 사용하지 않는다.

FE에서 사용자가 "패치노트 최신화" 버튼을 클릭했을 때만 동작한다.

원하는 흐름:

```text
FE 최신화 버튼
→ BE 최신화 API 호출
→ DB에서 가장 최신 패치 확인
→ 넥슨 패치노트 목록 확인
→ DB 최신 published_date 이상인 후보 확인
→ source_url 기준으로 DB에 없는 패치 판별
→ 신규 패치만 상세 수집
→ DB 저장
→ FE에 추가된 패치 수/목록 반환
```

중요 규칙:

1. 날짜만으로 중복 판단하지 않는다.
2. 같은 날짜에 여러 게시물이 생길 수 있으므로 후보는
   `published_date >= DB 최신 날짜` 범위로 확인한다.
3. 최종 중복 판단은 `source_url` 기준으로 한다.
4. URL slug 날짜와 published_date가 다를 수 있으므로
   URL 내부 날짜를 패치 날짜로 사용하지 않는다.
5. 기존 게시물 수정까지 감지하려면 선택적으로 `content_hash`를 사용할 수 있다.
6. DB 스키마/저장 방식은 현재 수집기 구조를 확인한 뒤 기존 ORCA Supabase 설계와 충돌하지 않게 결정해줘.
7. 현재 브랜치에서 그대로 작업하고 새 브랜치는 만들지 마.
8. 아직 실험 단계이므로 지금 develop에 먼저 머지하지 마.

현재 수집기 코드를 먼저 확인하고,
기존 Supabase 테이블/관련 코드를 확인한 뒤
최소 변경으로 최신화 기능을 설계하고 구현해줘.

비개발자가 따라갈 수 있게 한 단계씩 설명하고,
DB 변경이 필요하면 실행할 SQL과 코드 수정 위치를 명확히 구분해줘.

## END PROMPT
