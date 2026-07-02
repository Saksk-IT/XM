import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Database,
  Github,
  LayoutPanelTop,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Me, ProjectSummary, RuntimeSettings } from "@xm/shared";
import { api, ApiError } from "../api/client";
import { Metric } from "../components/ui";
import { readStoredBoolean, writeStoredBoolean } from "../lib/storage";

type SettingsSection = "layout" | "archive" | "account" | "integrations";
type IntegrationCheckStatus = "success" | "error" | "skipped";
type IntegrationCheckResult = {
  id: "github" | "openai";
  title: string;
  status: IntegrationCheckStatus;
  message: string;
};

const sections: Array<{ id: SettingsSection; label: string }> = [
  { id: "layout", label: "布局" },
  { id: "archive", label: "归档" },
  { id: "account", label: "账号" },
  { id: "integrations", label: "集成" }
];
const integrationDraftVerificationInput = "运行时配置已保存，请验证 OpenAI 草稿生成能力并返回一个简短事项草稿。";

export function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSection = parseSection(searchParams.get("section"));
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [me, setMe] = useState<Me | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [runtime, setRuntime] = useState<RuntimeSettings | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStoredBoolean("xm.sidebarCollapsed", false));
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(() => readStoredBoolean("xm.detailPanelCollapsed", false));
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const activeProjects = useMemo(() => projects.filter((project) => !project.archived), [projects]);
  const archivedProjects = useMemo(() => projects.filter((project) => project.archived), [projects]);

  useEffect(() => writeStoredBoolean("xm.sidebarCollapsed", sidebarCollapsed), [sidebarCollapsed]);
  useEffect(() => writeStoredBoolean("xm.detailPanelCollapsed", detailPanelCollapsed), [detailPanelCollapsed]);

  const loadSettings = useCallback(async () => {
    setError("");
    try {
      const [currentUser, allProjects, runtimeSettings] = await Promise.all([
        api.me(),
        api.listProjects({ includeArchived: true }),
        api.runtimeSettings()
      ]);
      setMe(currentUser);
      setProjects(allProjects);
      setRuntime(runtimeSettings);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      setError(caught instanceof Error ? caught.message : "设置加载失败");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setActiveSection(parseSection(searchParams.get("section")));
  }, [searchParams]);

  async function restoreProject(project: ProjectSummary) {
    setRestoringId(project.id);
    try {
      await api.updateProject(project.id, { archived: false });
      await loadSettings();
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-ink">
      <header className="border-b border-line bg-white px-4 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="focus-ring rounded-md border border-line p-2 text-muted hover:bg-slate-50"
              aria-label="返回项目"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-normal">设置</h1>
              <p className="mt-1 text-sm text-muted">管理布局、归档项目和服务端集成状态。</p>
            </div>
          </div>
          <div className="flex rounded-md border border-line bg-white p-1">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`focus-ring h-9 rounded px-3 text-sm font-medium ${
                  activeSection === section.id ? "bg-slate-900 text-white" : "text-muted hover:bg-slate-50"
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden rounded-md border border-line bg-white p-2 shadow-panel lg:block">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`focus-ring mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                activeSection === section.id ? "bg-slate-900 text-white" : "text-muted hover:bg-slate-50"
              }`}
            >
              {section.label}
            </button>
          ))}
        </aside>

        <section className="min-w-0">
          {error ? <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-md border border-line bg-white text-sm text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载设置...
            </div>
          ) : (
            <>
              {activeSection === "layout" ? (
                <SettingsCard title="布局偏好" icon={<LayoutPanelTop className="h-4 w-4" />}>
                  <ToggleRow
                    title="收起左侧项目栏"
                    description="保留项目图标和状态点，给看板留出更多横向空间。"
                    checked={sidebarCollapsed}
                    onChange={setSidebarCollapsed}
                  />
                  <ToggleRow
                    title="收起右侧事项详情"
                    description="只保留窄条摘要，需要编辑时再展开。"
                    checked={detailPanelCollapsed}
                    onChange={setDetailPanelCollapsed}
                  />
                </SettingsCard>
              ) : null}

              {activeSection === "archive" ? (
                <SettingsCard title="项目归档" icon={<Archive className="h-4 w-4" />}>
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <Metric label="活跃项目" value={activeProjects.length} tone="text-feature" />
                    <Metric label="归档项目" value={archivedProjects.length} tone="text-muted" />
                  </div>
                  {archivedProjects.length > 0 ? (
                    <div className="space-y-2">
                      {archivedProjects.map((project) => (
                        <div key={project.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-3">
                          <button type="button" onClick={() => navigate(`/projects/${project.id}`)} className="min-w-0 text-left">
                            <span className="block truncate text-sm font-semibold">{project.name}</span>
                            <span className="mt-1 block truncate text-xs text-muted">{project.description || "暂无描述"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void restoreProject(project)}
                            className="focus-ring flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-semibold text-feature hover:bg-cyan-50"
                            aria-label={`恢复项目 ${project.name}`}
                            disabled={restoringId === project.id}
                          >
                            {restoringId === project.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            恢复
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-line px-3 py-8 text-center text-sm text-muted">暂无归档项目</div>
                  )}
                </SettingsCard>
              ) : null}

              {activeSection === "account" ? (
                <SettingsCard title="账号" icon={<Lock className="h-4 w-4" />}>
                  <InfoRow label="当前用户" value={me?.username ?? "-"} />
                  <InfoRow label="显示名称" value={me?.displayName ?? "-"} />
                  <InfoRow label="访问模式" value="私有单管理员" />
                </SettingsCard>
              ) : null}

              {activeSection === "integrations" ? (
                <SettingsCard title="集成状态" icon={<Settings2 className="h-4 w-4" />}>
                  {runtime ? <IntegrationSettingsForm runtime={runtime} projects={projects} onSaved={setRuntime} /> : null}
                </SettingsCard>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function parseSection(value: string | null): SettingsSection {
  return value === "archive" || value === "account" || value === "integrations" ? value : "layout";
}

function SettingsCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-white p-4 shadow-panel">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
        <span className="text-feature">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mb-3 flex items-center justify-between gap-4 rounded-md border border-line px-3 py-3 text-sm last:mb-0">
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-xs text-muted">{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-feature" aria-label={title} />
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2 text-sm last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

function IntegrationRow({
  icon,
  title,
  description,
  ok
}: {
  icon: ReactNode;
  title: string;
  description: string;
  ok: boolean;
}) {
  return (
    <div className="mb-3 flex items-start gap-3 rounded-md border border-line px-3 py-3 last:mb-0">
      <span className="mt-0.5 text-feature">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs text-muted">{description}</span>
      </span>
      <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${ok ? "bg-green-50 text-green-700" : "bg-slate-100 text-muted"}`}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        {ok ? "已配置" : "未配置"}
      </span>
    </div>
  );
}

