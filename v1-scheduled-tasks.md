# V1 Scheduled Tasks — Migration Reference

These tasks were active in v1 and need to be recreated in v2 once Slack channel is set up.
All tasks target Slack channels (`slack_pbls-nanoclaw` or `slack_1-daepyosil`).

## Tasks to Recreate

### 1. Weekly Week Number (Monday 8AM KST)
- **Schedule**: `0 8 * * 1`
- **Target**: slack_pbls-nanoclaw
- **Prompt**: 이번 주 몇 번째 주인지 계산 (ISO week number)

### 2. Daily AI News TOP 10 (Daily 8AM KST)
- **Schedule**: `0 8 * * *`
- **Target**: slack_pbls-nanoclaw
- **Prompt**: 글로벌 AI 뉴스 10개 + 중복 방지 (`ai-news-history.json`)

### 3. Daily Weather Sejong (Daily 7:30AM KST)
- **Schedule**: `30 7 * * *`
- **Target**: slack_pbls-nanoclaw
- **Prompt**: 세종시 오늘 날씨 리포트

### 4. Daily Scrapbook Summary (Daily 5AM KST)
- **Schedule**: `0 5 * * *`
- **Target**: slack_pbls-nanoclaw → #모두에게-스크랩북-서머리
- **Prompt**: 어제 스크랩북(C037LBCQYCQ) 메시지 요약, python3 Slack API script

### 5. Weekly Scrapbook Summary (Monday 7AM KST)
- **Schedule**: `0 7 * * 1`
- **Target**: slack_pbls-nanoclaw
- **Prompt**: 지난주 스크랩북 포스팅 + 페블러스 관점 커멘터리

### 6. Email Report — joohaeng@ (5x daily)
- **Schedule**: `0 8,9,10,15,17 * * *`
- **Target**: slack:C0ALSV9AL3B (via IPC)
- **Prompt**: python3 Gmail API → unread mail report with Slack Block Kit buttons

### 7. Email Report — pb@ (3x daily)
- **Schedule**: `0 9,13,17 * * *`
- **Target**: slack:C0ALSV9AL3B (via IPC)
- **Prompt**: python3 Gmail API → pb@pebblous.ai bucket report

### 8. DataClinic New Reports (Daily 9AM KST)
- **Schedule**: `0 9 * * *`
- **Target**: slack:C0ALSV9AL3B (via IPC)
- **Prompt**: Check for new DataClinic reports in last 7 days

### 9. Weekly Memory Review (Monday 9AM KST)
- **Schedule**: `0 9 * * 1`
- **Target**: slack_1-daepyosil
- **Prompt**: Review local memories → suggest global memory updates

### 10. Daily Blog Topic Ideas (Daily 11PM KST)
- **Schedule**: `0 14 * * *` (UTC)
- **Target**: slack_1-daepyosil
- **Prompt**: HN/GitHub/arXiv → 페블러스 연관 블로그 소재 후보 (agent-browser)

## Notes
- Tasks 4, 5, 6, 7 use python3 scripts with Slack API tokens / Gmail OAuth
- Tasks 6, 7, 8 use IPC (`/workspace/ipc/messages/`) instead of agent output
- All tasks use Slack mrkdwn formatting
- Recreate after `/add-slack` is run on v2
