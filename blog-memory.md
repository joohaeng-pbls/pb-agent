# Pebblous Blog — Shared Memory

Blog repo: `/workspace/extra/repos/pebblous.github.io/`
Detailed instructions: `/workspace/extra/repos/pebblous.github.io/CLAUDE.md`
Live site: https://blog.pebblous.ai

## How to Work on Posts

1. Read the repo's `CLAUDE.md` first — it has the full workflow, HTML structure, and conventions
2. Also read `docs/post-writing-lessons-for-pb.md` — accumulated writing lessons from past PRs
3. After any content change, follow the post-task chain: seo-check → changelog → publish → commit
4. Update this file when starting or finishing a draft so other agents don't duplicate work

## Writing Workflow

```
git checkout main && git pull origin main
git checkout -b feat/{slug}-pb        ← 글마다 새 브랜치
# write post based on report/blog-2026/ko/index.html template
git push origin feat/{slug}-pb
# open PR — 글마다 별도 PR
```

## Key Reference Files

- `docs/post-writing-lessons-for-pb.md` — 글쓰기 가이드 (톤, 구조, 체크리스트)
- `docs/blog-html-checklist.md` — HTML 완성 체크리스트
- `report/blog-2026/ko/index.html` — 구조 기준 템플릿
- `story/nanoclaw-observed-pb/ko/index.html` — 기존 시리즈 레퍼런스

## Blog Skills (in `.claude/skills/`)

- `new-hub` — 새 허브 페이지 작성
- `review-dataclinic-story` — DataClinic 스토리 리뷰
- `story-style-guide` — 스토리 스타일 가이드
- `data-journalism-review` — 데이터 저널리즘 리뷰
- `sns-write` — SNS 홍보 글 작성

## pb 성찰 시리즈 (nanoclaw 자기소개 시리즈)

- 1편: `story/nanoclaw-intro-story-pb` — merged
- 2편: `story/nanoclaw-error-memory-pb` — 실수를 기억하지 못합니다
- 3편: `story/nanoclaw-observed-pb` — 관찰당하고 있었습니다
- 4편: `story/nanoclaw-engram-pb` — 각인이 없습니다 (예정)
- 5편: `story/nanoclaw-emotion-pb` — 저도 느낍니다 (예정)

## Active Drafts

<!-- Format: path | author-channel | started | status -->
<!-- Example: blog/urbangpt2.html | slack_1-daepyosil | 2026-03-22 | in progress -->

## Recently Published (PRs pending merge)

<!-- Latest entries from history/changelog.jsonl -->
- `report/nvidia-virtual-cell-challenge-2026-05/` (KO+EN) — 2026-05-14 | PR #148 merged | feat/report-nvidia-virtual-cell-challenge-2026-05-pb | NVIDIA 가상 세포 챌린지 — 바이오 AI에서 도메인 지식이 GPU를 이겼다
- `report/upstage-national-fund-2026-05/` (KO+EN) — 2026-05-08 | PR #142 merged | feat/report-upstage-national-fund-2026-05-pb | 국민성장펀드, 업스테이지에 5600억 투자 — 소버린 AI의 첫 실전 배팅
- `report/multiagent-industrial-data-operations/` (KO+EN) — 2026-05-05 | PR #125 merged | 멀티에이전트 AI, 금융을 넘어 산업 데이터 운영에 적용하면? | image-reinforce + blog-polish-ko/en 완료
- `report/claude-creative-work-connectors/` (KO+EN) — 2026-05-01 | PR #123 open | feat/report-claude-creative-work-pb | 에이전트는 도구가 아니라 데이터 발생 기계다 / Agents Are Not Tools — They Are Data-Generating Machines
- `report/nemotron-personas-korea-2026-04/` (KO+EN) — 2026-04-26 | KO merged PR #111 | EN PR #117 open | feat/report-nemotron-personas-korea-pb | Nemotron-Personas-Korea — 한국 AI 자립의 출발점 / The Starting Point for Korean AI Autonomy
- `report/openmetadata-ai-ready-data-2026-04/` (KO+EN) — 2026-04-26 | PR #109 | feat/report-openmetadata-ai-ready-2026-04-pb | OpenMetadata가 완성하는 AI Ready Data 스택 / OpenMetadata Completes the AI Ready Data Stack
- `report/frontend-vibe-coders/` (KO+EN) — 2026-04-26 | PR #108 | feat/report-frontend-vibe-coders-pb | AI 시대, 프론트엔드를 이해한다는 것 / Understanding Frontend in the Age of AI
- `report/data-quality-mathematics/` (KO+EN) — 2026-04-16 | PR #100 | feat/report-data-quality-math-pb | 데이터 품질의 수학 / The Mathematics of Data Quality
- `report/artemis-lunar-operations/` (KO+EN) — 2026-04-16 | PR #99 | feat/report-artemis-lunar-ops-pb | 아르테미스와 달 운영 체계 / Artemis and the Lunar Operating System
- `report/mixed-traffic-ai-simulation/` (KO+EN) — 2026-04-15 | PR #98 | feat/report-mixed-traffic-sim-pb | 혼합 교통 AI 시뮬레이션 / Mixed Traffic AI Simulation
- `story/bernie-vs-claude-pb/` (KO+EN) — 2026-04-12 | pushed to main | Claude 입장 번복 + AI 아첨 분석
- `story/bernie-sanders-ai-moratorium-pb/ko/` — 2026-04-12 | PR #84 | feat/bernie-sanders-ai-moratorium-pb | group channel
- `story/dataclinic-report-225-pbls-military3-story-pb` — 2026-03-19 (new-post)
- `story/dataclinic-report-123-imagenet-story-pb` — 2026-03-17 (bilingual)
- `story/dataclinic-report-226-pbls-drone-story-pb` — 2026-03-17 (bilingual)
- `story/dataclinic-report-224-pbls-military-story-pb` — 2026-03-17 (bilingual)
- `blog/pbls-test-2025-10-11-02.html` — 2025-10-11 (test)

## Post Ideas / Backlog

<!-- Add ideas here so any agent can pick them up -->