function IntegrationSettingsForm({
  runtime,
  projects,
  onSaved
}: {
  runtime: RuntimeSettings;
  projects: ProjectSummary[];
  onSaved: (settings: RuntimeSettings) => void;
}) {
  const [githubToken, setGithubToken] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(runtime.openai.baseUrl);
  const [openaiModel, setOpenaiModel] = useState(runtime.openai.model ?? "");
  const [wechatAppId, setWechatAppId] = useState(runtime.wechatMiniProgram.appId);
  const [wechatAppSecret, setWechatAppSecret] = useState("");
  const [wechatName, setWechatName] = useState(runtime.wechatMiniProgram.name);
  const [wechatOriginalId, setWechatOriginalId] = useState(runtime.wechatMiniProgram.originalId);
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<IntegrationCheckResult[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [message, setMessage] = useState("");
  const githubProject = useMemo(
    () => projects.find((project) => !project.archived && project.repoUrl) ?? projects.find((project) => project.repoUrl) ?? null,
    [projects]
  );
  const draftProject = useMemo(
    () => projects.find((project) => !project.archived) ?? projects[0] ?? null,
    [projects]
  );

  useEffect(() => {
    setOpenaiBaseUrl(runtime.openai.baseUrl);
    setOpenaiModel(runtime.openai.model ?? "");
    setWechatAppId(runtime.wechatMiniProgram.appId);
    setWechatName(runtime.wechatMiniProgram.name);
    setWechatOriginalId(runtime.wechatMiniProgram.originalId);
  }, [runtime]);

  async function save() {
    setSaving(true);
    setChecking(false);
    setCheckResults([]);
    setMessage("");
    try {
      const next = await api.updateRuntimeSettings({
        github: githubToken.trim() ? { token: githubToken.trim() } : undefined,
        openai: {
          ...(openaiApiKey.trim() ? { apiKey: openaiApiKey.trim() } : {}),
          baseUrl: openaiBaseUrl.trim(),
          model: openaiModel.trim()
        },
        wechatMiniProgram: {
          appId: wechatAppId.trim(),
          ...(wechatAppSecret.trim() ? { appSecret: wechatAppSecret.trim() } : {}),
          name: wechatName.trim(),
          originalId: wechatOriginalId.trim()
        }
      });
      setGithubToken("");
      setOpenaiApiKey("");
      setWechatAppSecret("");
      onSaved(next);
      setSaving(false);
      setChecking(true);
      setMessage("配置已保存，正在验证 GitHub 和 OpenAI...");
      setCheckResults(await verifySavedIntegrations(githubProject, draftProject));
      setMessage("配置已保存，验证完成");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "保存配置失败");
    } finally {
      setSaving(false);
      setChecking(false);
    }
  }

  async function loadModels() {
    setLoadingModels(true);
    setModelsError("");
    try {
      const result = await api.listOpenAIModels();
      setModels(result.models);
      if (!openaiModel && result.models[0]) {
        setOpenaiModel(result.models[0]);
      }
    } catch (caught) {
      setModelsError(caught instanceof Error ? caught.message : "读取模型列表失败");
    } finally {
      setLoadingModels(false);
    }
  }

  async function clearSecret(kind: "github" | "openai" | "wechat") {
    setSaving(true);
    setChecking(false);
    setCheckResults([]);
    setMessage("");
    try {
      const next = await api.updateRuntimeSettings({
        github: kind === "github" ? { token: null } : undefined,
        openai: kind === "openai" ? { apiKey: null } : undefined,
        wechatMiniProgram: kind === "wechat" ? { appSecret: null } : undefined
      });
      onSaved(next);
      setMessage("配置已清除");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "清除配置失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-5"
    >
      <IntegrationRow
        icon={<Github className="h-4 w-4" />}
        title="GitHub 提交读取"
        description={runtime.github.token.configured ? `Token：${runtime.github.token.maskedValue}` : "未配置 token，仍可读取公开仓库但限额较低。"}
        ok={runtime.github.token.configured}
      />
      <SecretField
        label="GitHub token"
        value={githubToken}
        onChange={setGithubToken}
        placeholder="留空则保持不变"
        configured={runtime.github.token.configured}
        onClear={() => void clearSecret("github")}
      />

      <IntegrationRow
        icon={<Database className="h-4 w-4" />}
        title="OpenAI Responses"
        description={runtime.openai.configured ? `模型：${runtime.openai.model}` : "需要配置 API key 和模型。"}
        ok={runtime.openai.configured}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <TextField label="OpenAI base URL" value={openaiBaseUrl} onChange={setOpenaiBaseUrl} placeholder="https://api.openai.com/v1" />
        <div>
          <TextField label="OpenAI 模型" value={openaiModel} onChange={setOpenaiModel} placeholder="选择或输入模型 ID" list="openai-models" />
          <datalist id="openai-models">
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SecretField
          label="OpenAI API key"
          value={openaiApiKey}
          onChange={setOpenaiApiKey}
          placeholder="留空则保持不变"
          configured={runtime.openai.apiKey.configured}
          onClear={() => void clearSecret("openai")}
        />
        <button
          type="button"
          onClick={() => void loadModels()}
          disabled={loadingModels}
          className="focus-ring mt-5 flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-muted hover:bg-slate-50 disabled:opacity-60"
        >
          {loadingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          读取模型
        </button>
      </div>
      {modelsError ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{modelsError}</div> : null}

      <IntegrationRow
        icon={<Settings2 className="h-4 w-4" />}
        title="微信小程序"
        description={runtime.wechatMiniProgram.configured ? `AppID：${runtime.wechatMiniProgram.appId}` : "需要配置 AppID 和 AppSecret。"}
        ok={runtime.wechatMiniProgram.configured}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <TextField label="小程序名称" value={wechatName} onChange={setWechatName} placeholder="XM 小程序" />
        <TextField label="小程序 AppID" value={wechatAppId} onChange={setWechatAppId} placeholder="wx..." />
        <TextField label="小程序原始 ID" value={wechatOriginalId} onChange={setWechatOriginalId} placeholder="gh_..." />
        <SecretField
          label="小程序 AppSecret"
          value={wechatAppSecret}
          onChange={setWechatAppSecret}
          placeholder="留空则保持不变"
          configured={runtime.wechatMiniProgram.appSecret.configured}
          onClear={() => void clearSecret("wechat")}
        />
      </div>

      {message ? <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-muted">{message}</div> : null}
      <IntegrationCheckResults checking={checking} results={checkResults} />
      <button
        type="submit"
        disabled={saving || checking}
        className="focus-ring flex h-10 items-center gap-2 rounded-md bg-feature px-4 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
      >
        {saving || checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {saving ? "保存中" : checking ? "验证中" : "保存配置"}
      </button>
    </form>
  );
}

async function verifySavedIntegrations(
  githubProject: ProjectSummary | null,
  draftProject: ProjectSummary | null
): Promise<IntegrationCheckResult[]> {
  const results = await Promise.all([
    verifyGitHubCommitReading(githubProject),
    verifyOpenAIDraftGeneration(draftProject)
  ]);
  return results;
}

async function verifyGitHubCommitReading(project: ProjectSummary | null): Promise<IntegrationCheckResult> {
  if (!project) {
    return {
      id: "github",
      title: "GitHub 提交读取",
      status: "skipped",
      message: "当前没有配置 GitHub 仓库链接的项目。"
    };
  }

  try {
    const commits = await api.listGitHubCommits(project.id, { limit: 1, branch: project.defaultBranch ?? undefined });
    return {
      id: "github",
      title: "GitHub 提交读取",
      status: "success",
      message: commits.length > 0 ? `读取到 ${commits.length} 条提交。` : "请求成功，仓库暂未返回提交记录。"
    };
  } catch (caught) {
    return {
      id: "github",
      title: "GitHub 提交读取",
      status: "error",
      message: caught instanceof Error ? caught.message : "读取 GitHub 提交失败"
    };
  }
}

async function verifyOpenAIDraftGeneration(project: ProjectSummary | null): Promise<IntegrationCheckResult> {
  if (!project) {
    return {
      id: "openai",
      title: "OpenAI 草稿生成",
      status: "skipped",
      message: "当前没有可用于生成草稿的项目。"
    };
  }

  try {
    const draft = await api.generateWorkItemDraft(project.id, { input: integrationDraftVerificationInput });
    return {
      id: "openai",
      title: "OpenAI 草稿生成",
      status: "success",
      message: `已生成草稿“${draft.title}”。`
    };
  } catch (caught) {
    return {
      id: "openai",
      title: "OpenAI 草稿生成",
      status: "error",
      message: caught instanceof Error ? caught.message : "生成 OpenAI 草稿失败"
    };
  }
}

function IntegrationCheckResults({
  checking,
  results
}: {
  checking: boolean;
  results: IntegrationCheckResult[];
}) {
  if (checking) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-line bg-slate-50 px-3 py-2 text-sm text-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在验证 GitHub 提交读取和 OpenAI 草稿生成...
      </div>
    );
  }

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2" aria-label="集成验证结果">
      {results.map((result) => (
        <div key={result.id} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${checkResultClassName(result.status)}`}>
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{formatCheckResult(result)}</p>
        </div>
      ))}
    </div>
  );
}

function checkResultClassName(status: IntegrationCheckStatus): string {
  if (status === "success") {
    return "border-green-200 bg-green-50 text-green-700";
  }
  if (status === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function formatCheckResult(result: IntegrationCheckResult): string {
  if (result.status === "success") {
    return `${result.title}可用：${result.message}`;
  }
  if (result.status === "error") {
    return `${result.title}不可用：${result.message}`;
  }
  return `${result.title}未验证：${result.message}`;
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  list
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  list?: string;
}) {
  return (
    <label className="block text-xs font-semibold text-muted">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="input mt-1" placeholder={placeholder} list={list} />
    </label>
  );
}

function SecretField({
  label,
  value,
  onChange,
  placeholder,
  configured,
  onClear
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  configured: boolean;
  onClear: () => void;
}) {
  return (
    <label className="block min-w-[260px] flex-1 text-xs font-semibold text-muted">
      {label}
      <span className="mt-1 flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input"
          placeholder={configured ? placeholder : "输入后保存"}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onClear}
          disabled={!configured}
          className="focus-ring flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:text-muted disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清除
        </button>
      </span>
    </label>
  );
}
