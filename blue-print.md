# 📘 blue-print.md
##  프로젝트명

solved.ac 라이벌 CCTV (GitHub Actions 기반, 서버 없음)

# 🎯 목적

이 프로젝트는 다음을 만족하는 GitHub 템플릿 레포를 구현한다:

1. 사용자가 solved.ac 라이벌 페이지 내용을 그대로 복사해서 붙여넣기만 하면

2. 자동으로 라이벌 핸들(handle)을 파싱

3. 유효성 검증 후 rivals.json에 저장

4. 이후 정기적으로 라이벌의 새 문제 풀이를 감지

5. Slack Webhook으로 알림 전송

❗ 쿠키, 로그인 토큰, solvedacToken 등 민감 정보는 절대 요구하지 않는다.

# 🧩 전체 동작 흐름
## 1️⃣ 라이벌 등록 단계

사용자:

- solved.ac의 라이벌 페이지 (/ranking/rival?page=1)에서

- JSON 응답이든, 웹페이지 전체 복사든 아무거나 복사

- GitHub 레포에 Issue 생성 → 붙여넣기

시스템:

- Issue 이벤트로 GitHub Action 실행

- 붙여넣은 텍스트 자동 파싱

- handle 추출

- 존재 여부 API 검증

- rivals.json 업데이트

- Issue에 결과 요약 댓글 작성

## 2️⃣ 알림 단계 (cron 실행)

- 10~15분마다 GitHub Action 실행

- rivals.json에 저장된 handle 목록 읽기

- 각 handle의 solvedCount 확인

- 증가한 경우 최근 푼 문제 조회

# 📁 레포 구조
```
/.github/workflows/
    update-rivals.yml
    notifier.yml

/src/
    parseRivals.js
    notifier.js

rivals.json
state.json
README.md
```

# 📦 rivals.json 스키마
```
{
  "updatedAt": "2026-02-13T12:00:00Z",
  "source": "issue",
  "handles": ["dbsdnwns11","hyn4008","minsjes"],
  "stats": {
    "totalCandidates": 15,
    "validated": 10,
    "dropped": 5
  }
}
```
### 필드 설명
- handles: 최종 확정된 라이벌 핸들 목록 (중복 제거)

- stats.totalCandidates: 파싱된 전체 후보 개수

- stats.validated: 유효한 핸들 수

- stats.dropped: 제거된 수

# 🧠 라이벌 파싱 설계
## 1️⃣ 입력 자동 감지
입력 문자열을 기준으로:

### A. JSON 모드
- JSON.parse 시도

- items[] 존재 시:

    - item.handle 추출

    - 기본: isRival === true 인 경우만 저장

    - 옵션: reverseRival 포함 가능

### B. 텍스트/HTML 모드
JSON이 아니면:

1. solved.ac/profile/{handle} 패턴 우선 추출

2. 일반 핸들 후보 regex 추출

    - 영문 + 숫자 + _ 조합

3. 후보 목록 생성

## 2️⃣ 핸들 검증 단계 (중요)
텍스트 기반 추출은 오탐 가능성 있음.

각 handle 후보에 대해:
``` 
GET https://solved.ac/api/v3/user/show?handle={handle}
```
200 응답 → 유효

404 또는 에러 → 제거

❗ 검증 실패 시 전체 중단하지 말 것

❗ 일부 실패해도 가능한 handle만 저장

# 🛠 update-rivals.yml 워크플로우
### 트리거
Issue 생성 시 (issues.opened)

라벨 update-rivals가 붙은 경우만 실행

### 동작
1. Issue body 읽기

2. parseRivals.js 실행

3. rivals.json 생성 또는 갱신

4. 커밋 & 푸시

5. Issue에 댓글 작성:

예시:
```
라이벌 목록 업데이트 완료 ✅

입력 형식: JSON
총 후보: 15
유효 핸들: 10
제거된 항목: 5
```

# 🕒 notifier.yml 워크플로우
### 트리거
cron (예: 15분마다)

workflow_dispatch (수동 실행)

### 동작
1. rivals.json 읽기

2. 각 handle에 대해:

    - user/show → solvedCount 확인

3. 증가한 경우:

    - search/problem API 호출

    - 최근 solved 문제 조회

4. state.json과 비교

5. 신규 문제만 Slack 전송

# 📦 state.json 스키마
```
{
  "dbsdnwns11": {
    "solvedCount": 452,
    "seenProblemIds": ["1000","1001"]
  }
}
```

# 🔔 Slack 메시지 요구사항
Slack Incoming Webhook 사용

필수:

handle 이름

문제 번호

문제 링크 (https://www.acmicpc.net/problem/{id})

예시 메시지:
```
📌 dbsdnwns11 님이 새 문제를 풀었어요!

• 1234 - 문제 제목
• 5678 - 문제 제목
```

# 📘 README 요구사항
README에는 반드시 포함:

1. 설치 방법

    - 레포 Fork

    - Secret SLACK_WEBHOOK_URL 추가

2. 라이벌 등록 방법

    - solved.ac 라이벌 페이지 복사

    - Issue 생성 후 붙여넣기

3. 동작 방식 설명

4. 자주 묻는 질문

    - 왜 쿠키 안 쓰나요?

    - Rate limit 발생 시 어떻게 되나요?

# 🛡 안정성 요구사항
- Rate limit 발생 시 exponential backoff

- 일부 handle 실패해도 전체 중단 금지

- 로그에 사용자 입력 전체 출력 금지

- 쿠키/토큰 사용 금지

# ✅ 완료 기준 (Acceptance Criteria)
1. 사용자가 핸들을 직접 입력하지 않아도 된다.

2. JSON / HTML / 텍스트 모두 처리 가능하다.

3. 유효하지 않은 문자열은 자동 제거된다.

4. 중복 알림이 발생하지 않는다.

5. Slack 메시지가 정상 전송된다.

6. 쿠키/토큰 없이 전 과정이 동작한다.

# 🔎 Codex 구현 시 유의사항
- 파싱은 최대한 관대하게, 저장은 엄격하게

- dedupe는 반드시 handle 기준

- 상태 파일은 변경 시에만 커밋

- 워크플로우 동시 실행 방지(concurrency 설정)