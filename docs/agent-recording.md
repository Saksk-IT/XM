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

A missing match returns `404`. Agents that are onboarding a new repository should call the initialization endpoint below.

## Initialize a Project

Use this endpoint when a repository is not yet tracked by XM. The request creates the project and can create initial bug or feature records derived from sanitized README and commit-log summaries.

```bash
curl -X POST "http://localhost:4000/api/agent/projects/init" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "FreshRepo",
    "description": "README 描述了本地开发、API 和前端结构。",
    "repoPath": "/Users/sak/Documents/FreshRepo",
    "repoUrl": "https://github.com/example/fresh-repo",
    "docsUrl": "https://github.com/example/fresh-repo#readme",
    "initialItems": [
      {
        "title": "根据 README 建立项目说明",
        "description": "README 已说明项目结构和本地运行方式。",
        "type": "FEATURE",
        "status": "DONE",
        "priority": "MEDIUM",
        "notes": "来源：README.md",
        "tagNames": ["readme", "docs"],
        "checklist": ["记录项目结构", "记录本地运行命令"]
      }
    ]
  }'
```

Response fields:

- `project`: created or matched project detail.
- `created`: whether a new project was created.
- `createdItems`: initial records created during this call.
- `skippedItemTitles`: initial records skipped because the project already had the same title.

If the project already exists, the endpoint fills missing metadata only. Existing descriptions, URLs, and custom project fields are not overwritten. Initial records are deduplicated by exact title per project.

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

- `POST /api/agent/projects/init`: create or match a project and bulk-create deduplicated initial records.
- `GET /api/agent/projects/:id/items`: list or filter records using `search`, `type`, `status`, `priority`, and `tag`.
- `PATCH /api/agent/items/:id`: update a record. When `checklist` is provided, it replaces the existing checklist.
- `DELETE /api/agent/items/:id`: delete a record.

Agent writes create activity entries with `agent_initialized`, `agent_created`, `agent_updated`, or `agent_deleted`. Delete activity is written immediately before the item is deleted, so it is removed with the item by the current cascade behavior.
