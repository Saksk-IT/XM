import {
  Archive,
  Bug,
  CalendarDays,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Filter,
  Github,
  KanbanSquare,
  LayoutDashboard,
  List,
  ListChecks,
  Loader2,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  CreateProjectInput,
  CreateWorkItemInput,
  GeneratedWorkItemDraft,
  GitHubCommit,
  Me,
  Priority,
  ProjectDetail,
  ProjectSection,
  ProjectSummary,
  UpdateWorkItemInput,
  ViewMode,
  WorkItem,
  WorkItemStatus,
  WorkItemType
} from "@xm/shared";
import { priorityLabels, sectionLabels, statusLabels, typeLabels } from "@xm/shared";
import { api, ApiError } from "../api/client";
import { Field, Metric, Modal, ModalActions, PriorityBadge } from "../components/ui";
import { readStoredBoolean, writeStoredBoolean } from "../lib/storage";
import { splitTags } from "../lib/text";
import { boardColumns, checklistProgress, defaultViewMode, matchesColumn, matchesSection, searchItems } from "../lib/project";

type ItemPreset = {
  type: WorkItemType;
  status: WorkItemStatus;
};

const sectionOrder: ProjectSection[] = ["OVERVIEW", "PENDING_BUGS", "PENDING_FEATURES", "DONE_FEATURES", "DONE_BUGS"];
const priorityOptions: Array<Priority | "ALL"> = ["ALL", "HIGH", "MEDIUM", "LOW"];

