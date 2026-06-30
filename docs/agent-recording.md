# XM Agent Recording API

XM exposes a token-protected HTTP API for AI agents to record project bugs and feature work.

## Authentication

Set `AGENT_API_TOKEN` in the API environment and send it on every request:

```bash
Authorization: Bearer $AGENT_API_TOKEN
```

If `AGENT_API_TOKEN` is empty, `/api/agent/*` returns `503` and no agent writes are accepted.

## Resolve a Project

```bash
curl -H "Authorization: Bearer $AGENT_API_TOKEN" \
  "http://localhost:4000/api/agent/projects/resolve?repoPath=/Users/sak/Documents/GitHub/Ti"
```

Resolution priority is:

1. Exact normalized `repoPath`
2. Normalized `repoUrl`
3. Exact project `name`

No project is created automatically. A missing match returns `404`.

## Create a Record

```bash
curl -X POST "http://localhost:4000/api/agent/projects/$PROJECT_ID/items" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "修复首页统计显示为 0",
    "description": "首页和小程序我的页面现在使用同一个后端统计来源。",
    "type": "BUG",
    "status": "DONE",
    "priority": "HIGH",
    "notes": "实现摘要：修正 data_center 聚合逻辑。\n影响范围：Web 首页、小程序我的页面。\n验证：pnpm test 通过。",
    "tagNames": ["homepage", "stats"],
    "checklist": ["定位共享数据源", "修复聚合逻辑", "补充回归测试"]
  }'
```

Recommended fields:

- `title`: one clear sentence.
- `description`: user-readable bug or feature description.
- `type`: `BUG` or `FEATURE`.
- `status`: `PENDING`, `IN_PROGRESS`, or `DONE`.
- `priority`: `LOW`, `MEDIUM`, or `HIGH`.
- `notes`: implementation summary, affected layers, verification commands and results.
- `tagNames`: modules, pages, services, or technology labels.
- `checklist`: concrete follow-up or acceptance steps.

## Other Endpoints

- `GET /api/agent/projects/:id/items`: list or filter records using `search`, `type`, `status`, `priority`, and `tag`.
- `PATCH /api/agent/items/:id`: update a record. When `checklist` is provided, it replaces the existing checklist.
- `DELETE /api/agent/items/:id`: delete a record.

Agent writes create activity entries with `agent_created`, `agent_updated`, or `agent_deleted`. Delete activity is written immediately before the item is deleted, so it is removed with the item by the current cascade behavior.
