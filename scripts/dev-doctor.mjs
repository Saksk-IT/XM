import { execFile, spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultWebPort = 5173;
const defaultApiPort = 4000;
const defaultDevTimeoutMs = 12_000;
const tcpTimeoutMs = 1_500;
const httpTimeoutMs = 1_500;

export function parseDevOutput(output) {
  const vitePorts = uniqueNumbers(
    [...output.matchAll(/Local:\s+https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):(\d{2,5})/gi)].map(
      (match) => Number(match[1])
    )
  );
  const addressInUsePorts = uniqueNumbers(
    [...output.matchAll(/EADDRINUSE[^\n]*(?::|port\s+)(\d{2,5})/gi)].map((match) => Number(match[1]))
  );

  return {
    vitePorts,
    recursiveRunFailed: output.includes("ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL"),
    interrupted: /Command failed with signal ["']?SIG(?:INT|TERM)["']?/i.test(output),
    addressInUsePorts,
    databaseUnreachable: /P1001|Can't reach database server|ECONNREFUSED[^\n]*5432/i.test(output)
  };
}

export function parseDatabaseTarget(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname || "localhost",
      port: Number(url.port || 5432),
      database: decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "postgres"
    };
  } catch (_error) {
    return null;
  }
}

export function buildFailureReasons({ devOutput, postgres, api, sharedBuild }) {
  const reasons = [];

  if (sharedBuild?.ok === false) {
    reasons.push(`@xm/shared build 失败：${sharedBuild.detail}。pnpm dev 会先停在 shared 构建步骤。`);
  }

  if (postgres?.ok === false) {
    const detail = postgres.detail || "连接失败但未返回具体错误";
    reasons.push(`Postgres TCP 不可连：${detail}。先运行 docker compose up -d postgres。`);
  }

  if (devOutput?.addressInUsePorts.includes(defaultApiPort)) {
    reasons.push("API 端口 4000 已被占用，重复运行 pnpm dev 可能会触发 EADDRINUSE。");
  } else if (api?.ok === false) {
    reasons.push(`API 未存活：http://127.0.0.1:4000/api/health 无响应（${api.detail}）。`);
  }

  if (devOutput?.databaseUnreachable && postgres?.ok !== false) {
    reasons.push("pnpm dev 日志显示数据库不可达，检查 DATABASE_URL 和 postgres 容器状态。");
  }

  if (devOutput?.recursiveRunFailed) {
    reasons.push("pnpm dev 的子任务失败，终端日志里出现 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL。");
  }

  if (devOutput?.interrupted) {
    reasons.push("pnpm dev 被 SIGINT/SIGTERM 中断，检查是否手动停止或外层进程杀掉了 dev。");
  }

  return reasons;
}

export function formatReport({ web, api, postgres, sharedBuild, devLaunch, reasons }) {
  const webLine = web.ok
    ? `Web 实际端口：${web.port} - ${web.detail}`
    : `Web 实际端口：未发现 - ${web.detail}`;
  const reasonLines =
    reasons.length > 0
      ? ["pnpm dev 失败原因：", ...reasons.map((reason, index) => `${index + 1}. ${reason}`)]
      : ["pnpm dev 失败原因：当前检查未发现明确阻断点。"];

  return [
    "XM dev doctor",
    "",
    webLine,
    `API：${api.ok ? "OK" : "FAIL"} - ${api.detail}`,
    `Postgres：${postgres.ok ? "OK" : "FAIL"} - ${postgres.detail}`,
    `shared build：${sharedBuild.ok ? "OK" : "FAIL"} - ${sharedBuild.detail}`,
    `pnpm dev 启动检查：${devLaunch.skipped ? "SKIP" : devLaunch.ok ? "OK" : "FAIL"} - ${devLaunch.detail}`,
    "",
    ...reasonLines
  ].join("\n");
}

async function main() {
  const apiPort = Number(process.env.API_PORT || defaultApiPort);
  const devTimeoutMs = Number(process.env.XM_DEV_DOCTOR_DEV_TIMEOUT_MS || defaultDevTimeoutMs);
  const webPorts = candidateWebPorts(process.env.WEB_ORIGIN);

  const [web, api, postgres, sharedBuild] = await Promise.all([
    checkWeb(webPorts),
    checkApi(apiPort),
    checkPostgres(process.env.DATABASE_URL || ""),
    runCommand("pnpm", ["--filter", "@xm/shared", "build"], 30_000)
  ]);

  const devLaunch = await maybeRunDevLaunch({
    api,
    postgres,
    sharedBuild,
    web,
    timeoutMs: devTimeoutMs
  });
  const devOutput = devLaunch.output ? parseDevOutput(devLaunch.output) : emptyDevOutput();
  const mergedWeb = devOutput.vitePorts.length > 0 && !web.ok
    ? {
        ok: true,
        detail: `pnpm dev 输出显示 http://127.0.0.1:${devOutput.vitePorts[0]}`,
        port: devOutput.vitePorts[0]
      }
    : web;
  const apiForReasons = devLaunch.ok && !devLaunch.skipped ? { ok: true, detail: api.detail } : api;
  const reasons = buildFailureReasons({
    devOutput,
    postgres,
    api: apiForReasons,
    sharedBuild
  });

  console.log(
    formatReport({
      web: mergedWeb,
      api,
      postgres,
      sharedBuild,
      devLaunch,
      reasons
    })
  );

  if (sharedBuild.ok === false || postgres.ok === false || devLaunch.ok === false) {
    process.exitCode = 1;
  }
}