export function DashboardPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [me, setMe] = useState<Me | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [activeSection, setActiveSection] = useState<ProjectSection>("OVERVIEW");
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "ALL">("ALL");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStoredBoolean("xm.sidebarCollapsed", false));
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(() => readStoredBoolean("xm.detailPanelCollapsed", false));
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectDetail | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemPreset, setItemPreset] = useState<ItemPreset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => writeStoredBoolean("xm.sidebarCollapsed", sidebarCollapsed), [sidebarCollapsed]);
  useEffect(() => writeStoredBoolean("xm.detailPanelCollapsed", detailPanelCollapsed), [detailPanelCollapsed]);

  const loadProjects = useCallback(async () => {
    const [active, all] = await Promise.all([api.listProjects(), api.listProjects({ includeArchived: true })]);
    setProjects(active);
    setArchivedCount(all.filter((candidate) => candidate.archived).length);
    if (!projectId && active[0]) {
      navigate(`/projects/${active[0].id}`, { replace: true });
    }
    return active;
  }, [navigate, projectId]);

  const loadProject = useCallback(async (id: string) => {
    const next = await api.getProject(id);
    setProject(next);
    return next;
  }, []);

  const refreshCurrentProject = useCallback(async () => {
    const active = await loadProjects();
    const currentId = projectId ?? active[0]?.id;
    if (currentId) {
      await loadProject(currentId);
    } else {
      setProject(null);
    }
  }, [loadProject, loadProjects, projectId]);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const currentUser = await api.me();
        if (!mounted) {
          return;
        }
        setMe(currentUser);
        await refreshCurrentProject();
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        setError(caught instanceof Error ? caught.message : "加载失败");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    void boot();
    return () => {
      mounted = false;
    };
  }, [navigate, refreshCurrentProject]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    setLoading(true);
    void loadProject(projectId)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "项目加载失败"))
      .finally(() => setLoading(false));
  }, [loadProject, projectId]);

  useEffect(() => {
    if (!project) {
      setSelectedItemId(null);
      return;
    }
    if (!project.workItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(project.workItems[0]?.id ?? null);
    }
  }, [project, selectedItemId]);

  const filteredItems = useMemo(() => {
    if (!project) {
      return [];
    }
    return searchItems(project.workItems, search, priorityFilter).filter((item) => matchesSection(item, activeSection));
  }, [activeSection, priorityFilter, project, search]);

  const selectedItem = useMemo(
    () => project?.workItems.find((item) => item.id === selectedItemId) ?? null,
    [project, selectedItemId]
  );

  async function createProject(input: CreateProjectInput) {
    const created = await api.createProject(input);
    setProjectModalOpen(false);
    await loadProjects();
    navigate(`/projects/${created.id}`);
  }

  async function updateProject(input: CreateProjectInput) {
    if (!editingProject) {
      return;
    }
    await api.updateProject(editingProject.id, input);
    setEditingProject(null);
    await refreshCurrentProject();
  }

  async function createItem(input: CreateWorkItemInput) {
    if (!project) {
      return;
    }
    const created = await api.createItem(project.id, input);
    setItemModalOpen(false);
    setSelectedItemId(created.id);
    await refreshCurrentProject();
  }

  async function updateItem(id: string, input: UpdateWorkItemInput) {
    const updated = await api.updateItem(id, input);
    setSelectedItemId(updated.id);
    await refreshCurrentProject();
  }

  async function archiveProject() {
    if (!project) {
      return;
    }
    await api.archiveProject(project.id);
    const active = await loadProjects();
    navigate(active[0] ? `/projects/${active[0].id}` : "/projects", { replace: true });
  }

  return (
    <main className="min-h-screen bg-slate-50 text-ink">
      <div
        className={`grid min-h-screen grid-cols-1 ${
          sidebarCollapsed && detailPanelCollapsed
            ? "lg:grid-cols-[72px_minmax(0,1fr)_56px]"
            : sidebarCollapsed
              ? "lg:grid-cols-[72px_minmax(0,1fr)_360px]"
              : detailPanelCollapsed
                ? "lg:grid-cols-[244px_minmax(0,1fr)_56px]"
                : "lg:grid-cols-[244px_minmax(0,1fr)_360px]"
        }`}
      >
        <ProjectSidebar
          projects={projects}
          archivedCount={archivedCount}
          collapsed={sidebarCollapsed}
          activeProjectId={project?.id ?? projectId ?? null}
          onProjectClick={(id) => navigate(`/projects/${id}`)}
          onNewProject={() => setProjectModalOpen(true)}
          onOpenSettings={(section) => navigate(section ? `/settings?section=${section}` : "/settings")}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
        />
        <section className="min-w-0 border-x border-line bg-white">
          <TopBar
            me={me}
            search={search}
            onSearch={setSearch}
            priorityFilter={priorityFilter}
            onPriorityFilter={setPriorityFilter}
            viewMode={viewMode}
            onViewMode={setViewMode}
            onNewItem={() => {
              setItemPreset(null);
              setItemModalOpen(true);
            }}
            onLogout={async () => {
              await api.logout();
              navigate("/login", { replace: true });
            }}
          />
          {error ? <div className="mx-4 mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {loading ? (
            <div className="flex h-[70vh] items-center justify-center text-sm text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载项目...
            </div>
          ) : project ? (
            <>
              <ProjectHeader project={project} onEdit={() => setEditingProject(project)} onArchive={archiveProject} />
              <SectionTabs activeSection={activeSection} project={project} onChange={setActiveSection} />
              <div className="h-[calc(100vh-282px)] overflow-y-auto p-4 scrollbar-thin">
                {activeSection === "OVERVIEW" ? <ProjectOverview project={project} /> : null}
                {viewMode === "BOARD" ? (
                  <BoardView
                    activeSection={activeSection}
                    items={filteredItems}
                    selectedItemId={selectedItemId}
                    onSelect={setSelectedItemId}
                    onMove={(id, target) => void updateItem(id, target)}
                    onNewItem={(preset) => {
                      setItemPreset(preset);
                      setItemModalOpen(true);
                    }}
                  />
                ) : (
                  <ListView items={filteredItems} selectedItemId={selectedItemId} onSelect={setSelectedItemId} />
                )}
              </div>
            </>
          ) : (
            <EmptyProjectState onNewProject={() => setProjectModalOpen(true)} />
          )}
        </section>
        <DetailPanel
          item={selectedItem}
          collapsed={detailPanelCollapsed}
          onToggleCollapse={() => setDetailPanelCollapsed((value) => !value)}
          onSave={updateItem}
          onDelete={async (id) => {
            await api.deleteItem(id);
            setSelectedItemId(null);
            await refreshCurrentProject();
          }}
          onChecklistAdd={async (id, title) => {
            await api.createChecklist(id, { title });
            await refreshCurrentProject();
          }}
          onChecklistUpdate={async (id, input) => {
            const updated = await api.updateChecklist(id, input);
            setSelectedItemId(updated.id);
            await refreshCurrentProject();
          }}
          onChecklistDelete={async (id) => {
            const updated = await api.deleteChecklist(id);
            setSelectedItemId(updated.id);
            await refreshCurrentProject();
          }}
        />
      </div>
      {projectModalOpen ? <ProjectModal title="新建项目" onClose={() => setProjectModalOpen(false)} onSubmit={createProject} /> : null}
      {editingProject ? (
        <ProjectModal title="编辑项目" project={editingProject} onClose={() => setEditingProject(null)} onSubmit={updateProject} />
      ) : null}
      {itemModalOpen && project ? (
        <ItemModal projectId={project.id} preset={itemPreset} onClose={() => setItemModalOpen(false)} onSubmit={createItem} />
      ) : null}
    </main>
  );
}

