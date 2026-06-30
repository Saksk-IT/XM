import type {
  CreateChecklistInput,
  CreateProjectInput,
  CreateWorkItemInput,
  GenerateWorkItemDraftInput,
  GeneratedWorkItemDraft,
  GitHubCommit,
  GitHubCommitListQuery,
  LoginInput,
  Me,
  ProjectDetail,
  ProjectSummary,
  RuntimeSettings,
  UpdateChecklistInput,
  UpdateProjectInput,
  UpdateRuntimeSettingsInput,
  UpdateWorkItemInput,
  WorkItem,
  WorkItemQuery
} from "@xm/shared";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new ApiError(data.message ?? "请求失败", response.status);
  }

  return data;
}

function json(method: string, payload?: unknown): RequestInit {
  return {
    method,
    body: payload === undefined ? undefined : JSON.stringify(payload)
  };
}

function queryString(query: WorkItemQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  return params.toString();
}

function optionalQueryString(query: Partial<Record<string, string | number | undefined>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

export const api = {
  login(input: LoginInput) {
    return apiFetch<Me>("/api/auth/login", json("POST", input));
  },
  logout() {
    return apiFetch<{ ok: boolean }>("/api/auth/logout", json("POST"));
  },
  me() {
    return apiFetch<Me>("/api/auth/me");
  },
  runtimeSettings() {
    return apiFetch<RuntimeSettings>("/api/settings/runtime");
  },
  updateRuntimeSettings(input: UpdateRuntimeSettingsInput) {
    return apiFetch<RuntimeSettings>("/api/settings/runtime", json("PATCH", input));
  },
  listOpenAIModels() {
    return apiFetch<{ models: string[] }>("/api/settings/openai/models");
  },
  listProjects(options: { includeArchived?: boolean } = {}) {
    const params = new URLSearchParams();
    if (options.includeArchived) {
      params.set("includeArchived", "true");
    }
    const qs = params.toString();
    return apiFetch<ProjectSummary[]>(`/api/projects${qs ? `?${qs}` : ""}`);
  },
  createProject(input: CreateProjectInput) {
    return apiFetch<ProjectDetail>("/api/projects", json("POST", input));
  },
  updateProject(id: string, input: UpdateProjectInput) {
    return apiFetch<ProjectDetail>(`/api/projects/${id}`, json("PATCH", input));
  },
  archiveProject(id: string) {
    return apiFetch<ProjectDetail>(`/api/projects/${id}/archive`, json("POST"));
  },
  getProject(id: string) {
    return apiFetch<ProjectDetail>(`/api/projects/${id}`);
  },
  listGitHubCommits(projectId: string, query: GitHubCommitListQuery = { limit: 20 }) {
    const qs = optionalQueryString(query);
    return apiFetch<GitHubCommit[]>(`/api/projects/${projectId}/github/commits${qs ? `?${qs}` : ""}`);
  },
  generateWorkItemDraft(projectId: string, input: GenerateWorkItemDraftInput) {
    return apiFetch<GeneratedWorkItemDraft>(`/api/projects/${projectId}/work-items/draft`, json("POST", input));
  },
  listItems(projectId: string, query: WorkItemQuery = {}) {
    const qs = queryString(query);
    return apiFetch<WorkItem[]>(`/api/projects/${projectId}/items${qs ? `?${qs}` : ""}`);
  },
  createItem(projectId: string, input: CreateWorkItemInput) {
    return apiFetch<WorkItem>(`/api/projects/${projectId}/items`, json("POST", input));
  },
  updateItem(id: string, input: UpdateWorkItemInput) {
    return apiFetch<WorkItem>(`/api/items/${id}`, json("PATCH", input));
  },
  deleteItem(id: string) {
    return apiFetch<void>(`/api/items/${id}`, json("DELETE"));
  },
  createChecklist(id: string, input: CreateChecklistInput) {
    return apiFetch<WorkItem>(`/api/items/${id}/checklist`, json("POST", input));
  },
  updateChecklist(id: string, input: UpdateChecklistInput) {
    return apiFetch<WorkItem>(`/api/checklist/${id}`, json("PATCH", input));
  },
  deleteChecklist(id: string) {
    return apiFetch<WorkItem>(`/api/checklist/${id}`, json("DELETE"));
  }
};