function candidateWebPorts(webOrigin) {
  const ports = new Set([defaultWebPort]);
  const configuredPort = parseUrlPort(webOrigin);
  if (configuredPort) {
    ports.add(configuredPort);
  }
  for (let port = defaultWebPort; port <= defaultWebPort + 10; port += 1) {
    ports.add(port);
  }
  return [...ports];
}

function parseUrlPort(url) {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.port ? Number(parsed.port) : null;
  } catch (_error) {
    return null;
  }
}

async function checkWeb(ports) {
  for (const port of ports) {
    const url = `http://127.0.0.1:${port}`;
    const response = await fetchText(url);
    if (response.ok && isXmViteHtml(response.text)) {
      return {
        ok: true,
        detail: url,
        port
      };
    }
  }

  return {
    ok: false,
    detail: `未在 ${ports[0]}-${ports[ports.length - 1]} 发现 XM Vite 页面`,
    port: null
  };
}

async function checkApi(apiPort) {
  const url = `http://127.0.0.1:${apiPort}/api/health`;
  const response = await fetchJson(url);
  if (response.ok && response.data?.ok === true) {
    return {
      ok: true,
      detail: url
    };
  }
  const listener = await describePortListener(apiPort);
  const suffix = listener ? `；端口监听：${listener}` : "";
  return {
    ok: false,
    detail: `${response.detail}${suffix}`
  };
}

async function checkPostgres(databaseUrl) {
  const target = parseDatabaseTarget(databaseUrl);
  if (!target) {
    return {
      ok: false,
      detail: "DATABASE_URL 缺失或格式无效"
    };
  }

  const result = await canConnectTcp(target.host, target.port, tcpTimeoutMs);
  const fallbackResult =
    !result.ok && target.host === "localhost"
      ? await canConnectTcp("127.0.0.1", target.port, tcpTimeoutMs)
      : null;
  const finalResult = fallbackResult?.ok ? fallbackResult : result;

  return {
    ok: finalResult.ok,
    detail: finalResult.ok ? `${target.host}:${target.port}/${target.database}` : finalResult.detail
  };
}

async function maybeRunDevLaunch({ api, postgres, sharedBuild, web, timeoutMs }) {
  if (sharedBuild.ok === false) {
    return { skipped: true, ok: true, detail: "shared build 已失败，跳过 dev 启动捕获", output: "" };
  }
  if (postgres.ok === false) {
    return { skipped: true, ok: true, detail: "Postgres 不可连，跳过 dev 启动捕获", output: "" };
  }
  if (api.ok && web.ok) {
    return { skipped: true, ok: true, detail: "API 和 Web 已在运行，跳过重复启动", output: "" };
  }

  return runDevForFailureSample(timeoutMs);
}

async function runDevForFailureSample(timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["dev"], {
      cwd: process.cwd(),
      detached: process.platform !== "win32",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let killedForTimeout = false;
    const append = (chunk) => {
      output += chunk.toString();
    };
    const timer = setTimeout(() => {
      killedForTimeout = true;
      stopProcess(child);
    }, timeoutMs);

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        skipped: false,
        ok: false,
        detail: error.message,
        output
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (killedForTimeout) {
        resolve({
          skipped: false,
          ok: true,
          detail: `启动窗口内没有失败（${timeoutMs}ms 后已停止临时 dev 进程）`,
          output
        });
        return;
      }
      resolve({
        skipped: false,
        ok: code === 0,
        detail: code === 0 ? "pnpm dev 正常退出" : `退出码 ${code ?? "unknown"}${signal ? `，信号 ${signal}` : ""}`,
        output
      });
    });
  });
}

function stopProcess(child) {
  if (child.pid === undefined) {
    return;
  }
  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch (_error) {
    child.kill("SIGTERM");
  }
}

async function runCommand(command, args, timeoutMs) {
  try {
    await execFileAsync(command, args, {
      cwd: process.cwd(),
      env: process.env,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024
    });
    return {
      ok: true,
      detail: "ok"
    };
  } catch (error) {
    return {
      ok: false,
      detail: firstLine(error.stderr || error.stdout || error.message)
    };
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), httpTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      ok: response.ok,
      text: await response.text(),
      detail: `${response.status} ${response.statusText}`
    };
  } catch (error) {
    return {
      ok: false,
      text: "",
      detail: error.message
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const response = await fetchText(url);
  if (!response.ok) {
    return {
      ok: false,
      data: null,
      detail: response.detail
    };
  }
  try {
    return {
      ok: true,
      data: JSON.parse(response.text),
      detail: response.detail
    };
  } catch (_error) {
    return {
      ok: false,
      data: null,
      detail: "响应不是 JSON"
    };
  }
}

function isXmViteHtml(text) {
  return text.includes("<title>XM</title>") && text.includes("/src/main.tsx");
}

async function canConnectTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish({ ok: true, detail: "ok" }));
    socket.on("timeout", () => finish({ ok: false, detail: `connect timeout ${host}:${port}` }));
    socket.on("error", (error) => {
      const detail = error.message || `${error.code || "connect error"} ${host}:${port}`;
      finish({ ok: false, detail });
    });
  });
}

async function describePortListener(port) {
  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      timeout: 1_000,
      maxBuffer: 64 * 1024
    });
    const lines = stdout.trim().split("\n");
    return lines[1]?.trim().replace(/\s+/g, " ") || "";
  } catch (_error) {
    return "";
  }
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function emptyDevOutput() {
  return {
    vitePorts: [],
    recursiveRunFailed: false,
    interrupted: false,
    addressInUsePorts: [],
    databaseUnreachable: false
  };
}

function firstLine(value) {
  return String(value).split("\n").find((line) => line.trim())?.trim() || "unknown error";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