function ProjectSidebar({
  projects,
  archivedCount,
  collapsed,
  activeProjectId,
  onProjectClick,
  onNewProject,
  onOpenSettings,
  onToggleCollapse
}: {
  projects: ProjectSummary[];
  archivedCount: number;
  collapsed: boolean;
  activeProjectId: string | null;
  onProjectClick: (id: string) => void;
  onNewProject: () => void;
  onOpenSettings: (section?: "archive") => void;
  onToggleCollapse: () => void;
}) {
  return (
    <aside className={`flex max-h-[280px] flex-col border-b border-line bg-slate-50 lg:h-screen lg:max-h-none lg:border-b-0 ${collapsed ? "lg:w-[72px]" : "lg:w-[244px]"}`}>
      <div className={`flex h-[62px] items-center border-b border-line ${collapsed ? "justify-center px-2" : "justify-between px-5"}`}>
        <div className="text-2xl font-bold tracking-normal">{collapsed ? "X" : "XM"}</div>
        <button onClick={onToggleCollapse} className="focus-ring rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"} title={collapsed ? "展开侧边栏" : "收起侧边栏"}>
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>
      <div className={`flex items-center justify-between py-4 ${collapsed ? "px-3 lg:justify-center" : "px-5"}`}>
        <h2 className={`text-sm font-semibold ${collapsed ? "lg:hidden" : ""}`}>我的项目</h2>
        <button onClick={onNewProject} className="focus-ring rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="新建项目" title="新建项目">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4 scrollbar-thin">
        {projects.map((project) => (
          <button key={project.id} onClick={() => onProjectClick(project.id)} className={`focus-ring w-full rounded-md border px-3 py-3 text-left transition ${activeProjectId === project.id ? "border-cyan-200 bg-white shadow-panel ring-1 ring-cyan-100" : "border-transparent hover:border-line hover:bg-white"} ${collapsed ? "lg:px-2" : ""}`} title={project.name}>
            <div className={`flex items-center gap-2 ${collapsed ? "lg:justify-center" : ""}`}>
              <FileText className="h-4 w-4 shrink-0 text-slate-500" />
              <span className={`truncate text-sm font-semibold ${collapsed ? "lg:hidden" : ""}`}>{project.name}</span>
            </div>
            <div className={`mt-3 grid grid-cols-4 gap-2 text-xs text-muted ${collapsed ? "lg:grid-cols-2 lg:gap-y-1" : ""}`}>
              <CountDot color="bg-bug" value={project.stats.pendingBugs} />
              <CountDot color="bg-feature" value={project.stats.pendingFeatures} />
              <CountDot color="bg-done" value={project.stats.doneFeatures} />
              <CountDot color="bg-emerald-700" value={project.stats.doneBugs} />
            </div>
          </button>
        ))}
      </div>
      <div className="space-y-1 border-t border-line p-3">
        <button onClick={() => onOpenSettings("archive")} className={`focus-ring flex w-full items-center rounded-md px-3 py-2 text-sm text-muted hover:bg-white ${collapsed ? "justify-center px-2" : "justify-between"}`} aria-label="归档项目" title="归档项目">
          <span className="flex items-center gap-2"><Archive className="h-4 w-4" /><span className={collapsed ? "lg:hidden" : ""}>归档项目</span></span>
          <span className={`rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600 ${collapsed ? "lg:hidden" : ""}`}>{archivedCount}</span>
        </button>
        <button onClick={() => onOpenSettings()} className={`focus-ring flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted hover:bg-white ${collapsed ? "justify-center px-2" : ""}`} aria-label="设置" title="设置">
          <Settings2 className="h-4 w-4" /><span className={collapsed ? "lg:hidden" : ""}>设置</span>
        </button>
      </div>
    </aside>
  );
}

