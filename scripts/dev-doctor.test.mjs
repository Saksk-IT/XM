import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFailureReasons,
  formatReport,
  parseDatabaseTarget,
  parseDevOutput
} from "./dev-doctor.mjs";

describe("dev doctor helpers", () => {
  it("extracts the actual Vite port and common pnpm dev failures", () => {
    const output = [
      "VITE v5.4.19 ready in 350 ms",
      "  Local:   http://127.0.0.1:5174/",
      "Error: listen EADDRINUSE: address already in use 0.0.0.0:4000",
      "ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL",
      'Command failed with signal "SIGINT"'
    ].join("\n");

    assert.deepEqual(parseDevOutput(output), {
      vitePorts: [5174],
      recursiveRunFailed: true,
      interrupted: true,
      addressInUsePorts: [4000],
      databaseUnreachable: false
    });
  });

  it("parses the local Postgres target from DATABASE_URL", () => {
    assert.deepEqual(
      parseDatabaseTarget("postgresql://xm@localhost:5432/xm?schema=public"),
      {
        host: "localhost",
        port: 5432,
        database: "xm"
      }
    );
  });

  it("turns failed checks into actionable dev failure reasons", () => {
    const reasons = buildFailureReasons({
      devOutput: {
        vitePorts: [5174],
        recursiveRunFailed: true,
        interrupted: true,
        addressInUsePorts: [4000],
        databaseUnreachable: false
      },
      postgres: { ok: false, detail: "connect ECONNREFUSED 127.0.0.1:5432" },
      api: { ok: false, detail: "fetch failed" },
      sharedBuild: { ok: true, detail: "ok" }
    });

    assert.deepEqual(reasons, [
      "Postgres TCP 不可连：connect ECONNREFUSED 127.0.0.1:5432。先运行 docker compose up -d postgres。",
      "API 端口 4000 已被占用，重复运行 pnpm dev 可能会触发 EADDRINUSE。",
      "pnpm dev 的子任务失败，终端日志里出现 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL。",
      "pnpm dev 被 SIGINT/SIGTERM 中断，检查是否手动停止或外层进程杀掉了 dev。"
    ]);
  });

  it("keeps Postgres failure output readable when the socket error is blank", () => {
    const reasons = buildFailureReasons({
      devOutput: parseDevOutput(""),
      postgres: { ok: false, detail: "" },
      api: { ok: true, detail: "ok" },
      sharedBuild: { ok: true, detail: "ok" }
    });

    assert.equal(
      reasons[0],
      "Postgres TCP 不可连：连接失败但未返回具体错误。先运行 docker compose up -d postgres。"
    );
  });

  it("formats the command output around Web, API, Postgres, and dev failure reasons", () => {
    const report = formatReport({
      web: { ok: true, detail: "http://127.0.0.1:5174", port: 5174 },
      api: { ok: false, detail: "fetch failed" },
      postgres: { ok: true, detail: "localhost:5432/xm" },
      sharedBuild: { ok: true, detail: "ok" },
      devLaunch: { skipped: false, detail: "启动窗口内没有失败", output: "" },
      reasons: ["API 未存活：http://127.0.0.1:4000/api/health 无响应。"]
    });

    assert.match(report, /Web 实际端口：5174/);
    assert.match(report, /API：FAIL - fetch failed/);
    assert.match(report, /Postgres：OK - localhost:5432\/xm/);
    assert.match(report, /pnpm dev 失败原因：/);
    assert.match(report, /API 未存活/);
  });
});
