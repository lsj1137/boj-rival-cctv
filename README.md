# solved.ac rival cctv

GitHub Actions-based rival monitor for solved.ac. No server, no cookies, no login tokens.

## Installation

1. Fork this repository.
2. Add repository secret `SLACK_WEBHOOK_URL`.
3. Keep GitHub Actions enabled.

## Register rivals

1. Open your solved.ac rival page (`/ranking/rival?page=1`).
2. Copy either JSON response, page HTML, or plain text.
3. Create a GitHub issue in this repository.
4. Add label `update-rivals`.
5. Paste the copied text into the issue body and submit.

`update-rivals` workflow will:
- Parse handles automatically.
- Validate handles with `GET /api/v3/user/show?handle={handle}`.
- Update `rivals.json`.
- Comment result summary on the issue.

## How it works

- `update-rivals.yml`: triggered by labeled issue event, updates `rivals.json`.
- `notifier.yml`: runs every 15 minutes (and manual dispatch), compares `rivals.json` with `state.json`, sends Slack notifications for newly solved problems.
- Duplicate alerts are prevented by `state.json` (`seenProblemIds`).

## FAQ

### Why no cookies or tokens?

The project uses only public solved.ac APIs and copied text from your own rival page. This keeps setup simple and avoids handling sensitive credentials.

### What if rate limits happen?

API calls use exponential backoff for 429/5xx responses. If some handles still fail, the run continues and processes the remaining handles.

## File layout

- `.github/workflows/update-rivals.yml`
- `.github/workflows/notifier.yml`
- `src/parseRivals.js`
- `src/notifier.js`
- `rivals.json`
- `state.json`