function TopBar({ me, search, onSearch, priorityFilter, onPriorityFilter, viewMode, onViewMode, onNewItem, onLogout }: {
  me: Me | null;
  search: string;
  onSearch: (value: string) => void;
  priorityFilter: Priority | "ALL";
  onPriorityFilter: (value: Priority | "ALL") => void;
  viewMode: ViewMode;
  onViewMode: (value: ViewMode) => void;
  onNewItem: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="flex min-h-[62px] flex-wrap items-center gap-3 border-b border-line px-4">
      <label className="focus-within:ring-feature/30 flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-line bg-slate-50 px-3 text-sm text-muted focus-within:bg-white focus-within:ring-2">
        <Search className="h-4 w-4 shrink-0" />
        <input value={search} onChange={(event) => onSearch(event.target.value)} className="w-full bg-transparent outline-none" placeholder="搜索任务、标题、标签或备注..." />
      </label>
      <label className="flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm text-muted">
        <Filter className="h-4 w-4" />
        <select value={priorityFilter} onChange={(event) => onPriorityFilter(event.target.value as Priority | "ALL")} className="bg-transparent text-sm text-ink outline-none" aria-label="优先级筛选">
          {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority === "ALL" ? "全部优先级" : `${priorityLabels[priority]}优先级`}</option>)}
        </select>
      </label>
      <div className="flex h-10 rounded-md border border-line p-1">
        <button onClick={() => onViewMode("BOARD")} className={`focus-ring flex items-center gap-1.5 rounded px-2.5 text-sm ${viewMode === "BOARD" ? "bg-slate-900 text-white" : "text-muted hover:bg-slate-100"}`}><KanbanSquare className="h-4 w-4" />看板</button>
        <button onClick={() => onViewMode("LIST")} className={`focus-ring flex items-center gap-1.5 rounded px-2.5 text-sm ${viewMode === "LIST" ? "bg-slate-900 text-white" : "text-muted hover:bg-slate-100"}`}><List className="h-4 w-4" />列表</button>
      </div>
      <button onClick={onNewItem} className="focus-ring flex h-10 items-center gap-2 rounded-md bg-feature px-4 text-sm font-semibold text-white hover:bg-cyan-700"><Plus className="h-4 w-4" />新建</button>
      <div className="ml-auto flex items-center gap-3 border-l border-line pl-4 text-sm text-muted">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{me?.displayName?.slice(0, 1) ?? "L"}</span>
        <button onClick={onLogout} className="focus-ring rounded-md p-1.5 hover:bg-slate-100" aria-label="退出登录"><LogOut className="h-4 w-4" /></button>
      </div>
    </header>
  );
}

