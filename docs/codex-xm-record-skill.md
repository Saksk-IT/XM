# Codex Skill: Record XM Work Items

Use this instruction as a Codex Skill when working on repositories tracked in XM.

## When to Record

After completing a user-requested feature, bug fix, or meaningful investigation, write one XM record for the project. Do not record trivial command-only answers or unrelated cleanup.

## Required Environment

- `XM_AGENT_BASE_URL`: XM API base URL, for example `http://localhost:4000`.
- `XM_AGENT_API_TOKEN`: token matching XM `AGENT_API_TOKEN`.

## Workflow

1. Identify the current repository path with `pwd`.
2. Resolve the XM project:

```bash
curl -sS \
  -H "Authorization: Bearer $XM_AGENT_API_TOKEN" \
  "$XM_AGENT_BASE_URL/api/agent/projects/resolve?repoPath=$(python -c 'import os, urllib.parse; print(urllib.parse.quote(os.getcwd()))')"
```

3. Summarize the work into a single record:
   - `title`: one sentence.
   - `description`: what changed or what bug was fixed, in user-facing language.
   - `type`: `BUG` for fixes, `FEATURE` for new capability or planned enhancement.
   - `status`: `DONE` only when implementation and verification are complete; otherwise `IN_PROGRESS` or `PENDING`.
   - `priority`: use `HIGH` for production breakage, data loss, security, auth, payment, deploy failures, or user-blocking issues; otherwise `MEDIUM` unless explicitly low impact.
   - `notes`: include implementation summary, affected layers, files or modules, verification commands, and any failed checks.
   - `tagNames`: include the product area and technical area.
   - `checklist`: include acceptance or follow-up items.

4. Create the XM record:

```bash
curl -sS -X POST "$XM_AGENT_BASE_URL/api/agent/projects/$PROJECT_ID/items" \
  -H "Authorization: Bearer $XM_AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

## Payload Template

```json
{
  "title": "修复首页统计显示为 0",
  "description": "首页和小程序我的页面现在使用同一个后端统计来源。",
  "type": "BUG",
  "status": "DONE",
  "priority": "HIGH",
  "notes": "实现摘要：修正共享统计聚合逻辑。\n影响范围：Web 首页、小程序我的页面。\n验证：pnpm test 通过。",
  "tagNames": ["homepage", "stats"],
  "checklist": ["定位共享数据源", "修复聚合逻辑", "补充回归测试"]
}
```

## Rules

- Never include secrets, cookies, tokens, or private credentials in XM records.
- If project resolution returns `404`, report that XM has no matching project and do not create a project automatically.
- If verification was skipped or failed, write that explicitly in `notes` and avoid `DONE` unless the user explicitly accepts the risk.
- Keep one user request to one XM record unless the work clearly spans unrelated features or bugs.
