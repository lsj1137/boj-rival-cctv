# 📸 solved.ac 라이벌 CCTV

서버 없이 GitHub Actions만으로 동작하는 solved.ac 라이벌 모니터링 템플릿입니다.
쿠키, 로그인 토큰, `solvedacToken` 같은 민감 정보 없이 동작합니다.

## 1. 설치 방법

1. 이 저장소를 Fork합니다.

2. Slack Incoming Webhook URL을 발급합니다.

3. 저장소 Secret에 `SLACK_WEBHOOK_URL`을 추가합니다.

4. GitHub Actions를 활성화한 상태로 유지합니다.

### 🚨 권장 채널 구성 (중요)

- 이 프로젝트는 웹훅으로 채널에 알림을 보내는 구조입니다.
- 여러 사람이 같은 채널/웹훅을 공유하면 알림이 많이 중복될 수 있습니다.
- 개인 사용이라면 `나만 있는 Slack 비공개 채널`을 만들고, 그 채널의 웹훅을 연결하는 것을 권장합니다.

### ⏰ Slack Webhook URL 추가 방법

1. Slack에서 알림을 받을 워크스페이스를 선택합니다.

![Select Workspace](/src/images/image.png)

2. Slack App 관리 페이지에서 Incoming Webhooks를 활성화합니다.

![Click Channel Name](/src/images/image-1.png)

![Click Integration Tab](/src/images/image-2.png)

![Add Incoming WebHooks](/src/images/image-3.png)

3. `Add New Webhook to Workspace`를 눌러 채널을 선택하고 Webhook URL을 발급받습니다.

![Search Your Channel](/src/images/image-4.png)

![Copy Webhook URL](/src/images/image-5.png)

4. GitHub 저장소로 이동합니다.

5. `Settings` → `Secrets and variables` → `Actions`로 이동합니다.

6. `New repository secret`를 눌러 아래처럼 저장합니다.

   - Name: `SLACK_WEBHOOK_URL`

   - Secret: 발급받은 Slack Webhook URL 전체 값

7. (권장) `Variables` 탭에서 `SOLVEDAC_SELF_HANDLE`을 추가합니다.
   - Value: 내 solved.ac 아이디
   - 용도: 라이벌 목록/알림에서 본인 아이디를 자동 제외

## 2. 라이벌 등록 방법

1. solved.ac 라이벌 페이지(`https://solved.ac/ranking/rival?page=1`)를 엽니다.

2. JSON 응답, HTML, 일반 텍스트 중 아무 형식으로 복사합니다.

3. 이 저장소에서 `Issues` → `New issue`를 누릅니다.

4. 템플릿 목록에서 `라이벌 업데이트`를 선택합니다.

5. `붙여넣기 내용`에 복사한 원문을 넣고 이슈를 등록합니다.

이 템플릿은 본문의 식별 마커와 제목(`[rivals] ...`)로 워크플로우가 자동 인식하므로, 별도 라벨 지정이 필요 없습니다.

`update-rivals` 워크플로우가 자동으로:

- 핸들 후보를 파싱하고

- `GET /api/v3/user/show?handle={handle}`로 유효성 검증 후

- `rivals.json`을 갱신하고

- Issue에 요약 댓글을 남깁니다.

## 📖 동작 방식

- `update-rivals.yml`

  - 트리거: Issue 생성/라벨 이벤트

  - 조건: 템플릿 식별 마커(`<!-- rivals-update -->`) 또는 제목 접두사(`[rivals]`)가 있을 때 실행

  - 결과: `rivals.json` 갱신 및 Issue 댓글 작성

- `notifier.yml`

  - 트리거: 15분마다 cron + 수동 실행(`workflow_dispatch`)

  - 동작: `rivals.json`의 핸들을 순회하며 solved 증가 여부 확인

  - 결과: 새로 푼 문제만 Slack으로 전송

- 중복 알림 방지

  - `state.json`의 `seenProblemIds`로 이미 알린 문제를 필터링

## ❓ FAQ

### 왜 쿠키/토큰을 사용하지 않나요?

이 프로젝트는 공개 API와 사용자가 직접 복사한 라이벌 페이지 텍스트만 사용합니다.
민감한 인증 정보를 저장하거나 전달할 필요가 없습니다.

### Rate limit(429)이 발생하면 어떻게 되나요?

API 호출에 exponential backoff를 적용했습니다.
일부 핸들 요청이 실패해도 전체 작업을 중단하지 않고 가능한 항목을 계속 처리합니다.

## 🗂️ 파일 구조

- `.github/workflows/update-rivals.yml`

- `.github/workflows/notifier.yml`

- `src/parseRivals.js`

- `src/notifier.js`

- `rivals.json`

- `state.json`