function ProjectHeader({ project, onEdit, onArchive }: { project: ProjectDetail; onEdit: () => void; onArchive: () => void }) {
  return (
    <div className="border-b border-line px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-white shadow-panel" style={{ backgroundColor: project.color }}><LayoutDashboard className="h-6 w-6" /></div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-normal">{project.name}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">{project.description || "暂无项目描述"}</p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <ProjectLink icon={<Github className="h-4 w-4" />} label="仓库" href={project.repoUrl} />
              <ProjectLink icon={<ExternalLink className="h-4 w-4" />} label="部署" href={project.deployUrl} />
              <ProjectLink icon={<FileText className="h-4 w-4" />} label="文档" href={project.docsUrl} />
            </div>
          </div>
        </div>
        <div className="w-full max-w-md">
          <div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold">项目进度</span><span className="text-muted">总计 {project.stats.total}</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="flex h-full"><ProgressPart value={project.stats.pendingBugs} total={project.stats.total} className="bg-bug" /><ProgressPart value={project.stats.pendingFeatures} total={project.stats.total} className="bg-feature" /><ProgressPart value={project.stats.doneFeatures} total={project.stats.total} className="bg-done" /><ProgressPart value={project.stats.doneBugs} total={project.stats.total} className="bg-emerald-700" /></div></div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onEdit} className="focus-ring flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm hover:bg-slate-50"><Settings2 className="h-4 w-4" />编辑项目</button>
            <button onClick={onArchive} className="focus-ring flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-muted hover:bg-slate-50"><Archive className="h-4 w-4" />归档</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectOverview({ project }: { project: ProjectDetail }) {
  const recentItems = [...project.workItems].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 4);
  return (
    <section className="mb-4 space-y-3" aria-label="基础项目预览">
      <div className="grid gap-3 xl:grid-cols-4">
        <Metric label="完成率" value={`${project.stats.completionRate}%`} tone="text-done" />
        <Metric label="待修改 Bug" value={project.stats.pendingBugs} tone="text-bug" />
        <Metric label="待修改功能" value={project.stats.pendingFeatures} tone="text-feature" />
        <div className="rounded-md border border-line bg-white p-4 shadow-panel"><div className="mb-3 text-sm font-semibold">最近更新</div><div className="space-y-2">{recentItems.map((item) => <div key={item.id} className="truncate text-xs text-muted">{item.title}</div>)}</div></div>
      </div>
      <CommitActivity projectId={project.id} repoUrl={project.repoUrl} />
    </section>
  );
}

function CommitActivity({ projectId, repoUrl }: { projectId: string; repoUrl: string | null }) {
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCommits(await api.listGitHubCommits(projectId, { limit: 5 }));
    } catch (caught) {
      setCommits([]);
      setError(caught instanceof Error ? caught.message : "读取提交记录失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    if (repoUrl) {
      void load();
    }
  }, [load, repoUrl]);
  return (
    <section className="rounded-md border border-line bg-white p-4 shadow-panel" aria-label="代码动态">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Github className="h-4 w-4" />代码动态</h2>
        <button type="button" onClick={() => void load()} disabled={loading || !repoUrl} className="focus-ring flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-semibold text-muted hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />刷新</button>
      </div>
      {!repoUrl ? <div className="rounded-md border border-dashed border-line px-3 py-5 text-center text-sm text-muted">项目未配置 GitHub 仓库链接</div> : null}
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {repoUrl && !error && !loading && commits.length === 0 ? <div className="rounded-md border border-dashed border-line px-3 py-5 text-center text-sm text-muted">暂无提交记录</div> : null}
      <div className="divide-y divide-line">{commits.map((commit) => <a key={commit.sha} href={commit.url} className="focus-ring flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm hover:text-feature"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-muted">{commit.shortSha}</code><span className="min-w-0 flex-1 truncate font-semibold">{commit.title}</span><span className="text-xs text-muted">{commit.authorName}</span><span className="text-xs text-muted">{new Date(commit.authoredAt).toLocaleString()}</span><span className={`text-xs ${commit.verification.verified ? "text-done" : "text-muted"}`}>{commit.verification.verified ? "已验证" : "未验证"}</span></a>)}</div>
    </section>
  );
}

function BoardView({ activeSection, items, selectedItemId, onSelect, onMove, onNewItem }: {
  activeSection: ProjectSection;
  items: WorkItem[];
  selectedItemId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, target: ItemPreset) => void;
  onNewItem: (preset: ItemPreset) => void;
}) {
  const columns = activeSection === "OVERVIEW" ? boardColumns : boardColumns.filter((column) => column.id === activeSection);
  return <div className="grid gap-3 xl:grid-cols-4">{columns.map((column) => <section key={column.id} className="min-h-[360px] rounded-md bg-slate-50 p-2" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id) onMove(id, { type: column.type, status: column.status }); }}><div className="mb-2 flex h-9 items-center justify-between px-1"><h3 className="flex items-center gap-2 text-sm font-semibold">{sectionIcon(column.id)}{column.title}<span className="text-xs text-muted">{items.filter((item) => matchesColumn(item, column.id)).length}</span></h3><button onClick={() => onNewItem({ type: column.type, status: column.status })} className="focus-ring rounded-md p-1.5 text-muted hover:bg-white" aria-label={`添加${column.title}`}><Plus className="h-4 w-4" /></button></div><div className="space-y-2">{items.filter((item) => matchesColumn(item, column.id)).map((item) => <WorkItemCard key={item.id} item={item} selected={selectedItemId === item.id} onSelect={() => onSelect(item.id)} />)}</div></section>)}</div>;
}

function WorkItemCard({ item, selected, onSelect }: { item: WorkItem; selected: boolean; onSelect: () => void }) {
  return <article draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)} onClick={onSelect} className={`cursor-pointer rounded-md border bg-white p-3 shadow-panel transition hover:border-cyan-200 ${selected ? "border-cyan-300 ring-2 ring-cyan-100" : "border-line"}`}><div className="mb-3 flex items-start justify-between gap-2"><h4 className="line-clamp-2 text-sm font-semibold leading-5">{item.title}</h4><PriorityBadge priority={item.priority} /></div><div className="mb-3 flex flex-wrap gap-1.5">{item.tags.slice(0, 3).map((tag) => <span key={tag.id} className="rounded bg-slate-100 px-2 py-1 text-xs text-muted">{tag.name}</span>)}</div><div className="flex items-center justify-between text-xs text-muted"><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{item.dueDate ? item.dueDate.slice(0, 10) : "未设截止"}</span><span>{checklistProgress(item)}%</span></div></article>;
}

function ListView({ items, selectedItemId, onSelect }: { items: WorkItem[]; selectedItemId: string | null; onSelect: (id: string) => void }) {
  return <div className="overflow-x-auto rounded-md border border-line bg-white shadow-panel"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold text-muted"><tr><th className="px-4 py-3">标题</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">优先级</th><th className="px-4 py-3">标签</th><th className="px-4 py-3">截止日期</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} onClick={() => onSelect(item.id)} className={`cursor-pointer border-t border-line hover:bg-slate-50 ${selectedItemId === item.id ? "bg-cyan-50/60" : ""}`}><td className="max-w-[260px] truncate px-4 py-3 font-semibold">{item.title}</td><td className="px-4 py-3">{typeLabels[item.type]}</td><td className="px-4 py-3">{statusLabels[item.status]}</td><td className="px-4 py-3"><PriorityBadge priority={item.priority} /></td><td className="px-4 py-3 text-muted">{item.tags.map((tag) => tag.name).join("、") || "无"}</td><td className="px-4 py-3 text-muted">{item.dueDate ? item.dueDate.slice(0, 10) : "未设截止"}</td></tr>)}</tbody></table>{items.length === 0 ? <div className="p-8 text-center text-sm text-muted">没有符合条件的事项</div> : null}</div>;
}

function DetailPanel({ item, collapsed, onToggleCollapse, onSave, onDelete, onChecklistAdd, onChecklistUpdate, onChecklistDelete }: {
  item: WorkItem | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSave: (id: string, input: UpdateWorkItemInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onChecklistAdd: (id: string, title: string) => Promise<void>;
  onChecklistUpdate: (id: string, input: { done?: boolean; title?: string }) => Promise<void>;
  onChecklistDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<WorkItemType>("FEATURE");
  const [status, setStatus] = useState<WorkItemStatus>("PENDING");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tagNames, setTagNames] = useState("");
  const [checkTitle, setCheckTitle] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (item) { setTitle(item.title); setDescription(item.description); setType(item.type); setStatus(item.status); setPriority(item.priority); setNotes(item.notes); setDueDate(item.dueDate ? item.dueDate.slice(0, 10) : ""); setTagNames(item.tags.map((tag) => tag.name).join("，")); } }, [item]);
  if (collapsed) {
    return <aside className="hidden border-l border-line bg-white lg:flex lg:h-screen lg:w-[56px] lg:flex-col lg:items-center lg:gap-3 lg:py-4"><button type="button" onClick={onToggleCollapse} className="focus-ring rounded-md p-2 text-muted hover:bg-slate-100" aria-label="展开事项详情" title="展开事项详情"><PanelRightOpen className="h-5 w-5" /></button>{item ? <div className="max-h-[260px] w-8 rotate-180 overflow-hidden text-ellipsis text-center text-xs font-semibold text-slate-600 [writing-mode:vertical-rl]" title={item.title}>{item.title}</div> : null}</aside>;
  }
  if (!item) {
    return <aside className="hidden border-l border-line bg-white p-6 lg:block"><div className="mb-4 flex justify-end"><button type="button" onClick={onToggleCollapse} className="focus-ring rounded-md p-2 text-muted hover:bg-slate-100" aria-label="收起事项详情" title="收起事项详情"><PanelRightClose className="h-5 w-5" /></button></div><div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">选择一个事项后可查看详情</div></aside>;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(item!.id, { title, description, type, status, priority, notes, dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : null, tagNames: splitTags(tagNames) });
    } finally {
      setSaving(false);
    }
  }
  return <aside className="border-l border-line bg-white lg:h-screen lg:overflow-y-auto scrollbar-thin"><form onSubmit={submit} className="p-5"><div className="mb-5 flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted">事项详情</p><h2 className="mt-1 truncate text-xl font-bold">{item.title}</h2></div><button type="button" onClick={onToggleCollapse} className="focus-ring rounded-md p-1.5 text-muted hover:bg-slate-100" aria-label="收起事项详情" title="收起事项详情"><PanelRightClose className="h-4 w-4" /></button></div><Field label="标题"><input value={title} onChange={(event) => setTitle(event.target.value)} className="input" /></Field><Field label="描述"><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="input min-h-20" /></Field><ItemFields type={type} status={status} priority={priority} dueDate={dueDate} onType={setType} onStatus={setStatus} onPriority={setPriority} onDueDate={setDueDate} /><Field label="标签"><input value={tagNames} onChange={(event) => setTagNames(event.target.value)} className="input" /></Field><Field label="备注"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="input min-h-24" /></Field><div className="mb-5 rounded-md border border-line p-3"><div className="mb-3 flex items-center justify-between text-sm"><span className="font-semibold">清单</span><span className="text-muted">{checklistProgress(item)}%</span></div><div className="space-y-2">{item.checklist.map((check) => <label key={check.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={check.done} onChange={(event) => void onChecklistUpdate(check.id, { done: event.target.checked })} className="h-4 w-4 accent-feature" /><span className={check.done ? "flex-1 text-muted line-through" : "flex-1"}>{check.title}</span><button type="button" onClick={() => void onChecklistDelete(check.id)} className="focus-ring rounded p-1 text-muted hover:bg-slate-100" aria-label={`删除清单 ${check.title}`}><Trash2 className="h-3.5 w-3.5" /></button></label>)}</div><div className="mt-3 flex gap-2"><input value={checkTitle} onChange={(event) => setCheckTitle(event.target.value)} className="input h-9 flex-1" placeholder="添加清单项" /><button type="button" className="focus-ring rounded-md border border-line px-3 text-sm hover:bg-slate-50" onClick={() => { if (checkTitle.trim()) void onChecklistAdd(item.id, checkTitle.trim()).then(() => setCheckTitle("")); }}>添加</button></div></div><div className="sticky bottom-0 flex gap-2 border-t border-line bg-white py-4"><button type="submit" disabled={saving} className="focus-ring flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-feature px-4 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}保存</button><button type="button" onClick={() => void onDelete(item.id)} className="focus-ring flex h-10 items-center justify-center rounded-md border border-line px-3 text-red-600 hover:bg-red-50" aria-label="删除事项"><Trash2 className="h-4 w-4" /></button></div></form></aside>;
}

function ProjectModal({ title, project, onClose, onSubmit }: { title: string; project?: ProjectDetail; onClose: () => void; onSubmit: (input: CreateProjectInput) => Promise<void> }) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [repoUrl, setRepoUrl] = useState(project?.repoUrl ?? "");
  const [repoPath, setRepoPath] = useState(project?.repoPath ?? "");
  const [deployUrl, setDeployUrl] = useState(project?.deployUrl ?? "");
  const [docsUrl, setDocsUrl] = useState(project?.docsUrl ?? "");
  const [color, setColor] = useState(project?.color ?? "#0891b2");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); try { await onSubmit({ name, description, repoUrl, repoPath, deployUrl, docsUrl, color }); } finally { setSaving(false); } }
  return <Modal title={title} onClose={onClose}><form onSubmit={submit}><Field label="项目名称"><input value={name} onChange={(event) => setName(event.target.value)} className="input" required /></Field><Field label="项目描述"><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="input min-h-20" /></Field><Field label="仓库链接"><input value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} className="input" /></Field><Field label="本地仓库路径"><input value={repoPath} onChange={(event) => setRepoPath(event.target.value)} className="input" /></Field><Field label="部署链接"><input value={deployUrl} onChange={(event) => setDeployUrl(event.target.value)} className="input" /></Field><Field label="文档链接"><input value={docsUrl} onChange={(event) => setDocsUrl(event.target.value)} className="input" /></Field><Field label="项目颜色"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-10 w-20 rounded-md border border-line bg-white p-1" /></Field><ModalActions onClose={onClose} saving={saving} /></form></Modal>;
}

function ItemModal({ projectId, preset, onClose, onSubmit }: { projectId: string; preset: ItemPreset | null; onClose: () => void; onSubmit: (input: CreateWorkItemInput) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<WorkItemType>(preset?.type ?? "FEATURE");
  const [status, setStatus] = useState<WorkItemStatus>(preset?.status ?? "PENDING");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [tagNames, setTagNames] = useState("");
  const [checklist, setChecklist] = useState("");
  const [notes, setNotes] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [draftError, setDraftError] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  function applyDraft(draft: GeneratedWorkItemDraft) { setTitle(draft.title); setDescription(draft.description); setType(draft.type); setStatus(draft.status); setPriority(draft.priority); setNotes(draft.notes); setTagNames(draft.tagNames.join("，")); setChecklist(draft.checklist.join("\n")); }
  async function generateDraft() { setDrafting(true); setDraftError(""); try { applyDraft(await api.generateWorkItemDraft(projectId, { input: rawInput })); } catch (caught) { setDraftError(caught instanceof Error ? caught.message : "整理草稿失败"); } finally { setDrafting(false); } }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); try { await onSubmit({ title, description, type, status, priority, notes, dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : null, tagNames: splitTags(tagNames), checklist: checklist.split("\n").map((line) => line.trim()).filter(Boolean) }); } finally { setSaving(false); } }
  return <Modal title="新建事项" onClose={onClose}><form onSubmit={submit}><section className="mb-4 rounded-md border border-line bg-slate-50 p-3"><Field label="原始描述"><textarea value={rawInput} onChange={(event) => setRawInput(event.target.value)} className="input min-h-20" placeholder="粘贴功能想法、Bug 现象或待办说明" /></Field>{draftError ? <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{draftError}</div> : null}<button type="button" onClick={() => void generateDraft()} disabled={drafting || rawInput.trim().length < 10} className="focus-ring flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50 disabled:opacity-50">{drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}整理草稿</button></section><Field label="标题"><input value={title} onChange={(event) => setTitle(event.target.value)} className="input" required /></Field><Field label="描述"><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="input min-h-20" /></Field><ItemFields type={type} status={status} priority={priority} dueDate={dueDate} onType={setType} onStatus={setStatus} onPriority={setPriority} onDueDate={setDueDate} /><Field label="标签"><input value={tagNames} onChange={(event) => setTagNames(event.target.value)} className="input" /></Field><Field label="备注"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="input min-h-20" /></Field><Field label="清单，每行一个"><textarea value={checklist} onChange={(event) => setChecklist(event.target.value)} className="input min-h-20" /></Field><ModalActions onClose={onClose} saving={saving} /></form></Modal>;
}

function ItemFields({ type, status, priority, dueDate, onType, onStatus, onPriority, onDueDate }: { type: WorkItemType; status: WorkItemStatus; priority: Priority; dueDate: string; onType: (value: WorkItemType) => void; onStatus: (value: WorkItemStatus) => void; onPriority: (value: Priority) => void; onDueDate: (value: string) => void }) {
  return <div className="grid grid-cols-2 gap-3"><Field label="类型"><select value={type} onChange={(event) => onType(event.target.value as WorkItemType)} className="input"><option value="FEATURE">功能</option><option value="BUG">Bug</option></select></Field><Field label="状态"><select value={status} onChange={(event) => onStatus(event.target.value as WorkItemStatus)} className="input"><option value="PENDING">待处理</option><option value="IN_PROGRESS">进行中</option><option value="DONE">已完成</option></select></Field><Field label="优先级"><select value={priority} onChange={(event) => onPriority(event.target.value as Priority)} className="input"><option value="HIGH">高</option><option value="MEDIUM">中</option><option value="LOW">低</option></select></Field><Field label="截止日期"><input type="date" value={dueDate} onChange={(event) => onDueDate(event.target.value)} className="input" /></Field></div>;
}

function SectionTabs({ activeSection, project, onChange }: { activeSection: ProjectSection; project: ProjectDetail; onChange: (section: ProjectSection) => void }) {
  const counts: Record<ProjectSection, number> = { OVERVIEW: project.stats.total, PENDING_BUGS: project.stats.pendingBugs, PENDING_FEATURES: project.stats.pendingFeatures, DONE_FEATURES: project.stats.doneFeatures, DONE_BUGS: project.stats.doneBugs };
  return <nav className="flex gap-2 overflow-x-auto border-b border-line px-4 scrollbar-thin" aria-label="项目分区">{sectionOrder.map((section) => <button key={section} onClick={() => onChange(section)} className={`focus-ring flex h-14 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium ${activeSection === section ? "border-feature text-feature" : "border-transparent text-muted hover:text-ink"}`}>{sectionIcon(section)}{sectionLabels[section]}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-muted">{counts[section]}</span></button>)}</nav>;
}

function sectionIcon(section: ProjectSection) {
  switch (section) {
    case "OVERVIEW":
      return <LayoutDashboard className="h-4 w-4" />;
    case "PENDING_BUGS":
      return <Bug className="h-4 w-4 text-bug" />;
    case "PENDING_FEATURES":
      return <List className="h-4 w-4 text-feature" />;
    case "DONE_FEATURES":
      return <CheckCircle2 className="h-4 w-4 text-done" />;
    case "DONE_BUGS":
      return <Bug className="h-4 w-4 text-done" />;
  }
}

function CountDot({ color, value }: { color: string; value: number }) {
  return <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${color}`} />{value}</span>;
}

function ProgressPart({ value, total, className }: { value: number; total: number; className: string }) {
  return total === 0 || value === 0 ? null : <div className={className} style={{ width: `${(value / total) * 100}%` }} />;
}

function ProjectLink({ icon, label, href }: { icon: ReactNode; label: string; href: string | null }) {
  return href ? <a className="focus-ring flex items-center gap-1.5 rounded-md text-blue-600 hover:text-blue-700" href={href}>{icon}{label}<ExternalLink className="h-3.5 w-3.5" /></a> : null;
}

function EmptyProjectState({ onNewProject }: { onNewProject: () => void }) {
  return <div className="flex h-[70vh] items-center justify-center p-8"><div className="max-w-sm rounded-md border border-dashed border-line bg-white p-8 text-center"><Circle className="mx-auto mb-4 h-8 w-8 text-feature" /><h2 className="text-lg font-bold">还没有项目</h2><p className="mt-2 text-sm text-muted">创建第一个项目后，就可以维护 Bug、功能和已实现事项。</p><button onClick={onNewProject} className="focus-ring mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-feature px-4 text-sm font-semibold text-white hover:bg-cyan-700"><Plus className="h-4 w-4" />新建项目</button></div></div>;
}
